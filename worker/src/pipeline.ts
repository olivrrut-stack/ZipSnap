/**
 * The ZipSnap pipeline as reusable functions, parameterised by extension path
 * and output folder so it can run once per upload (each job in its own folder).
 * The CLI scripts and the HTTP server both call these.
 */
import path from "node:path";
import { mkdir, writeFile } from "node:fs/promises";
import { readManifest, extractMeta, detectSurfaces } from "./manifest";
import { launchExtension, resolveExtensionId, teardown } from "./extensionContext";
import { extractBrandColor } from "./brandColor";
import { capturePopup, captureOptions, captureContentOverlay } from "./capture";
import { makeBrand, renderScreenshot, renderTile } from "./render";
import { ok } from "./log";
import type { CaptureResult, CapturedSurface } from "./types";
import type { StoreCopy } from "./copy";

/** Optional progress hook so callers (server) can report steps to the UI. */
export type OnStep = (step: string) => void;

/**
 * Loads the extension, captures every surface it has, extracts the brand color,
 * and writes capture.json into outputDir. Returns the structured result.
 */
export async function runCapture(
  extensionPath: string,
  outputDir: string,
  onStep: OnStep = () => {},
): Promise<CaptureResult> {
  onStep("Reading the manifest");
  const manifest = await readManifest(extensionPath);
  const meta = extractMeta(manifest);
  const surfaces = detectSurfaces(manifest, extensionPath);
  await mkdir(outputDir, { recursive: true });

  onStep("Launching Chrome with the extension");
  const loaded = await launchExtension(extensionPath);
  try {
    onStep("Finding the extension ID");
    const extensionId = await resolveExtensionId(loaded.context);

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
      capturedAt: new Date().toISOString(),
    };
    await writeFile(path.join(outputDir, "capture.json"), JSON.stringify(result, null, 2), "utf8");
    return result;
  } finally {
    await teardown(loaded);
  }
}

/** Reads width/height from a PNG header to prove its exact size. */
function pngSize(buf: Buffer): { width: number; height: number } {
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

async function saveVerified(
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
): Promise<{ kitDir: string; files: string[] }> {
  const brand = makeBrand(capture.brandColor);
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
  for (let i = 0; i < 5 && shots.length > 0; i++) {
    const shot = shots[i % shots.length];
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
