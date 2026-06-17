/**
 * The ZipSnap pipeline as reusable functions, parameterised by extension path
 * and output folder so it can run once per upload (each job in its own folder).
 * The CLI scripts and the HTTP server both call these.
 */
import path from "node:path";
import { mkdir, writeFile, cp, rm } from "node:fs/promises";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { createInterface } from "node:readline/promises";
import { readManifest, extractMeta, detectSurfaces, checkManifestHealth } from "./manifest";
import { launchExtension, resolveExtensionId, teardown } from "./extensionContext";
import { extractBrandColor } from "./brandColor";
import { capturePopup, captureOptions, captureContentOverlay } from "./capture";
import { makeBrand, renderScreenshot, renderTile } from "./render";
import { ok } from "./log";
import type { CaptureResult, CapturedSurface } from "./types";
import type { StoreCopy } from "./copy";

/** Optional progress hook so callers (server) can report steps to the UI. */
export type OnStep = (step: string) => void;

export function isValidHex(color: string): boolean {
  return /^#[0-9a-fA-F]{6}$/.test(color);
}

export interface RunCaptureOptions {
  /**
   * "Sign in once, then capture" mode: pauses with a visible browser window
   * after launch so the user can log into any accounts the extension needs,
   * then waits for Enter in the terminal before capturing. CLI-only — has no
   * effect under ZIPSNAP_HEADLESS=1 (the server never enables it).
   */
  interactive?: boolean;
}

/**
 * Extensions without a background service worker never fire the "serviceworker"
 * event that resolveExtensionId waits on. When that's the case, copy the
 * extension to a temp dir and inject a minimal stub so Chrome registers one.
 * Returns the (possibly patched) path and a cleanup function to remove the
 * temp copy when done.
 */
async function withServiceWorker(
  extensionPath: string,
  manifest: any,
): Promise<{ resolvedPath: string; cleanup: () => Promise<void> }> {
  if (manifest.background?.service_worker) {
    return { resolvedPath: extensionPath, cleanup: async () => {} };
  }
  // Generate a path that doesn't exist yet so cp creates it as a flat copy
  // (if dest already exists as a directory, Node's cp nests src inside it)
  const tmpParent = await mkdtemp(path.join(tmpdir(), "zipsnap-ext-"));
  const tmpDir = path.join(tmpParent, "ext");
  await cp(extensionPath, tmpDir, { recursive: true });
  await writeFile(path.join(tmpDir, "_zipsnap_bg.js"), "// ZipSnap stub\n", "utf8");
  const patched = { ...manifest, background: { service_worker: "_zipsnap_bg.js" } };
  await writeFile(path.join(tmpDir, "manifest.json"), JSON.stringify(patched, null, 2), "utf8");
  return {
    resolvedPath: tmpDir,
    cleanup: () => rm(tmpParent, { recursive: true, force: true }).catch(() => {}),
  };
}

/** Blocks until the user presses Enter in the terminal. */
async function waitForEnter(prompt: string): Promise<void> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  await rl.question(prompt);
  rl.close();
}

/**
 * Loads the extension, captures every surface it has, extracts the brand color,
 * and writes capture.json into outputDir. Returns the structured result.
 */
