import path from "node:path";
import { writeFile } from "node:fs/promises";
import type { BrowserContext, Page } from "playwright";
import type { CapturedSurface } from "./types";
import { startDemoServer } from "./demoServer";
import { resolveContentTarget } from "./contentTarget";
import { ok, info, warn } from "./log";

/** The size of the simulated browser window for full-page surfaces. */
const VIEWPORT = { width: 1280, height: 800 };

/**
 * Takes a screenshot, falling back to a raw CDP capture if Playwright's
 * high-level screenshot hangs (common on heavy SPAs like LinkedIn that never
 * reach an idle paint state).
 */
async function forceScreenshot(page: Page, outputPath: string): Promise<void> {
  try {
    await page.screenshot({ path: outputPath, animations: "disabled", timeout: 8_000 });
  } catch {
    const cdp = await page.context().newCDPSession(page);
    try {
      const { data } = await Promise.race([
        cdp.send("Page.captureScreenshot", { format: "png" }) as Promise<{ data: string }>,
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("CDP screenshot timed out")), 10_000),
        ),
      ]);
      await writeFile(outputPath, Buffer.from(data, "base64"));
    } finally {
      await cdp.detach().catch(() => {});
    }
  }
}

/**
 * Returns true if the page looks like a login wall — either by having a
 * password input or by matching common login URL patterns.
 */
export function looksLikeLoginPage(
  url: string,
  hasPasswordField: boolean,
  hasEmailOnlyForm = false,
): boolean {
  if (hasPasswordField) return true;
  if (/\/(login|signin|sign-in|auth|session|account\/login)/i.test(url)) return true;
  return hasEmailOnlyForm;
}

/**
 * Captures the popup. A popup is a small widget, so we screenshot just its
 * <body>, which Playwright crops tightly to the popup's real size.
 */
export async function capturePopup(
  context: BrowserContext,
  extensionId: string,
  popupRel: string | null,
  outputDir: string,
): Promise<CapturedSurface> {
  if (!popupRel) return { exists: false, source: null, screenshot: null, size: null };

  const url = `chrome-extension://${extensionId}/${popupRel}`;
  info(`Opening popup: ${url}`);
  const page = await context.newPage();
  try {
    await page.goto(url, { waitUntil: "load" });
    await page.waitForTimeout(400);
    const body = page.locator("body");
    const box = await body.boundingBox();
    const file = "popup.png";
    await forceScreenshot(page, path.join(outputDir, file));
    const size = box
      ? { width: Math.round(box.width), height: Math.round(box.height) }
      : null;
    ok(`Popup captured (${size ? `${size.width}x${size.height}` : "?"}) -> ${file}`);
    return { exists: true, source: popupRel, screenshot: file, size };
  } finally {
    await page.close();
  }
}

/**
 * Captures the options page as a full browser-window view (1280x800), since
 * options pages are full pages rather than small widgets.
 */
export async function captureOptions(
  context: BrowserContext,
  extensionId: string,
  optionsRel: string | null,
  outputDir: string,
): Promise<CapturedSurface> {
  if (!optionsRel) return { exists: false, source: null, screenshot: null, size: null };

  const url = `chrome-extension://${extensionId}/${optionsRel}`;
  info(`Opening options page: ${url}`);
  const page = await context.newPage();
  try {
    await page.setViewportSize(VIEWPORT);
    await page.goto(url, { waitUntil: "load" });
    await page.waitForTimeout(400);
    const file = "options.png";
    await forceScreenshot(page, path.join(outputDir, file));
    ok(`Options captured (${VIEWPORT.width}x${VIEWPORT.height}) -> ${file}`);
    return {
      exists: true,
      source: optionsRel,
      screenshot: file,
      size: { ...VIEWPORT },
    };
  } finally {
    await page.close();
  }
}

/**
 * Best-effort dismissal of cookie / consent banners on real sites, so they
 * don't sit on top of the screenshot. Tries a few common button labels and
 * quietly gives up if none are found.
 */
