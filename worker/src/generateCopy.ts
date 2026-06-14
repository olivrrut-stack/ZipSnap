/**
 * ZipSnap — Phase 2: AI store copy.
 *
 * Reads the facts captured in Phase 1 (output/capture.json) and asks Claude to
 * write the Chrome Web Store listing: short description, long description,
 * suggested category, and 5 screenshot headlines. Saves output/copy.json.
 *
 * Run (after a capture):
 *   npm run copy
 */
import dotenv from "dotenv";
import path from "node:path";
import { readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { generateStoreCopy } from "./copy";
import { step, info, ok, warn } from "./log";
import type { CaptureResult } from "./types";

// Load the API key. It may live in the project root (.env) or in worker/.env.
dotenv.config({ path: path.resolve(__dirname, "..", "..", ".env") });
dotenv.config({ path: path.resolve(__dirname, "..", ".env") });

async function main(): Promise<void> {
  console.log("=== ZipSnap — Phase 2: AI store copy ===");

  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error(
      "No ANTHROPIC_API_KEY found. Put it in a .env file (ANTHROPIC_API_KEY=sk-ant-...).",
    );
  }

  const outputDir = path.resolve(__dirname, "..", "output");
  const capturePath = path.join(outputDir, "capture.json");

  step("Reading the captured facts");
  if (!existsSync(capturePath)) {
    throw new Error(
      `No capture.json found at ${capturePath}. Run a capture first (npm run spike).`,
    );
  }
  const capture = JSON.parse(await readFile(capturePath, "utf8")) as CaptureResult;
  info(`Extension: ${capture.extension.name} (v${capture.extension.version})`);

  step("Asking Claude to write the listing");
  info("Model: claude-opus-4-8");
  const copy = await generateStoreCopy(capture);
  ok("Copy generated.");

  // Gentle checks (the store limits short descriptions to 132 characters).
  if (copy.shortDescription.length > 132) {
    warn(`Short description is ${copy.shortDescription.length} chars (store limit is 132).`);
  }

  step("Writing copy.json");
  const copyPath = path.join(outputDir, "copy.json");
  await writeFile(copyPath, JSON.stringify(copy, null, 2), "utf8");
  ok(`Wrote ${copyPath}`);

  // Show it.
  step("Result");
  console.log(`\n  CATEGORY: ${copy.suggestedCategory}\n`);
  console.log(`  SHORT (${copy.shortDescription.length} chars):`);
  console.log(`    ${copy.shortDescription}\n`);
  console.log("  LONG:");
  for (const line of copy.longDescription.split("\n")) console.log(`    ${line}`);
  console.log("\n  SLIDE HEADLINES:");
  copy.slideHeadlines.forEach((h, i) => console.log(`    ${i + 1}. ${h}`));
}

main().catch((err) => {
  console.error("\n✗ Copy generation failed:");
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
