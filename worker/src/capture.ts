import path from "node:path";
import { writeFile } from "node:fs/promises";
import type { BrowserContext, Page } from "playwright";
import type { CapturedSurface } from "./types";
import { startDemoServer } from "./demoServer";
import { resolveContentTarget } from "./contentTarget";
import { withTimeout } from "./withTimeout";
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
 * password input or by matching common login/auth URL patterns.
 */
export function looksLikeLoginPage(
  url: string,
  hasPasswordField: boolean,
  hasEmailOnlyForm = false,
): boolean {
  if (hasPasswordField) return true;
  if (/\/(login|signin|sign-in|auth|session|account\/login|2fa|two-factor|verify|otp|mfa|checkpoint|challenge)/i.test(url)) return true;
  return hasEmailOnlyForm;
}

/**
 * Checks whether the current page is any kind of authentication wall:
 * login form, 2FA/OTP step, bot-verification challenge, or email-entry form.
 * Used both for initial detection and for the post-login safety check.
 */
async function detectAuthSignals(page: Page): Promise<boolean> {
  // URL-pattern fast path covers most dedicated auth pages (login, 2FA, verify…)
  if (looksLikeLoginPage(page.url(), false)) return true;

  // page.evaluate has no timeout of its own: on a heavy SPA whose JS context
  // never settles (e.g. LinkedIn post-login), it can hang forever and strand
  // the whole capture. Bound it, and treat a timeout as "no auth wall" so
  // capture proceeds — the screenshot step has its own CDP fallback for such
  // pages. Without this, a stuck evaluate leaves the job at "capturing" with
  // no error and no progress.
  try {
    return await withTimeout(page.evaluate(() => {
    if (document.querySelector('input[type="password"]')) return true;

    // OTP / 2FA inputs are always auth-context
    if (document.querySelector(
      'input[autocomplete="one-time-code"], input[autocomplete*="one-time-code"]',
    )) return true;
    const numericInputs = Array.from(document.querySelectorAll('input[inputmode="numeric"]'));
    if (numericInputs.some((el) => { const ml = (el as HTMLInputElement).maxLength; return ml >= 4 && ml <= 8; })) return true;

    // Bot / CAPTCHA challenges
    if (document.querySelector(
      'iframe[src*="challenges.cloudflare.com"], iframe[src*="hcaptcha.com"], ' +
      'iframe[src*="recaptcha.net"], iframe[src*="recaptcha.google.com"], ' +
      '#challenge-form, #cf-challenge-running, .cf-browser-verification',
    )) return true;
    if (/verify (you are|you'?re) (human|not a robot)/i.test(document.body?.innerText ?? "")) return true;

    // Email-entry form with a sign-in / log-in call-to-action
    const hasEmailInput = !!document.querySelector(
      'input[type="email"], input[name*="email"], input[id*="email"]',
    );
    const hasSignInCta = Array.from(document.querySelectorAll('button, [role="button"], a'))
      .some((el) => /^(sign\s*in|log\s*in)$/i.test((el.textContent ?? "").trim()));
    return hasEmailInput && hasSignInCta;
    }), 5_000, "auth-detect timed out");
  } catch {
    return false;
  }
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
 * Captures a new-tab override page as a full browser-window view (1280x800).
 * Many extensions replace the new tab with a whole UI, which screenshots well.
 */
export async function captureNewTab(
  context: BrowserContext,
  extensionId: string,
  newTabRel: string | null,
  outputDir: string,
): Promise<CapturedSurface> {
  if (!newTabRel) return { exists: false, source: null, screenshot: null, size: null };

  const url = `chrome-extension://${extensionId}/${newTabRel}`;
  info(`Opening new-tab page: ${url}`);
  const page = await context.newPage();
  try {
    await page.setViewportSize(VIEWPORT);
    await page.goto(url, { waitUntil: "load" });
    await page.waitForTimeout(800);
    const file = "newtab.png";
    await forceScreenshot(page, path.join(outputDir, file));
    ok(`New-tab page captured (${VIEWPORT.width}x${VIEWPORT.height}) -> ${file}`);
    return { exists: true, source: newTabRel, screenshot: file, size: { ...VIEWPORT } };
  } finally {
    await page.close();
  }
}

/** Side panels are narrow, so shoot the whole panel in a slim viewport. */
const SIDE_PANEL = { width: 400, height: 760 };

export async function captureSidePanel(
  context: BrowserContext,
  extensionId: string,
  sidePanelRel: string | null,
  outputDir: string,
): Promise<CapturedSurface> {
  if (!sidePanelRel) return { exists: false, source: null, screenshot: null, size: null };

  const url = `chrome-extension://${extensionId}/${sidePanelRel}`;
  info(`Opening side panel: ${url}`);
  const page = await context.newPage();
  try {
    await page.setViewportSize(SIDE_PANEL);
    await page.goto(url, { waitUntil: "load" });
    await page.waitForTimeout(500);
    const file = "sidepanel.png";
    await forceScreenshot(page, path.join(outputDir, file));
    ok(`Side panel captured (${SIDE_PANEL.width}x${SIDE_PANEL.height}) -> ${file}`);
    return { exists: true, source: sidePanelRel, screenshot: file, size: { ...SIDE_PANEL } };
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
  opts: { onLoginNeeded?: (page: Page, url: string) => Promise<void>; customContentUrl?: string } = {},
): Promise<CapturedSurface> {
  // Resolve the URL to visit (spinning up the demo server only if needed).
  let url: string;
  let note: string;
  let closeDemo: (() => Promise<void>) | null = null;
  let isRealSite: boolean;

  if (opts.customContentUrl) {
    const hint = opts.customContentUrl;
    if (/^https?:\/\//i.test(hint)) {
      // Full URL — use as-is.
      url = hint;
    } else {
      // Page name or path ("dashboard", "settings", "/checkout") — resolve
      // against the extension's target domain.
      const target = resolveContentTarget(manifest);
      const origin = target?.kind === "site" ? new URL(target.url).origin : null;
      const path = hint.startsWith("/") ? hint : "/" + hint.toLowerCase().replace(/\s+/g, "-");
      url = origin ? origin + path : hint;
    }
    note = `Shot on user-specified page (${hint}).`;
    isRealSite = true;
    info(`Content script: using custom page ${url}`);
  } else {
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
    if (target.kind === "site") {
      url = target.url;
      note = `Shot on the real target site (matched "${target.matchUsed}").`;
      isRealSite = true;
      info(`Content script targets a specific site — visiting ${url}`);
    } else {
      const demo = await startDemoServer();
      closeDemo = demo.close;
      url = demo.url;
      note = "Shot on the safe local demo page (extension matches any site).";
      isRealSite = false;
      info(`Serving demo page at ${url}`);
    }
  }

  const page = await context.newPage();
  try {
    await page.setViewportSize(VIEWPORT);
    // Real sites can keep loading forever, so don't wait for full network idle.
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45_000 });
    if (isRealSite) {
      await dismissConsent(page);
      // Real sites render progressively; give the page and the extension time.
      await page.waitForTimeout(4000);
    } else {
      await page.waitForTimeout(1500);
    }

    // Detect any auth wall on real-site targets only.
    if (isRealSite && opts.onLoginNeeded) {
      if (await detectAuthSignals(page)) {
        info("Login wall detected — pausing for user sign-in");
        await opts.onLoginNeeded(page, page.url());
        // After login the browser is on the post-auth page (e.g. LinkedIn feed).
        // Don't navigate back to `url` — it may be a /login path, and the server
        // will abort a second visit to it from an authenticated session. If we're
        // already on the right domain the extension is already injected there.
        // Only cross-origin: navigate to the target's root.
        const afterLoginUrl = page.url();
        let destUrl = "";
        try {
          const targetOrigin = new URL(url).origin;
          if (new URL(afterLoginUrl).origin !== targetOrigin) {
            destUrl = targetOrigin + "/";
          }
        } catch { /* malformed url — skip */ }
        if (destUrl) {
          await page.goto(destUrl, { waitUntil: "commit", timeout: 15_000 });
        }
        await dismissConsent(page);
        // Give the page and extension time to settle after login.
        // 8s covers: SPA navigation (~1s) + content-script init + any
        // async API calls the extension makes on page load (~2-3s).
        await page.waitForTimeout(8000);
        // Multi-step login guard: if we're still on an auth page (2FA, email
        // verification, bot challenge) after the first sign-in, re-show the
        // browser so the user can finish. Cap at 2 extra pauses — if the site
        // keeps showing a bot challenge after that, its anti-bot detection is
        // blocking the automated browser and we can't proceed.
        let authLoopCount = 0;
        while (await detectAuthSignals(page)) {
          if (authLoopCount >= 2) {
            throw new Error(
              "The site kept showing a security check even after sign-in. " +
              "Its bot detection is blocking ZipSnap's browser. " +
              "Try a different sign-in method (email/password instead of Google) " +
              "or use the custom URL field to point at a page that doesn't require login.",
            );
          }
          info("Still on an auth page — re-pausing for remaining login steps");
          await opts.onLoginNeeded(page, page.url());
          await page.waitForTimeout(3000);
          authLoopCount++;
        }
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
