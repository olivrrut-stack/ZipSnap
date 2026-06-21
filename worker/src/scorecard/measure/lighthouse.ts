/**
 * Web-vitals tier: runs Lighthouse (mobile preset) against the served production
 * site and maps its audits to the finish line. Skips gracefully if Chrome or
 * Lighthouse can't launch.
 */
import { checkMax, checkMin, pass, fail, skip, THRESHOLDS, type CriterionResult } from "../criteria";

const ms = (n: number) => `${(n / 1000).toFixed(2)}s`;
const pct = (n: number) => `${n}`;

export async function measureLighthouse(url: string): Promise<CriterionResult[]> {
  let chrome: { port: number; kill: () => void | Promise<void> } | undefined;
  try {
    const chromeLauncher = await import("chrome-launcher");
    const lighthouse = ((await import("lighthouse")) as any).default;
    chrome = await chromeLauncher.launch({ chromeFlags: ["--headless=new", "--no-sandbox"] });

    const result = await lighthouse(
      url,
      { port: chrome!.port, output: "json", logLevel: "error", onlyCategories: ["performance", "accessibility", "seo"] },
      { extends: "lighthouse:default", settings: { formFactor: "mobile", screenEmulation: { mobile: true, width: 412, height: 823, deviceScaleFactor: 1.75, disabled: false } } },
    );
    const lhr = result.lhr;
    const a = lhr.audits;
    const num = (id: string): number => a[id]?.numericValue ?? NaN;

    const out: CriterionResult[] = [];
    const metricMax = (id: string, label: string, val: number, max: number, fmt: (n: number) => string, hint: string) =>
      Number.isNaN(val) ? skip(id, label, "web-vitals", "metric unavailable") : checkMax(id, label, "web-vitals", val, max, fmt, hint);

    out.push(metricMax("cwv.lcp", "Largest Contentful Paint", num("largest-contentful-paint"), THRESHOLDS.lcpMs, ms, "Reduce render-blocking resources and hero weight; LCP is the key loading metric."));
    out.push(metricMax("cwv.cls", "Cumulative Layout Shift", num("cumulative-layout-shift"), THRESHOLDS.cls, (n) => n.toFixed(3), "Reserve space for images and fonts to stop layout jumps."));
    out.push(metricMax("cwv.inp", "Total Blocking Time (INP proxy)", num("total-blocking-time"), THRESHOLDS.inpMs, ms, "Break up long main-thread tasks to improve interaction latency."));
    out.push(metricMax("cwv.load", "Full load (Speed Index)", num("speed-index"), THRESHOLDS.loadMs, ms, "Speed up first paint on slow connections."));

    out.push(checkMin("cwv.perf", "Lighthouse performance score", "web-vitals", Math.round((lhr.categories.performance?.score ?? 0) * 100), THRESHOLDS.perfScore, pct, "Fix the failing performance audits Lighthouse lists."));
    out.push(checkMin("a11y.score", "Lighthouse accessibility score", "web-vitals", Math.round((lhr.categories.accessibility?.score ?? 0) * 100), THRESHOLDS.a11yScore, pct, "Fix contrast, ARIA, and element-name audits Lighthouse flags."));

    const audit = (id: string, label: string, hint: string): CriterionResult => {
      const s = a[id]?.score;
      if (s == null) return skip(id, label, "web-vitals", "audit not applicable");
      return s >= 0.9 ? pass(id, label, "web-vitals", "pass") : fail(id, label, "web-vitals", "fail", "pass", hint);
    };
    out.push(audit("tap-targets", "tap targets >= 48px", "Enlarge or space tappable controls to at least 48px."));
    out.push(audit("font-size", "legible font sizes on mobile", "Increase base font size for mobile legibility."));
    out.push(audit("viewport", "responsive viewport meta", "Add a proper responsive viewport meta tag."));

    return out;
  } catch (err) {
    return [skip("web-vitals", "Lighthouse (Core Web Vitals + accessibility)", "web-vitals", `Lighthouse could not run: ${(err as Error).message}. Is Chrome installed?`)];
  } finally {
    // chrome-launcher's kill() can throw synchronously on Windows when it fails
    // to remove its temp dir (the process hasn't released it yet). Harmless and
    // happens after results are gathered, so swallow it completely.
    if (chrome) {
      try {
        await chrome.kill();
      } catch {
        /* windows temp-dir cleanup race */
      }
    }
  }
}
