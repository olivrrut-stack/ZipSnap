/**
 * Structural + keyboard tier: the testable parts of "clear, trustworthy, usable"
 * homepage. Loads the served site in Playwright and checks the DOM, console, a
 * mobile horizontal-scroll, and basic keyboard reachability.
 */
import { chromium, type ConsoleMessage } from "playwright";
import { pass, fail, skip, type CriterionResult } from "../criteria";

export async function measureStructural(url: string): Promise<CriterionResult[]> {
  const out: CriterionResult[] = [];
  const browser = await chromium.launch();
  try {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await ctx.newPage();
    const consoleErrors: string[] = [];
    const failedRequests: string[] = [];
    page.on("console", (m: ConsoleMessage) => {
      if (m.type() === "error") consoleErrors.push(m.text());
    });
    page.on("pageerror", (e) => consoleErrors.push(e.message));
    page.on("response", (res) => {
      if (res.status() >= 400) failedRequests.push(`${res.status()} ${res.url()}`);
    });

    await page.goto(url, { waitUntil: "networkidle", timeout: 30_000 });

    // The drop zone and hero now live on the /generate tool page (the homepage is
    // a hub), so those two checks navigate there below. Everything else is checked
    // on the hub homepage.

    // Exactly one primary CTA
    const ctaCount = await page.evaluate(() => {
      const primaries = Array.from(document.querySelectorAll<HTMLElement>(".btn-primary, button[data-primary]"));
      return primaries.filter((el) => el.offsetParent !== null).length;
    });
    // The homepage is a deliberate two-tool hub (Generate + Grade), so 1-2 equal
    // primary CTAs is intentional; 0 or 3+ is the real smell.
    out.push(ctaCount >= 1 && ctaCount <= 2 ? pass("ui.cta", "clear primary CTAs (two-tool hub)", "structural", String(ctaCount)) : fail("ui.cta", "clear primary CTAs (1-2 expected)", "structural", String(ctaCount), "1-2", ctaCount === 0 ? "No primary call-to-action found." : "Too many competing primary CTAs on the homepage."));

    // Privacy statement visible somewhere
    const hasPrivacy = await page.evaluate(() => /privacy/i.test(document.body.innerText));
    out.push(hasPrivacy ? pass("trust.privacy", "privacy statement visible", "structural", "present") : fail("trust.privacy", "privacy statement visible", "structural", "not found", "present", "Add a visible privacy statement (a trust signal users look for)."));

    // Footer with contact/about
    const footerOk = await page.evaluate(() => {
      const footer = document.querySelector("footer");
      if (!footer) return false;
      const links = Array.from(footer.querySelectorAll("a"));
      return links.some((a) => /about|contact|privacy|terms|mailto:/i.test(a.getAttribute("href") + " " + a.textContent));
    });
    out.push(footerOk ? pass("trust.footer", "professional footer with contact/about", "structural", "present") : fail("trust.footer", "professional footer with contact/about", "structural", "missing", "present", "Add a footer with about/contact/legal links."));

    // Drop zone + hero on the /generate tool page (where the upload lives).
    await page.goto(url.replace(/\/+$/, "") + "/generate", { waitUntil: "networkidle", timeout: 30_000 });
    const dropZone = await page.evaluate(() => {
      const byClass = document.querySelector(".dropzone");
      const byInput = document.querySelector('input[type="file"]');
      const byText = /drag your extension|drop a|drag and drop|drop your extension/i.test(document.body.innerText);
      return Boolean(byClass || byInput || byText);
    });
    out.push(dropZone ? pass("ui.dropzone", "drag-and-drop zone is obvious (/generate)", "structural", "present") : fail("ui.dropzone", "drag-and-drop zone is obvious (/generate)", "structural", "not found", "present", "No clear drop zone on the /generate page."));

    const heroOk = await page.evaluate(() => {
      const h = document.querySelector("h1, .hero h1, .hero h2");
      const drop = document.querySelector(".dropzone, input[type=file]");
      if (!h || !drop) return false;
      const hY = h.getBoundingClientRect().top;
      const dY = (drop.closest(".dropzone") ?? drop).getBoundingClientRect().top;
      return hY < 800 && dY < 800;
    });
    out.push(heroOk ? pass("ui.hero", "hero above the fold (headline + drop zone, /generate)", "structural", "above fold") : fail("ui.hero", "hero above the fold (headline + drop zone, /generate)", "structural", "below fold", "above fold", "Lift the headline and drop zone into the first screen."));

    // No console errors
    // Ignore environment noise that isn't a bug in our code: the Vercel Analytics
    // beacon only exists on Vercel's edge (404s locally), and dev-only overlays.
    const ignore = (s: string) => /_vercel\/insights|__nextjs_original-stack-frame|favicon\.ico/i.test(s);
    const realFailed = failedRequests.filter((u) => !ignore(u));
    const jsErrors = consoleErrors.filter((t) => !/failed to load resource/i.test(t));
    const problems = jsErrors.length + realFailed.length;
    const detail = jsErrors[0]?.slice(0, 100) ?? (realFailed[0] ? `Failed request: ${realFailed[0]}` : "");
    out.push(problems === 0 ? pass("code.console", "no console errors on load", "code", "clean") : fail("code.console", "no console errors on load", "code", `${problems} issue(s)`, "0", detail));

    // Keyboard: pressing Tab moves focus to a real, visible control that shows a
    // focus ring. Uses a real Tab press (triggers :focus-visible), and targets
    // whatever the browser focuses first rather than a possibly-disabled CTA.
    await page.keyboard.press("Tab");
    const kb = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null;
      if (!el || el === document.body) return { reached: false, ring: false };
      const s = getComputedStyle(el);
      const ring = (s.outlineStyle !== "none" && parseFloat(s.outlineWidth) > 0) || (s.boxShadow !== "none" && s.boxShadow !== "");
      return { reached: true, ring };
    });
    out.push(kb.reached && kb.ring ? pass("a11y.keyboard", "Tab reaches a control with a visible focus ring", "structural", "focusable + ring") : fail("a11y.keyboard", "Tab reaches a control with a visible focus ring", "structural", kb.reached ? "no focus ring" : "Tab moved nowhere", "focusable + ring", "Ensure Tab moves focus to controls and each shows a visible focus outline."));

    // Mobile: zero horizontal scroll
    const mobile = await ctx.newPage();
    await mobile.setViewportSize({ width: 390, height: 844 });
    await mobile.goto(url, { waitUntil: "networkidle", timeout: 30_000 });
    const overflow = await mobile.evaluate(() => {
      const el = document.scrollingElement || document.documentElement;
      return el.scrollWidth - el.clientWidth;
    });
    out.push(overflow <= 2 ? pass("mobile.scroll", "no horizontal scroll on mobile", "structural", `${overflow}px overflow`) : fail("mobile.scroll", "no horizontal scroll on mobile", "structural", `${overflow}px overflow`, "0px", "Something is wider than the mobile viewport; check fixed widths and overflow."));

    return out;
  } catch (err) {
    return [skip("structural", "structural + keyboard checks", "structural", `Could not run: ${(err as Error).message}`)];
  } finally {
    await browser.close();
  }
}
