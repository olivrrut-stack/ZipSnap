/**
 * Output-kit tier: every generated asset matches Chrome Web Store sizes, every
 * promised file is present and named right, and the copy has all fields.
 *
 * Default mode inspects the most recent kit in worker/output. `--full` runs a
 * real pipeline job on the bundled fixture extension first (and times it), so
 * processing time, icons, and copy.json are all measured fresh.
 */
import path from "node:path";
import { existsSync, readFileSync } from "node:fs";
import { pass, fail, skip, checkMax, EXPECTED, THRESHOLDS, type CriterionResult } from "../criteria";
import { pngSize } from "../../pipeline";

const WORKER_DIR = path.resolve(__dirname, "..", "..", "..");
const OUTPUT_DIR = path.resolve(WORKER_DIR, "output");
const FIXTURE = path.resolve(WORKER_DIR, "fixtures", "sample-extension");

function dims(file: string): { width: number; height: number } | null {
  try {
    return pngSize(readFileSync(file));
  } catch {
    return null;
  }
}

/** One PNG: present + exact dimensions. */
function checkImage(id: string, label: string, file: string, want: { width: number; height: number }): CriterionResult {
  if (!existsSync(file)) return fail(id, label, "assets", "missing", `${want.width}x${want.height}`, `File not found: ${path.basename(file)}. Run with --full to generate a fresh kit.`);
  const got = dims(file);
  if (!got) return fail(id, label, "assets", "unreadable", `${want.width}x${want.height}`, "PNG header could not be read; file may be corrupt.");
  const ok = got.width === want.width && got.height === want.height;
  return ok
    ? pass(id, label, "assets", `${got.width}x${got.height}`, `${want.width}x${want.height}`)
    : fail(id, label, "assets", `${got.width}x${got.height}`, `${want.width}x${want.height}`, "Dimensions don't match the store spec.");
}

function inspectKit(): CriterionResult[] {
  const out: CriterionResult[] = [];
  const kitDir = path.join(OUTPUT_DIR, "kit");
  const iconsDir = path.join(OUTPUT_DIR, "icons");

  // Screenshots
  let shotsOk = 0;
  for (let i = 1; i <= EXPECTED.screenshotCount; i++) {
    const file = path.join(kitDir, `screenshot-${i}.png`);
    if (existsSync(file)) {
      const got = dims(file);
      if (got && got.width === EXPECTED.screenshot.width && got.height === EXPECTED.screenshot.height) shotsOk++;
    }
  }
  out.push(
    shotsOk === EXPECTED.screenshotCount
      ? pass("assets.screenshots", "5 screenshots at 1280x800", "assets", `${shotsOk}/5`, "5/5")
      : fail("assets.screenshots", "5 screenshots at 1280x800", "assets", `${shotsOk}/5`, "5/5", "Some screenshots are missing or the wrong size."),
  );

  // Promo tiles
  for (const [name, want] of Object.entries(EXPECTED.promos)) {
    out.push(checkImage(`assets.${name}`, name, path.join(kitDir, name), want));
  }

  // Icons
  for (const [name, want] of Object.entries(EXPECTED.icons)) {
    out.push(checkImage(`assets.${name}`, name, path.join(iconsDir, name), want));
  }

  // Copy completeness
  const copyFile = path.join(OUTPUT_DIR, "copy.json");
  if (!existsSync(copyFile)) {
    out.push(fail("assets.copy", "store copy complete (title, descriptions, 7 keywords, permissions, privacy)", "assets", "no copy.json", "all fields", "No copy.json. Run with --full or generate a kit through the server first."));
  } else {
    try {
      const copy = JSON.parse(readFileSync(copyFile, "utf8"));
      const missing = EXPECTED.copyFields.filter((f) => {
        const v = copy[f];
        if (v == null) return true;
        if (typeof v === "string") return v.trim() === "";
        if (Array.isArray(v)) return v.length === 0;
        return false;
      });
      const kwOk = Array.isArray(copy.keywords) && copy.keywords.length === 7;
      if (missing.length === 0 && kwOk) {
        out.push(pass("assets.copy", "store copy complete", "assets", "all fields present", "all fields"));
      } else {
        const why = [...missing, ...(kwOk ? [] : ["keywords must be exactly 7"])].join(", ");
        out.push(fail("assets.copy", "store copy complete", "assets", `missing: ${why}`, "all fields", "Regenerate copy; some required fields are empty."));
      }
    } catch {
      out.push(fail("assets.copy", "store copy complete", "assets", "unparseable copy.json", "all fields", "copy.json is not valid JSON."));
    }
  }

  return out;
}

export async function measureAssets(opts: { full: boolean }): Promise<CriterionResult[]> {
  if (!opts.full) {
    const results = inspectKit();
    results.push(skip("assets.processing", "processing time (upload -> kit)", "assets", "Run with --full to measure end-to-end time."));
    if (!existsSync(OUTPUT_DIR)) {
      return [skip("assets.kit", "output kit present", "assets", "No worker/output yet. Run with --full or generate a kit first.")];
    }
    return results;
  }

  // --full: run the real pipeline on the fixture and time it.
  if (!process.env.ANTHROPIC_API_KEY) {
    return [skip("assets.full", "fresh pipeline run", "assets", "ANTHROPIC_API_KEY not set; cannot run a real job. Inspecting nothing.")];
  }
  const out: CriterionResult[] = [];
  try {
    const { runCapture, runRender } = await import("../../pipeline");
    const { generateStoreCopy } = await import("../../copy");
    const { generateIcons } = await import("../../iconGeneration");
    const { writeFileSync } = await import("node:fs");

    const start = Date.now();
    const capture = await runCapture(FIXTURE, OUTPUT_DIR);
    const copy = await generateStoreCopy(capture);
    writeFileSync(path.join(OUTPUT_DIR, "copy.json"), JSON.stringify(copy, null, 2), "utf8");
    await runRender(capture, copy, OUTPUT_DIR);
    await generateIcons(capture.extension.name, capture.extension.description ?? "", capture.brandColor, OUTPUT_DIR).catch(() => {});
    const elapsed = Date.now() - start;

    out.push(checkMax("assets.processing", "processing time (upload -> kit)", "assets", elapsed, THRESHOLDS.processingMs, (n) => `${(n / 1000).toFixed(1)}s`, "Pipeline is slower than 45s; profile capture and AI steps. (Local proxy for the Railway server.)"));
  } catch (err) {
    out.push(skip("assets.full", "fresh pipeline run", "assets", `Pipeline run failed: ${(err as Error).message}`));
  }
  out.push(...inspectKit());
  return out;
}
