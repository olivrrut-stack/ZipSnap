/**
 * Diagnostic: times each step of the capture pipeline to find the slow part.
 * Replicates runCapture() with per-step timers. Headless (like the server).
 *   npx tsx scripts/time-capture.ts
 */
process.env.ZIPSNAP_HEADLESS = "1";

import path from "node:path";
import { readManifest, extractMeta, detectSurfaces } from "../src/manifest";
import { launchExtension, resolveExtensionId, teardown } from "../src/extensionContext";
import { extractBrandColor } from "../src/brandColor";
import { capturePopup, captureOptions, captureContentOverlay } from "../src/capture";

async function time<T>(label: string, fn: () => Promise<T>): Promise<T> {
  const t0 = Date.now();
  const r = await fn();
  console.log(`  ⏱  ${label.padEnd(28)} ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  return r;
}

(async () => {
  const ext = path.resolve(__dirname, "..", "fixtures", "sample-extension");
  const out = path.resolve(__dirname, "..", "output");
  const overall = Date.now();

  const manifest = await readManifest(ext);
  extractMeta(manifest);
  const surfaces = detectSurfaces(manifest, ext);

  const loaded = await time("launchExtension", () => launchExtension(ext));
  const id = await time("resolveExtensionId", () => resolveExtensionId(loaded.context));
  await time("extractBrandColor", () => extractBrandColor(loaded.context, surfaces.iconPath));
  await time("capturePopup", () => capturePopup(loaded.context, id, surfaces.popup, out));
  await time("captureOptions", () => captureOptions(loaded.context, id, surfaces.optionsPage, out));
  await time("captureContentOverlay", () => captureContentOverlay(loaded.context, manifest, out));
  await time("teardown", () => teardown(loaded));

  console.log(`  ──────────────────────────────`);
  console.log(`  TOTAL                        ${((Date.now() - overall) / 1000).toFixed(1)}s`);
})();
