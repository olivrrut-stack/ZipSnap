/**
 * ZipSnap quality scorecard entrypoint.
 *
 *   npm run score                         grade the local production build
 *   npm run score -- --full               also run a real pipeline job + time it (API key)
 *   npm run score -- --url https://...    grade a LIVE deployed site instead of localhost
 *                                         (the honest way to measure real Core Web Vitals)
 *
 * Every tier is wrapped so one failure can't sink the run: a broken tier reports
 * SKIP with the reason and the rest still score. Exit code is non-zero unless
 * every objective criterion passes, so CI or a future loop can gate on it.
 */
import { measureCode } from "./measure/code";
import { measureAssets } from "./measure/assets";
import { measureLighthouse } from "./measure/lighthouse";
import { measureStructural } from "./measure/structural";
import { measureAiJudge } from "./measure/aiJudge";
import { serveWeb, type WebServer } from "./webserver";
import { summarize, renderConsole, writeReport, REPORT_DIR } from "./report";
import { skip, type CriterionResult, type Tier } from "./criteria";

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const full = argv.includes("--full");
  const results: CriterionResult[] = [];

  console.log("ZipSnap scorecard — running code quality + build (a few minutes)...");
  results.push(...measureCode());

  console.log("Checking the output kit...");
  results.push(...(await measureAssets({ full })));

  // Browser tiers run against a live URL (--url) or a freshly built local copy.
  const urlIdx = argv.indexOf("--url");
  const liveUrl = (urlIdx >= 0 ? argv[urlIdx + 1] : argv.find((a) => a.startsWith("--url="))?.slice(6))?.replace(/\/+$/, "");

  let server: WebServer | undefined;
  let baseUrl: string | undefined;
  if (liveUrl) {
    baseUrl = liveUrl;
    console.log(`Grading the live site at ${baseUrl}...`);
  } else {
    try {
      console.log("Serving the production web app for browser checks...");
      server = await serveWeb();
      baseUrl = server.url;
    } catch (e) {
      const reason = (e as Error).message;
      const tiers: Array<[string, string, Tier]> = [
        ["web-vitals", "Lighthouse (Core Web Vitals + accessibility)", "web-vitals"],
        ["structural", "structural + keyboard checks", "structural"],
        ["ai-judge", "AI design judge", "ai-judge"],
      ];
      for (const [id, label, tier] of tiers) results.push(skip(id, label, tier, `web server unavailable: ${reason}`));
    }
  }

  if (baseUrl) {
    try {
      console.log("Running Lighthouse...");
      results.push(...(await measureLighthouse(baseUrl)));
      console.log("Running structural + keyboard checks...");
      results.push(...(await measureStructural(baseUrl)));
      console.log("Running AI design judge...");
      results.push(...(await measureAiJudge(baseUrl)));
    } finally {
      server?.close();
    }
  }

  const summary = summarize(results);
  const iso = new Date().toISOString();
  writeReport(results, summary, iso);
  console.log(renderConsole(results, summary));
  console.log(`Full report written to ${REPORT_DIR}/latest.md (history in history.jsonl)`);
  process.exit(summary.green ? 0 : 1);
}

main().catch((e) => {
  console.error("Scorecard crashed:", e);
  process.exit(1);
});
