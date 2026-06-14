/**
 * ZipSnap — rendering CLI (Phase 3).
 *
 * Reads output/capture.json + output/copy.json and renders the finished,
 * store-ready asset kit into output/kit. The render logic lives in pipeline.ts.
 *
 * Run (after a capture + copy):
 *   npm run render
 */
import path from "node:path";
import { readFileSync, existsSync } from "node:fs";
import { runRender } from "./pipeline";
import { step, info } from "./log";
import type { CaptureResult } from "./types";
import type { StoreCopy } from "./copy";

async function main(): Promise<void> {
  console.log("=== ZipSnap — rendering the asset kit ===");

  const outputDir = path.resolve(__dirname, "..", "output");
  const capturePath = path.join(outputDir, "capture.json");
  const copyPath = path.join(outputDir, "copy.json");

  step("Reading capture + copy");
  if (!existsSync(capturePath)) throw new Error(`Missing ${capturePath}. Run: npm run spike`);
  if (!existsSync(copyPath)) throw new Error(`Missing ${copyPath}. Run: npm run copy`);
  const capture = JSON.parse(readFileSync(capturePath, "utf8")) as CaptureResult;
  const copy = JSON.parse(readFileSync(copyPath, "utf8")) as StoreCopy;
  info(`Extension: ${capture.extension.name}  ·  brand ${capture.brandColor}`);

  const { kitDir, files } = await runRender(capture, copy, outputDir, (s) => step(s));

  step("Done");
  console.log(`  ${files.length} images saved to: ${kitDir}`);
}

main().catch((err) => {
  console.error("\n✗ Rendering failed:");
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
