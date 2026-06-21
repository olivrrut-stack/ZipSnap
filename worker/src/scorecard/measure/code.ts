/**
 * Code-quality tier: typecheck + tests for both projects, plus a production
 * build of the web app. Console-error checking lives in the structural tier
 * (it needs the served page).
 */
import path from "node:path";
import { spawnSync } from "node:child_process";
import { pass, fail, type CriterionResult } from "../criteria";

const WORKER_DIR = path.resolve(__dirname, "..", "..", "..");
const WEB_DIR = path.resolve(WORKER_DIR, "..", "web");

/** Runs a shell command in a directory; returns success + a short tail of output. */
function run(cmd: string, cwd: string): { ok: boolean; tail: string } {
  const r = spawnSync(cmd, { cwd, shell: true, encoding: "utf8", timeout: 5 * 60 * 1000 });
  const out = `${r.stdout ?? ""}${r.stderr ?? ""}`.trim();
  const tail = out.split("\n").slice(-4).join(" ").slice(-200);
  return { ok: r.status === 0, tail };
}

function check(id: string, label: string, cmd: string, cwd: string): CriterionResult {
  const { ok, tail } = run(cmd, cwd);
  return ok
    ? pass(id, label, "code", "passes")
    : fail(id, label, "code", "fails", "passes", `\`${cmd}\` failed: ${tail}`);
}

export function measureCode(): CriterionResult[] {
  return [
    check("code.worker.typecheck", "worker typecheck", "npm run typecheck", WORKER_DIR),
    check("code.worker.test", "worker tests", "npm test", WORKER_DIR),
    check("code.web.typecheck", "web typecheck", "npm run typecheck", WEB_DIR),
    check("code.web.test", "web tests", "npm test", WEB_DIR),
    check("code.web.build", "web production build", "npm run build", WEB_DIR),
  ];
}