export async function runCapture(
  extensionPath: string,
  outputDir: string,
  onStep: OnStep = () => {},
  opts: RunCaptureOptions = {},
): Promise<CaptureResult> {
  onStep("Reading the manifest");
  const manifest = await readManifest(extensionPath);
  const meta = extractMeta(manifest);
  const surfaces = detectSurfaces(manifest, extensionPath);
  const manifestHealth = checkManifestHealth(manifest);
  await mkdir(outputDir, { recursive: true });

  onStep("Launching Chrome with the extension");
  const { resolvedPath, cleanup } = await withServiceWorker(extensionPath, manifest);
  const loaded = await launchExtension(resolvedPath);
  try {
    onStep("Finding the extension ID");
    const extensionId = await resolveExtensionId(loaded.context);

    if (opts.interactive && process.env.ZIPSNAP_HEADLESS !== "1") {
      onStep("Waiting for you to sign in");
      const page = await loaded.context.newPage();
      await page.goto("about:blank");
      await waitForEnter(
        "\n  A browser window is open with your extension loaded.\n" +
          "  Sign in to any accounts it needs, then press Enter here to start capturing...\n",
      );
      await page.close();
    }

    onStep("Reading the brand color");
    const brandColor = await extractBrandColor(loaded.context, surfaces.iconPath);

    onStep("Capturing screens");
    const popup = await capturePopup(loaded.context, extensionId, surfaces.popup, outputDir);
    const options = await captureOptions(loaded.context, extensionId, surfaces.optionsPage, outputDir);
    const contentOverlay = await captureContentOverlay(loaded.context, manifest, outputDir);

    const result: CaptureResult = {
      extension: { id: extensionId, ...meta },
      brandColor,
      surfaces: { popup, options, contentOverlay },
      manifestHealth,
      capturedAt: new Date().toISOString(),
    };
    await writeFile(path.join(outputDir, "capture.json"), JSON.stringify(result, null, 2), "utf8");
    return result;
  } finally {
    await teardown(loaded);
    await cleanup();
  }
}

/** Reads width/height from a PNG header to prove its exact size. */
export function pngSize(buf: Buffer): { width: number; height: number } {
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

export async function saveVerified(
  buf: Buffer,
  file: string,
  want: { width: number; height: number },
): Promise<string> {
  const got = pngSize(buf);
  if (got.width !== want.width || got.height !== want.height) {
    throw new Error(
      `${path.basename(file)} came out ${got.width}x${got.height}, expected ${want.width}x${want.height}.`,
    );
  }
  await writeFile(file, buf);
  ok(`${path.basename(file)} — exactly ${got.width}x${got.height}`);
  return file;
}

/**
 * Renders the finished asset kit (5 screenshots + 2 promo tiles) into
 * outputDir/kit, every file verified to be exactly the required store size.
 * Returns the kit directory and the list of files written.
 */
export async function runRender(
  capture: CaptureResult,
  copy: StoreCopy,
  outputDir: string,
  onStep: OnStep = () => {},
  colorOverride?: string,
): Promise<{ kitDir: string; files: string[] }> {
  const brand = makeBrand(colorOverride ?? capture.brandColor);
  const surfaces: CapturedSurface[] = [
    capture.surfaces.popup,
    capture.surfaces.options,
    capture.surfaces.contentOverlay,
  ];
  const shots = surfaces
    .filter((s) => s.exists && s.screenshot && s.size)
    .map((s) => ({ path: path.join(outputDir, s.screenshot!), size: s.size! }));

  const kitDir = path.join(outputDir, "kit");
  await mkdir(kitDir, { recursive: true });
  const files: string[] = [];

  onStep("Rendering screenshots");
  const screenshotCount = Math.min(5, shots.length);
  for (let i = 0; i < screenshotCount; i++) {
    const shot = shots[i];
    const buf = await renderScreenshot({
      brand,
      headline: copy.slideHeadlines[i],
      screenshotPath: shot.path,
      screenshotSize: shot.size,
    });
    files.push(await saveVerified(buf, path.join(kitDir, `screenshot-${i + 1}.png`), { width: 1280, height: 800 }));
  }

  onStep("Rendering promo tiles");
  const tagline = copy.slideHeadlines[0] ?? copy.shortDescription;
  files.push(
    await saveVerified(
      await renderTile({ brand, name: capture.extension.name, tagline, width: 440, height: 280 }),
      path.join(kitDir, "small-promo-440x280.png"),
      { width: 440, height: 280 },
    ),
  );
  files.push(
    await saveVerified(
      await renderTile({ brand, name: capture.extension.name, tagline, width: 1400, height: 560 }),
      path.join(kitDir, "marquee-1400x560.png"),
      { width: 1400, height: 560 },
    ),
  );

  return { kitDir, files };
}
