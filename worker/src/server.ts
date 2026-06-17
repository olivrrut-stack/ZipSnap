/**
 * ZipSnap — capture worker HTTP API.
 *
 * The website uploads an extension .zip here; this service unpacks it, runs the
 * full pipeline (capture -> AI copy -> render) in a per-job folder, and serves
 * progress, image previews, and the finished kit zip. Kept separate from the
 * web frontend on purpose: this needs a real machine (persistent Chrome).
 *
 * Run:  npm run server   (listens on PORT, default 4000)
 */
import dotenv from "dotenv";
import path from "node:path";
import os from "node:os";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile, rm, stat } from "node:fs/promises";
import { existsSync, readdirSync } from "node:fs";
import express from "express";
import cors from "cors";
import multer from "multer";
import rateLimit from "express-rate-limit";
import AdmZip from "adm-zip";
import { runCapture, runRender, isValidHex } from "./pipeline";
import { generateStoreCopy, type StoreCopy } from "./copy";
import { generateIcons } from "./iconGeneration";
import type { CaptureResult } from "./types";
import type { Page } from "playwright";

dotenv.config({ path: path.resolve(__dirname, "..", "..", ".env") });
dotenv.config({ path: path.resolve(__dirname, "..", ".env") });

// The server always captures in new headless mode: no windows, clean shutdown.
process.env.ZIPSNAP_HEADLESS = "1";

const PORT = Number(process.env.PORT ?? 4000);
const JOBS_DIR = path.join(os.tmpdir(), "zipsnap-jobs");
const DEFAULT_COLOR = "#64748b";

type JobStatus =
  | "queued"
  | "capturing"
  | "awaiting-login"
  | "writing"
  | "rendering"
  | "packaging"
  | "done"
  | "error";

interface Job {
  id: string;
  status: JobStatus;
  step: string;
  error?: string;
  dir: string;
  extPath: string;
  outputDir: string;
  kitDir?: string;
  kitZipPath?: string;
  images: string[];
  capture?: CaptureResult;
  copy?: StoreCopy;
  iconsDir?: string;
  iconFiles?: string[];
  rerendering?: boolean;
  loginPage?: Page;               // live Playwright page held during awaiting-login
  loginResolver?: () => void;     // resolves the pause promise when user clicks Done
  loginTimeout?: ReturnType<typeof setTimeout>;
  snapPending?: boolean;          // throttle: true while a screenshot is being encoded
  lastSnapshot?: Buffer;          // last JPEG frame, returned while snapPending is true
}

const jobs = new Map<string, Job>();

/** Finds the folder that actually contains manifest.json (zip may nest it). */
function findManifestDir(root: string, depth = 2): string | null {
  if (existsSync(path.join(root, "manifest.json"))) return root;
  if (depth <= 0) return null;
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (entry.isDirectory() && !entry.name.startsWith("__MACOSX")) {
      const found = findManifestDir(path.join(root, entry.name), depth - 1);
      if (found) return found;
    }
  }
  return null;
}

/** Plain-text descriptions file bundled into the kit zip. */
function descriptionsText(name: string, copy: StoreCopy): string {
  const flaggedSection = copy.permissionsAnalysis?.flagged?.length
    ? [
        `FLAGGED PERMISSIONS:`,
        ...copy.permissionsAnalysis.flagged.map((f) =>
          [
            `  ${f.permission}: ${f.reason}`,
            `  → ${f.suggestion}`,
            f.listingJustification ? `  Paste into listing: "${f.listingJustification}"` : "",
          ].filter(Boolean).join("\n")
        ),
        ``,
      ]
    : [];

  return [
    `${name} — Chrome Web Store listing`,
    ``,
    `TITLE (max 45 chars):`,
    copy.title ?? "",
    ``,
    `CATEGORY: ${copy.suggestedCategory}`,
    ``,
    `SHORT DESCRIPTION:`,
    copy.shortDescription,
    ``,
    `LONG DESCRIPTION:`,
    copy.longDescription,
    ``,
    `KEYWORDS:`,
    (copy.keywords ?? []).join(", "),
    ``,
    `SCREENSHOT HEADLINES:`,
    ...(copy.slideHeadlines ?? []).map((h, i) => `${i + 1}. ${h}`),
    ``,
    `PERMISSIONS ANALYSIS:`,
    `  Safe: ${(copy.permissionsAnalysis?.safe ?? []).join(", ") || "(none)"}`,
    ...flaggedSection,
    `PRIVACY POLICY:`,
    copy.privacyPolicy ?? "",
    ``,
  ].join("\n");
}

