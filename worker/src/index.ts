/**
 * ZipSnap — capture engine CLI (Phases 0-1).
 *
 * Loads an unpacked Chrome extension, captures every screen it has (popup,
 * options page, on-page content overlay), reads its brand color, and writes a
 * structured capture.json. The capture logic lives in pipeline.ts.
 *
 * Run:
 *   npm run spike                       # uses the bundled test extension
 *   npm run spike -- "C:\path\to\ext"   # uses your own unpacked extension
 */
import path from "node:path";
import { existsSync } from "node:fs";
import { runCapture } from "./pipeline";
import { step, info, ok } from "./log";

async function main(): Promise<void> {
  console.log("=== ZipSnap — capture engine ===");

  const argPath = process.argv[2];
  const defaultFixture = path.resolve(__dirname, "..", "fixtures", "sample-extension");
  const extensionPath = argPath ? path.resolve(argPath) : defaultFixture;

  step("Locating the extension");
  info(`Folder: ${extensionPath}`);
  info(argPath ? "(using the path you provided)" : "(no path given — using the bundled test extension)");
  if (!existsSync(extensionPath)) throw new Error(`That folder does not exist: ${extensionPath}`);

  const outputDir = path.resolve(__dirname, "..", "output");
  const result = await runCapture(extensionPath, outputDir, (s) => step(s));

  step("Done");
  const s = result.surfaces;
  const captured = [
    s.popup.exists && "popup",
    s.options.exists && "options",
    s.contentOverlay.exists && "content overlay",
  ].filter(Boolean);
  ok(`Extension ID: ${result.extension.id}`);
  console.log(`  Captured: ${captured.length ? captured.join(", ") : "(nothing)"}`);
  console.log(`  Brand color: ${result.brandColor}`);
  console.log(`  Output: ${outputDir}`);
}

main().catch((err) => {
  console.error("\n✗ Capture failed:");
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
