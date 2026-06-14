/**
 * Regenerates the landing-page showcase images in Chrome blue.
 * Reuses the fixture's existing capture + copy, just overrides the brand color,
 * re-renders the kit, and copies the showcase set into web/public/samples.
 *   npx tsx scripts/make-samples.ts
 */
import path from "node:path";
import { readFileSync, copyFileSync, mkdirSync } from "node:fs";
import { runRender } from "../src/pipeline";
import type { CaptureResult } from "../src/types";
import type { StoreCopy } from "../src/copy";

const CHROME_BLUE = "#4285f4";

(async () => {
  const out = path.resolve(__dirname, "..", "output");
  const capture = JSON.parse(readFileSync(path.join(out, "capture.json"), "utf8")) as CaptureResult;
  const copy = JSON.parse(readFileSync(path.join(out, "copy.json"), "utf8")) as StoreCopy;

  capture.brandColor = CHROME_BLUE; // override violet → Chrome blue
  const { kitDir } = await runRender(capture, copy, out);

  const samples = path.resolve(__dirname, "..", "..", "web", "public", "samples");
  mkdirSync(samples, { recursive: true });
  for (const f of ["screenshot-1.png", "screenshot-3.png", "small-promo-440x280.png", "marquee-1400x560.png"]) {
    copyFileSync(path.join(kitDir, f), path.join(samples, f));
  }
  console.log(`Chrome-blue samples copied to ${samples}`);
})();