/** Zips the kit and icon folders into a single downloadable archive. */
async function packageKit(job: Job, kitDir: string, iconsDir: string | undefined): Promise<void> {
  const zip = new AdmZip();
  zip.addLocalFolder(kitDir);
  if (iconsDir) zip.addLocalFolder(iconsDir, "icons");
  zip.addFile(
    "descriptions.txt",
    Buffer.from(descriptionsText(job.capture!.extension.name, job.copy!), "utf8"),
  );
  const zipPath = path.join(job.dir, "zipsnap-kit.zip");
  zip.writeZip(zipPath);
  job.kitZipPath = zipPath;
}

/** Runs the whole pipeline for one job, updating its status as it goes. */
async function processJob(job: Job): Promise<void> {
  try {
    job.status = "capturing";
    const capture = await runCapture(job.extPath, job.outputDir, (s) => (job.step = s), {
      onLoginNeeded: async (page, url) => {
        const host = (() => { try { return new URL(url).host; } catch { return url; } })();
        job.status = "awaiting-login";
        job.step = `Sign in to ${host} in the browser below`;
        job.loginPage = page;
        await new Promise<void>((resolve, reject) => {
          job.loginResolver = resolve;
          job.loginTimeout = setTimeout(
            () => reject(new Error("Login timed out — complete sign-in within 5 minutes and try again.")),
            5 * 60 * 1000,
          );
        });
        clearTimeout(job.loginTimeout);
        job.loginPage = undefined;
        job.loginResolver = undefined;
        job.lastSnapshot = undefined;
        job.status = "capturing";
        job.step = "Resuming capture";
      },
    });
    job.capture = capture;

    job.status = "writing";
    job.step = "Writing the store listing with AI";
    const copy = await generateStoreCopy(capture);
    job.copy = copy;
    await writeFile(path.join(job.outputDir, "copy.json"), JSON.stringify(copy, null, 2), "utf8");

    job.status = "rendering";
    const { kitDir, files } = await runRender(capture, copy, job.outputDir, (s) => (job.step = s), DEFAULT_COLOR);
    job.kitDir = kitDir;
    job.images = files.map((f) => path.basename(f));

    job.step = "Generating icons";
    let iconsDir: string | undefined;
    try {
      const iconResult = await generateIcons(
        capture.extension.name,
        capture.extension.description,
        DEFAULT_COLOR,
        job.outputDir,
      );
      job.iconsDir = iconResult.iconsDir;
      job.iconFiles = iconResult.files;
      iconsDir = iconResult.iconsDir;
    } catch {
      // Icon generation is best-effort — a failure here doesn't fail the job.
    }

    job.status = "packaging";
    job.step = "Packaging the kit";
    await packageKit(job, kitDir, iconsDir);
    job.status = "done";
    job.step = "Done";
  } catch (err) {
    job.status = "error";
    job.error = err instanceof Error ? err.message : String(err);
  }
}

// --- Concurrency queue ---------------------------------------------------
// Each job launches a real Chromium, so running many at once exhausts the
// box's CPU/RAM. Cap how many run concurrently; the rest wait in "queued"
// (a status the poll endpoint and UI already understand).
const MAX_CONCURRENT_JOBS = Math.max(1, Number(process.env.ZIPSNAP_MAX_CONCURRENCY ?? 2));
// Hard cap on how many jobs may wait at once, so a flood can't grow the
// in-memory job map without bound. Beyond this, new jobs are refused with 503.
const MAX_PENDING_JOBS = 50;

let activeJobs = 0;
const pendingQueue: Job[] = [];

/** Starts queued jobs up to the concurrency cap, refilling as each finishes. */
function pumpQueue(): void {
  while (activeJobs < MAX_CONCURRENT_JOBS && pendingQueue.length > 0) {
    const job = pendingQueue.shift()!;
    activeJobs++;
    void processJob(job).finally(() => {
      activeJobs--;
      pumpQueue();
    });
  }
}

// --- Zip-bomb guard ------------------------------------------------------
// A small compressed upload can legally decompress to many gigabytes. Inspect
// the entries before extracting and refuse anything that would blow up disk/RAM.
const MAX_UNZIPPED_BYTES = 250 * 1024 * 1024; // generous for a real extension
const MAX_ENTRIES = 5000;
const MAX_COMPRESSION_RATIO = 200;

