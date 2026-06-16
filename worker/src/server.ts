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
import { runCapture, runRender } from "./pipeline";
import { generateStoreCopy, type StoreCopy } from "./copy";
import { generateIcons } from "./iconGeneration";
import type { CaptureResult } from "./types";

dotenv.config({ path: path.resolve(__dirname, "..", "..", ".env") });
dotenv.config({ path: path.resolve(__dirname, "..", ".env") });

// The server always captures in new headless mode: no windows, clean shutdown.
process.env.ZIPSNAP_HEADLESS = "1";

const PORT = Number(process.env.PORT ?? 4000);
const JOBS_DIR = path.join(os.tmpdir(), "zipsnap-jobs");

type JobStatus =
  | "queued"
  | "capturing"
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
        ...copy.permissionsAnalysis.flagged.map(
          (f) => `  ${f.permission}: ${f.reason}\n  → ${f.suggestion}`
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

/** Runs the whole pipeline for one job, updating its status as it goes. */
async function processJob(job: Job): Promise<void> {
  try {
    job.status = "capturing";
    const capture = await runCapture(job.extPath, job.outputDir, (s) => (job.step = s));
    job.capture = capture;

    job.status = "writing";
    job.step = "Writing the store listing with AI";
    const copy = await generateStoreCopy(capture);
    job.copy = copy;
    await writeFile(path.join(job.outputDir, "copy.json"), JSON.stringify(copy, null, 2), "utf8");

    job.status = "rendering";
    const { kitDir, files } = await runRender(capture, copy, job.outputDir, (s) => (job.step = s));
    job.kitDir = kitDir;
    job.images = files.map((f) => path.basename(f));

    job.step = "Generating icons";
    const { iconsDir, files: iconFiles } = await generateIcons(
      capture.extension.name,
      capture.extension.description,
      capture.brandColor,
      job.outputDir,
    );
    job.iconsDir = iconsDir;
    job.iconFiles = iconFiles;

    job.status = "packaging";
    job.step = "Packaging the kit";
    const zip = new AdmZip();
    zip.addLocalFolder(kitDir);
    if (iconsDir) zip.addLocalFolder(iconsDir, "icons");
    zip.addFile("descriptions.txt", Buffer.from(descriptionsText(capture.extension.name, copy), "utf8"));
    const zipPath = path.join(job.dir, "zipsnap-kit.zip");
    zip.writeZip(zipPath);
    job.kitZipPath = zipPath;

    job.status = "done";
    job.step = "Done";
  } catch (err) {
    job.status = "error";
    job.error = err instanceof Error ? err.message : String(err);
  }
}

const app = express();
app.use(cors());
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 100 * 1024 * 1024 } });

// Each job launches a real Chrome instance and calls the Anthropic API, so
// cap how often a single client can start new jobs.
const createJobLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many jobs from this address. Please try again later." },
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
    const id = randomUUID();
    const dir = path.join(JOBS_DIR, id);
    const extRoot = path.join(dir, "extension");
    await mkdir(extRoot, { recursive: true });

    new AdmZip(req.file.buffer).extractAllTo(extRoot, true);
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
    void processJob(job); // run in the background; client polls for status

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
