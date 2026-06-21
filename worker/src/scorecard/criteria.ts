/**
 * The ZipSnap finish line, as data. Single source of truth for what "done"
 * means: every measure module produces CriterionResult[] against these.
 */

export type Tier = "assets" | "web-vitals" | "structural" | "ai-judge" | "code";
export type Status = "pass" | "fail" | "skip";

export interface CriterionResult {
  id: string;
  label: string;
  tier: Tier;
  status: Status;
  /** Human-readable measured value, e.g. "1.8s" or "1280x800". */
  measured?: string;
  /** Human-readable target, e.g. "< 2.5s". */
  threshold?: string;
  /** On fail: how to fix. On skip: why it was skipped. */
  hint?: string;
}

/** Numeric targets pulled straight from the user's finish line. */
export const THRESHOLDS = {
  lcpMs: 2500, // LCP < 2.5s
  inpMs: 200, // INP < 200ms (measured via TBT proxy)
  cls: 0.1, // CLS < 0.1
  loadMs: 2000, // full load < 2s on throttled 3G
  perfScore: 90, // Lighthouse performance
  a11yScore: 90, // Lighthouse / axe accessibility
  tapTargetPx: 48, // minimum tap target
  processingMs: 45_000, // upload -> download under 45s
  aiJudgeMin: 85, // subjective pass bar (conservative)
} as const;

/** Exact Chrome Web Store sizes every generated asset must match. */
export const EXPECTED = {
  screenshotCount: 5,
  screenshot: { width: 1280, height: 800 },
  promos: {
    "small-promo-440x280.png": { width: 440, height: 280 },
    "marquee-1400x560.png": { width: 1400, height: 560 },
  } as Record<string, { width: number; height: number }>,
  icons: {
    "icon-128.png": { width: 128, height: 128 },
    "icon-48.png": { width: 48, height: 48 },
    "icon-32.png": { width: 32, height: 32 },
    "icon-16.png": { width: 16, height: 16 },
  } as Record<string, { width: number; height: number }>,
  copyFields: [
    "title",
    "shortDescription",
    "longDescription",
    "keywords",
    "permissionsAnalysis",
    "privacyPolicy",
  ],
} as const;

/** Items a screenshot genuinely cannot judge — printed, never auto-scored. */
export const MANUAL_CHECKLIST = [
  "Micro-interactions: hover states, loading animations, success feedback, drag-and-drop preview feel.",
  "Full keyboard operability: every control reachable and operable, logical focus order end to end.",
] as const;

// --- result constructors ---------------------------------------------------

export function pass(id: string, label: string, tier: Tier, measured?: string, threshold?: string): CriterionResult {
  return { id, label, tier, status: "pass", measured, threshold };
}
export function fail(id: string, label: string, tier: Tier, measured: string, threshold: string, hint: string): CriterionResult {
  return { id, label, tier, status: "fail", measured, threshold, hint };
}
export function skip(id: string, label: string, tier: Tier, reason: string): CriterionResult {
  return { id, label, tier, status: "skip", hint: reason };
}

/** Pass if measured <= max; fail otherwise. `fmt` renders the value for display. */
export function checkMax(
  id: string,
  label: string,
  tier: Tier,
  measured: number,
  max: number,
  fmt: (n: number) => string,
  hint: string,
): CriterionResult {
  const thr = `<= ${fmt(max)}`;
  return measured <= max
    ? pass(id, label, tier, fmt(measured), thr)
    : fail(id, label, tier, fmt(measured), thr, hint);
}

/** Pass if measured >= min; fail otherwise. */
export function checkMin(
  id: string,
  label: string,
  tier: Tier,
  measured: number,
  min: number,
  fmt: (n: number) => string,
  hint: string,
): CriterionResult {
  const thr = `>= ${fmt(min)}`;
  return measured >= min
    ? pass(id, label, tier, fmt(measured), thr)
    : fail(id, label, tier, fmt(measured), thr, hint);
}