interface ZipGuardResult {
  ok: boolean;
  status?: number;
  error?: string;
}

/** Validates an already-parsed zip is not a decompression bomb. */
function inspectZip(zip: AdmZip, compressedBytes: number): ZipGuardResult {
  const entries = zip.getEntries();
  if (entries.length > MAX_ENTRIES) {
    return { ok: false, status: 413, error: `Too many files in zip (max ${MAX_ENTRIES}).` };
  }
  let totalUnzipped = 0;
  for (const entry of entries) {
    totalUnzipped += entry.header.size;
    if (totalUnzipped > MAX_UNZIPPED_BYTES) {
      return { ok: false, status: 413, error: "Zip contents are too large when unpacked." };
    }
  }
  if (compressedBytes > 0 && totalUnzipped / compressedBytes > MAX_COMPRESSION_RATIO) {
    return { ok: false, status: 413, error: "Zip compression ratio is suspiciously high." };
  }
  return { ok: true };
}

const app = express();
// Deployed behind a single proxy hop (e.g. Railway). Trust exactly one hop so
// express-rate-limit keys on the real client IP instead of the proxy's, without
// blindly trusting a spoofable X-Forwarded-For chain.
app.set("trust proxy", 1);
app.use(cors());
// Real unpacked extensions are a few MB; cap uploads low to bound the RAM held
// per request by multer.memoryStorage() and to shrink the abuse surface.
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });

// Each job launches a real Chrome instance and calls the Anthropic API, so
// cap how often a single client can start new jobs.
const createJobLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many jobs from this address. Please try again later." },
});

const rerenderLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many rerender requests. Please wait a moment." },
});

const loginInteractionLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 300, // ~5 req/sec — covers 300 ms snapshot polling + interaction
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many browser interaction requests. Please slow down." },
});

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, hasApiKey: Boolean(process.env.ANTHROPIC_API_KEY) });
});

// Upload a .zip -> start a job.
app.post("/api/jobs", createJobLimiter, upload.single("extension"), async (req, res) => {
  try {
    if (!req.file) {
      res.status(400).json({ error: "No file uploaded. Send a .zip in the 'extension' field." });
      return;
    }

    // Refuse new work if the wait queue is already saturated.
    if (pendingQueue.length >= MAX_PENDING_JOBS) {
      res.status(503).json({ error: "Server is busy right now. Please try again in a few minutes." });
      return;
    }

    // Parse and vet the zip (bomb guard) before touching the disk.
    let zip: AdmZip;
    try {
      zip = new AdmZip(req.file.buffer);
    } catch {
      res.status(400).json({ error: "Invalid or corrupt zip file." });
      return;
    }
    const guard = inspectZip(zip, req.file.size);
    if (!guard.ok) {
      res.status(guard.status ?? 413).json({ error: guard.error });
      return;
    }

    const id = randomUUID();
    const dir = path.join(JOBS_DIR, id);
    const extRoot = path.join(dir, "extension");
    await mkdir(extRoot, { recursive: true });

    zip.extractAllTo(extRoot, true);
    const extPath = findManifestDir(extRoot);
    if (!extPath) {
      await rm(dir, { recursive: true, force: true }).catch(() => {});
      res.status(400).json({ error: "No manifest.json found in that zip — is it an unpacked extension?" });
      return;
    }

    const job: Job = {
      id,
      status: "queued",
      step: "Queued",
      dir,
      extPath,
      outputDir: path.join(dir, "output"),
      images: [],
    };
    jobs.set(id, job);
    pendingQueue.push(job); // wait for a free slot; client polls for status
    pumpQueue();

    res.status(202).json({ jobId: id });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Upload failed." });
  }
});

// Poll job status.
app.get("/api/jobs/:id", (req, res) => {
  const job = jobs.get(req.params.id);
  if (!job) {
    res.status(404).json({ error: "No such job." });
    return;
  }
  res.json({
    id: job.id,
    status: job.status,
    step: job.step,
    error: job.error,
    extensionName: job.capture?.extension.name,
    brandColor: job.capture?.brandColor,
    images: job.status === "done" ? job.images : [],
    copy: job.status === "done" ? job.copy : undefined,
    manifestHealth: job.status === "done" ? job.capture?.manifestHealth : undefined,
    iconKit: job.status === "done" && job.iconFiles?.length
      ? { files: job.iconFiles }
      : undefined,
  });
});

