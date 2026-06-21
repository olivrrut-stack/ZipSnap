/**
 * Turns CriterionResult[] into a scorecard: console table, latest.json,
 * latest.md, and an appended history line so the trend is visible over runs.
 */
import path from "node:path";
import { mkdirSync, writeFileSync, appendFileSync } from "node:fs";
import type { CriterionResult, Status, Tier } from "./criteria";
import { MANUAL_CHECKLIST } from "./criteria";

export const REPORT_DIR = path.resolve(__dirname, "..", "..", "scorecard-report");

const TIER_LABEL: Record<Tier, string> = {
  assets: "Output kit",
  "web-vitals": "Web vitals",
  structural: "Structure",
  "ai-judge": "Design (AI judge)",
  code: "Code quality",
};

const MARK: Record<Status, string> = { pass: "PASS", fail: "FAIL", skip: "SKIP" };

export interface Summary {
  total: number;
  passed: number;
  failed: number;
  skipped: number;
  /** Readiness = passed / (passed + failed); skips don't count against you. */
  readiness: number;
  /** True only if nothing objective is failing. */
  green: boolean;
}

export function summarize(results: CriterionResult[]): Summary {
  const passed = results.filter((r) => r.status === "pass").length;
  const failed = results.filter((r) => r.status === "fail").length;
  const skipped = results.filter((r) => r.status === "skip").length;
  const scored = passed + failed;
  return {
    total: results.length,
    passed,
    failed,
    skipped,
    readiness: scored === 0 ? 0 : Math.round((passed / scored) * 100),
    green: failed === 0,
  };
}

function pad(s: string, n: number): string {
  return s.length >= n ? s.slice(0, n) : s + " ".repeat(n - s.length);
}

export function renderConsole(results: CriterionResult[], summary: Summary): string {
  const lines: string[] = [];
  lines.push("");
  lines.push("ZipSnap Quality Scorecard");
  lines.push("=".repeat(78));

  const tiers: Tier[] = ["assets", "web-vitals", "structural", "ai-judge", "code"];
  for (const tier of tiers) {
    const group = results.filter((r) => r.tier === tier);
    if (group.length === 0) continue;
    lines.push("");
    lines.push(TIER_LABEL[tier]);
    for (const r of group) {
      const mv = r.measured ? `${r.measured}` : "";
      const thr = r.threshold ? `(target ${r.threshold})` : "";
      lines.push(`  ${pad(MARK[r.status], 5)} ${pad(r.label, 40)} ${pad(mv, 14)} ${thr}`);
      if (r.status !== "pass" && r.hint) lines.push(`        -> ${r.hint}`);
    }
  }

  lines.push("");
  lines.push("-".repeat(78));
  lines.push(
    `Readiness ${summary.readiness}%   ` +
      `${summary.passed} pass / ${summary.failed} fail / ${summary.skipped} skip` +
      `   ${summary.green ? "GREEN — finish line met" : "NOT GREEN"}`,
  );

  lines.push("");
  lines.push("Manual checklist (judge by hand / via /design-review — not auto-scored):");
  for (const item of MANUAL_CHECKLIST) lines.push(`  [ ] ${item}`);
  lines.push("");
  return lines.join("\n");
}

function renderMarkdown(results: CriterionResult[], summary: Summary, iso: string): string {
  const lines: string[] = [];
  lines.push(`# ZipSnap Quality Scorecard`);
  lines.push("");
  lines.push(`Run: ${iso}`);
  lines.push("");
  lines.push(`**Readiness ${summary.readiness}%** — ${summary.passed} pass, ${summary.failed} fail, ${summary.skipped} skip. ${summary.green ? "GREEN." : "Not green."}`);
  lines.push("");
  lines.push(`| Status | Criterion | Tier | Measured | Target | Fix / reason |`);
  lines.push(`| --- | --- | --- | --- | --- | --- |`);
  for (const r of results) {
    lines.push(`| ${MARK[r.status]} | ${r.label} | ${TIER_LABEL[r.tier]} | ${r.measured ?? ""} | ${r.threshold ?? ""} | ${r.hint ?? ""} |`);
  }
  lines.push("");
  lines.push(`## Manual checklist`);
  for (const item of MANUAL_CHECKLIST) lines.push(`- [ ] ${item}`);
  lines.push("");
  return lines.join("\n");
}

/** Writes latest.json, latest.md, and appends a history line. `iso` is passed in (no Date in tests). */
export function writeReport(results: CriterionResult[], summary: Summary, iso: string): void {
  mkdirSync(REPORT_DIR, { recursive: true });
  writeFileSync(path.join(REPORT_DIR, "latest.json"), JSON.stringify({ ranAt: iso, summary, results }, null, 2), "utf8");
  writeFileSync(path.join(REPORT_DIR, "latest.md"), renderMarkdown(results, summary, iso), "utf8");
  appendFileSync(
    path.join(REPORT_DIR, "history.jsonl"),
    JSON.stringify({ ranAt: iso, readiness: summary.readiness, passed: summary.passed, failed: summary.failed, skipped: summary.skipped, green: summary.green }) + "\n",
    "utf8",
  );
}