async function dismissConsent(page: Page): Promise<void> {
  const labels = [/^accept all$/i, /^accept$/i, /^i agree$/i, /^reject all$/i, /^got it$/i];
  for (const name of labels) {
    try {
      const btn = page.getByRole("button", { name }).first();
      if (await btn.isVisible({ timeout: 1200 })) {
        await btn.click({ timeout: 1500 });
        await page.waitForTimeout(800);
        return;
      }
    } catch {
      // not present / not clickable — try the next label
    }
  }
}

/**
 * Captures the extension's on-page UI (content script).
 *
 * Picks where to shoot using the manifest's match patterns: a real target site
 * for site-specific extensions, or our safe local demo page for broad ones (see
 * resolveContentTarget). The extension injects itself on load; we then
 * screenshot the whole window.
 */
export async function captureContentOverlay(
  context: BrowserContext,
  manifest: any,
  outputDir: string,
  opts: { onLoginNeeded?: (page: Page, url: string) => Promise<void> } = {},
): Promise<CapturedSurface> {
  const target = resolveContentTarget(manifest);
  if (!target) {
    return {
      exists: false,
      source: null,
      screenshot: null,
      size: null,
      note: "No content scripts declared.",
    };
  }

  // Resolve the URL to visit (spinning up the demo server only if needed).
  let url: string;
  let note: string;
  let closeDemo: (() => Promise<void>) | null = null;
  if (target.kind === "site") {
    url = target.url;
    note = `Shot on the real target site (matched "${target.matchUsed}").`;
    info(`Content script targets a specific site — visiting ${url}`);
  } else {
    const demo = await startDemoServer();
    closeDemo = demo.close;
    url = demo.url;
    note = "Shot on the safe local demo page (extension matches any site).";
    info(`Serving demo page at ${url}`);
  }

  const page = await context.newPage();
  try {
    await page.setViewportSize(VIEWPORT);
    // Real sites can keep loading forever, so don't wait for full network idle.
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45_000 });
    if (target.kind === "site") {
      await dismissConsent(page);
      // Real sites render progressively; give the page and the extension time.
      await page.waitForTimeout(4000);
    } else {
      await page.waitForTimeout(1500);
    }

    // Detect login wall on real-site targets only.
    if (target.kind === "site" && opts.onLoginNeeded) {
      const currentUrl = page.url();
      const { hasPasswordField, hasEmailOnlyForm } = await page.evaluate(() => {
        const hasPasswordField = !!document.querySelector('input[type="password"]');
        const hasEmailInput = !!document.querySelector(
          'input[type="email"], input[name*="email"], input[id*="email"]',
        );
        const hasSignInCta = Array.from(
          document.querySelectorAll('button, [role="button"], a'),
        ).some((el) => /^(sign\s*in|log\s*in)$/i.test((el.textContent ?? "").trim()));
        return { hasPasswordField, hasEmailOnlyForm: hasEmailInput && hasSignInCta };
      });
      if (looksLikeLoginPage(currentUrl, hasPasswordField, hasEmailOnlyForm)) {
        info("Login wall detected — pausing for user sign-in");
        await opts.onLoginNeeded(page, currentUrl);
        // After login, navigate back to the original target URL. Use "commit" so
        // heavy SPAs like LinkedIn can't stall us waiting for HTML to finish parsing.
        await page.goto(url, { waitUntil: "commit", timeout: 15_000 });
        await dismissConsent(page);
        // Give the page and extension time to settle after navigation.
        await page.waitForTimeout(5000);
      }
    }

    const file = "content-overlay.png";
    await forceScreenshot(page, path.join(outputDir, file));
    ok(`Content overlay captured (${VIEWPORT.width}x${VIEWPORT.height}) -> ${file}`);
    return { exists: true, source: url, screenshot: file, size: { ...VIEWPORT }, note };
  } finally {
    await page.close();
    if (closeDemo) await closeDemo();
  }
}