// Preview a single rendered image.
app.get("/api/jobs/:id/image/:name", (req, res) => {
  const job = jobs.get(req.params.id);
  if (!job?.kitDir || !job.images.includes(req.params.name)) {
    res.status(404).end();
    return;
  }
  res.sendFile(path.join(job.kitDir, req.params.name), { dotfiles: "allow" });
});

// Preview a generated icon at a specific size.
app.get("/api/jobs/:id/icon/:name", (req, res) => {
  const job = jobs.get(req.params.id);
  if (!job?.iconsDir || !job.iconFiles?.includes(req.params.name)) {
    res.status(404).end();
    return;
  }
  res.sendFile(path.join(job.iconsDir, req.params.name), { dotfiles: "allow" });
});

// Stream a JPEG snapshot of the live login browser view.
app.get("/api/jobs/:id/browser-snapshot", loginInteractionLimiter, async (req: express.Request<{ id: string }>, res) => {
  const job = jobs.get(req.params.id);
  if (!job || job.status !== "awaiting-login" || !job.loginPage) {
    res.status(409).end();
    return;
  }
  // If a screenshot is already being encoded, return the last frame immediately.
  if (job.snapPending && job.lastSnapshot) {
    res.set("Content-Type", "image/jpeg");
    res.send(job.lastSnapshot);
    return;
  }
  job.snapPending = true;
  try {
    const buf = await job.loginPage.screenshot({ type: "jpeg", quality: 60 });
    job.lastSnapshot = buf;
    res.set("Content-Type", "image/jpeg");
    res.send(buf);
  } catch {
    res.status(500).end();
  } finally {
    job.snapPending = false;
  }
});

// Relay a mouse click to the login browser.
app.post("/api/jobs/:id/browser-click", loginInteractionLimiter, express.json(), async (req: express.Request<{ id: string }>, res) => {
  const job = jobs.get(req.params.id);
  if (!job || job.status !== "awaiting-login" || !job.loginPage) {
    res.status(409).json({ error: "No active login session." });
    return;
  }
  const { xFrac, yFrac } = req.body as { xFrac?: unknown; yFrac?: unknown };
  if (
    typeof xFrac !== "number" || typeof yFrac !== "number" ||
    xFrac < 0 || xFrac > 1 || yFrac < 0 || yFrac > 1
  ) {
    res.status(400).json({ error: "xFrac and yFrac must be numbers between 0 and 1." });
    return;
  }
  await job.loginPage.mouse.click(Math.round(xFrac * 1280), Math.round(yFrac * 800));
  res.json({ ok: true });
});

// Relay a keystroke to the login browser.
app.post("/api/jobs/:id/browser-type", loginInteractionLimiter, express.json(), async (req: express.Request<{ id: string }>, res) => {
  const job = jobs.get(req.params.id);
  if (!job || job.status !== "awaiting-login" || !job.loginPage) {
    res.status(409).json({ error: "No active login session." });
    return;
  }
  const { text } = req.body as { text?: unknown };
  if (typeof text !== "string" || text.length === 0 || text.length > 200) {
    res.status(400).json({ error: "text must be a non-empty string of up to 200 characters." });
    return;
  }
  if (text === "Backspace") {
    await job.loginPage.keyboard.press("Backspace");
  } else if (text === "Enter") {
    await job.loginPage.keyboard.press("Enter");
  } else {
    await job.loginPage.keyboard.type(text);
  }
  res.json({ ok: true });
});

// Relay a scroll event to the login browser.
app.post("/api/jobs/:id/browser-scroll", loginInteractionLimiter, express.json(), async (req: express.Request<{ id: string }>, res) => {
  const job = jobs.get(req.params.id);
  if (!job || job.status !== "awaiting-login" || !job.loginPage) {
    res.status(409).json({ error: "No active login session." });
    return;
  }
  const { deltaY } = req.body as { deltaY?: unknown };
  if (typeof deltaY !== "number") {
    res.status(400).json({ error: "deltaY must be a number." });
    return;
  }
  await job.loginPage.mouse.wheel(0, Math.max(-500, Math.min(500, deltaY)));
  res.json({ ok: true });
});

