/**
 * Builds (if needed) and serves the production web app for the browser-based
 * tiers. Production build is required: dev mode would report fake-bad Core Web
 * Vitals. Returns the URL and a close() that kills the whole process tree.
 */
import path from "node:path";
import { existsSync } from "node:fs";
import { spawn, spawnSync, type ChildProcess } from "node:child_process";

const WORKER_DIR = path.resolve(__dirname, "..", "..");
const WEB_DIR = path.resolve(WORKER_DIR, "..", "web");

export interface WebServer {
  url: string;
  close: () => void;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function killTree(pid?: number): void {
  if (!pid) return;
  if (process.platform === "win32") {
    spawnSync("taskkill", ["/pid", String(pid), "/T", "/F"], { stdio: "ignore" });
  } else {
    try {
      process.kill(-pid, "SIGKILL");
    } catch {
      /* already gone */
    }
  }
}

export async function serveWeb(port = 3123): Promise<WebServer> {
  if (!existsSync(path.join(WEB_DIR, ".next", "BUILD_ID"))) {
    const build = spawnSync("npm run build", { cwd: WEB_DIR, shell: true, stdio: "ignore", timeout: 5 * 60 * 1000 });
    if (build.status !== 0) throw new Error("web production build failed (run `npm run build` in web/ to see why)");
  }

  const child: ChildProcess = spawn(`npm run start -- -p ${port}`, { cwd: WEB_DIR, shell: true, stdio: "ignore" });
  const url = `http://localhost:${port}`;

  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(2000) });
      if (res.status < 500) return { url, close: () => killTree(child.pid) };
    } catch {
      /* not up yet */
    }
    await sleep(500);
  }
  killTree(child.pid);
  throw new Error("web server did not become ready within 60s");
}
