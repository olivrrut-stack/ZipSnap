import { chromium, type BrowserContext, type Worker } from "playwright";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { info } from "./log";

const SERVICE_WORKER_TIMEOUT_MS = 30_000;

export interface LoadedExtension {
  context: BrowserContext;
  /** Throwaway browser profile directory; remove it when done. */
  userDataDir: string;
}

/**
 * Launches Chromium with exactly one unpacked extension loaded.
 *
 * Set ZIPSNAP_HEADLESS=1 (the server does this) to run "new headless" mode:
 * no visible window, still loads extensions, and — importantly — closes
 * cleanly. We keep Playwright's `headless: false` and pass `--headless=new`
 * ourselves, because Playwright's default headless uses a separate shell that
 * does NOT support extensions. Unset, it opens a normal visible window (handy
 * for watching a single local run).
 */
export async function launchExtension(extensionPath: string): Promise<LoadedExtension> {
  const newHeadless = process.env.ZIPSNAP_HEADLESS === "1";
  const inDocker = process.env.ZIPSNAP_DOCKER === "1";
  const userDataDir = await mkdtemp(path.join(tmpdir(), "zipsnap-"));
  const context = await chromium.launchPersistentContext(userDataDir, {
    headless: false, // never the old headless shell — it can't load extensions
    args: [
      ...(newHeadless ? ["--headless=new"] : []),
      ...(inDocker ? ["--no-sandbox", "--disable-dev-shm-usage"] : []),
      `--disable-extensions-except=${extensionPath}`,
      `--load-extension=${extensionPath}`,
      "--no-first-run",
      "--no-default-browser-check",
    ],
  });
  return { context, userDataDir };
}

/**
 * Returns the extension's real ID by reading it off the background service
 * worker's address (`chrome-extension://<id>/...`). We never guess it.
 */
export async function resolveExtensionId(context: BrowserContext): Promise<string> {
  let worker: Worker | undefined = context.serviceWorkers()[0];
  if (!worker) {
    info("Waiting for the extension's background worker to start...");
    worker = await context.waitForEvent("serviceworker", {
      timeout: SERVICE_WORKER_TIMEOUT_MS,
    });
  }
  return new URL(worker.url()).host;
}

/** Closes the browser and deletes the throwaway profile (with a safety timeout). */
export async function teardown(loaded: LoadedExtension): Promise<void> {
  // context.close() can occasionally hang; don't let it stall the whole job.
  await Promise.race([
    loaded.context.close().catch(() => {}),
    new Promise<void>((resolve) => setTimeout(resolve, 8000)),
  ]);
  await rm(loaded.userDataDir, { recursive: true, force: true }).catch(() => {});
}