// Reload the login browser page (triggers content-script re-injection).
app.post("/api/jobs/:id/browser-reload", loginInteractionLimiter, async (req: express.Request<{ id: string }>, res) => {
  const job = jobs.get(req.params.id);
  if (!job || job.status !== "awaiting-login" || !job.loginPage) {
    res.status(409).json({ error: "No active login session." });
    return;
  }
  await job.loginPage.reload({ waitUntil: "domcontentloaded" });
  res.json({ ok: true });
});

// Signal that login is complete — resumes the paused capture.
app.post("/api/jobs/:id/login-done", loginInteractionLimiter, async (req: express.Request<{ id: string }>, res) => {
  const job = jobs.get(req.params.id);
  if (!job || job.status !== "awaiting-login" || !job.loginResolver) {
    res.status(409).json({ error: "No active login session." });
    return;
  }
  job.loginResolver();
  res.json({ ok: true });
});

// Re-render the kit with a new brand color.
app.post("/api/jobs/:id/rerender", rerenderLimiter, express.json(), async (req: express.Request<{ id: string }>, res) => {
  const job = jobs.get(req.params.id);
  if (!job) {
    res.status(404).json({ error: "No such job." });
    return;
  }
  if (job.status !== "done") {
    res.status(409).json({ error: "Job is not done yet." });
    return;
  }
  if (job.rerendering) {
    res.status(409).json({ error: "A re-render is already in progress for this job." });
    return;
  }
  const { color } = req.body as { color?: string };
  if (!color || !isValidHex(color)) {
    res.status(400).json({ error: "color must be a 6-digit hex string like #ff0000." });
    return;
  }
  if (!job.capture || !job.copy) {
    res.status(409).json({ error: "Job capture data unavailable." });
    return;
  }

  job.rerendering = true;
  job.status = "rendering";
  job.step = "Re-rendering with new color";

  try {
    const { kitDir, files } = await runRender(
      job.capture,
      job.copy,
      job.outputDir,
      (s) => (job.step = s),
      color,
    );
    job.kitDir = kitDir;
    job.images = files.map((f) => path.basename(f));

    job.step = "Re-generating icons";
    let newIconsDir: string | undefined;
    try {
      const iconResult = await generateIcons(
        job.capture.extension.name,
        job.capture.extension.description,
        color,
        job.outputDir,
      );
      job.iconsDir = iconResult.iconsDir;
      job.iconFiles = iconResult.files;
      newIconsDir = iconResult.iconsDir;
    } catch {
      // icon generation is best-effort
    }

    await packageKit(job, kitDir, newIconsDir ?? job.iconsDir);
    job.status = "done";
    job.step = "Done";

    res.json({
      images: job.images,
      iconKit: job.iconFiles?.length ? { files: job.iconFiles } : null,
    });
  } catch (err) {
    job.status = "done";
    job.error = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: job.error });
  } finally {
    job.rerendering = false;
  }
});

// Download the finished kit zip.
app.get("/api/jobs/:id/kit", (req, res) => {
  const job = jobs.get(req.params.id);
  if (!job?.kitZipPath) {
    res.status(404).json({ error: "Kit not ready." });
    return;
  }
  const safe = (job.capture?.extension.name ?? "extension").replace(/[^a-z0-9]+/gi, "-").toLowerCase();
  res.download(job.kitZipPath, `zipsnap-kit-${safe}.zip`, { dotfiles: "allow" });
});

// Uploaded extensions and generated kits are temporary: purge job folders
// (and their in-memory records) once they're old enough that nobody is
// still polling or downloading them.
const JOB_TTL_MS = 24 * 60 * 60 * 1000;
const CLEANUP_INTERVAL_MS = 60 * 60 * 1000;

async function cleanupOldJobs(): Promise<void> {
  const now = Date.now();
  for (const [id, job] of jobs) {
    try {
      const { mtimeMs } = await stat(job.dir);
      if (now - mtimeMs > JOB_TTL_MS) {
        await rm(job.dir, { recursive: true, force: true }).catch(() => {});
        jobs.delete(id);
      }
    } catch {
      jobs.delete(id);
    }
  }
}
setInterval(() => void cleanupOldJobs(), CLEANUP_INTERVAL_MS);

app.listen(PORT, () => {
  console.log(`ZipSnap worker API listening on http://localhost:${PORT}`);
  console.log(`  Anthropic key loaded: ${process.env.ANTHROPIC_API_KEY ? "yes" : "NO — set it in .env"}`);
});
