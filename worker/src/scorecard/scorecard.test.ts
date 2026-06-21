import { describe, it, expect } from "vitest";
import { checkMax, checkMin, EXPECTED, THRESHOLDS } from "./criteria";
import { summarize } from "./report";
import type { CriterionResult } from "./criteria";

const id = (n: number) => `${n}`;

describe("checkMax", () => {
  it("passes at or below the max, fails above", () => {
    expect(checkMax("x", "x", "web-vitals", 2400, 2500, id, "h").status).toBe("pass");
    expect(checkMax("x", "x", "web-vitals", 2500, 2500, id, "h").status).toBe("pass"); // boundary inclusive
    expect(checkMax("x", "x", "web-vitals", 2600, 2500, id, "h").status).toBe("fail");
  });
  it("carries the fix hint only on fail", () => {
    expect(checkMax("x", "x", "web-vitals", 9999, 1, id, "fix me").hint).toBe("fix me");
    expect(checkMax("x", "x", "web-vitals", 0, 1, id, "fix me").hint).toBeUndefined();
  });
});

describe("checkMin", () => {
  it("passes at or above the min, fails below", () => {
    expect(checkMin("a", "a", "web-vitals", 90, 90, id, "h").status).toBe("pass"); // boundary inclusive
    expect(checkMin("a", "a", "web-vitals", 89, 90, id, "h").status).toBe("fail");
    expect(checkMin("a", "a", "web-vitals", 100, 90, id, "h").status).toBe("pass");
  });
});

describe("summarize", () => {
  const r = (status: CriterionResult["status"]): CriterionResult => ({ id: "x", label: "x", tier: "code", status });

  it("readiness ignores skips and is green only with zero fails", () => {
    const s = summarize([r("pass"), r("pass"), r("fail"), r("skip")]);
    expect(s.passed).toBe(2);
    expect(s.failed).toBe(1);
    expect(s.skipped).toBe(1);
    expect(s.readiness).toBe(67); // 2 of 3 scored
    expect(s.green).toBe(false);
  });

  it("is green when nothing fails, even with skips", () => {
    const s = summarize([r("pass"), r("skip")]);
    expect(s.green).toBe(true);
    expect(s.readiness).toBe(100);
  });
});

describe("finish-line constants", () => {
  it("encodes the exact Chrome Web Store sizes", () => {
    expect(EXPECTED.screenshot).toEqual({ width: 1280, height: 800 });
    expect(EXPECTED.promos["marquee-1400x560.png"]).toEqual({ width: 1400, height: 560 });
    expect(EXPECTED.icons["icon-128.png"]).toEqual({ width: 128, height: 128 });
  });
  it("encodes the user's numeric targets", () => {
    expect(THRESHOLDS.lcpMs).toBe(2500);
    expect(THRESHOLDS.a11yScore).toBe(90);
    expect(THRESHOLDS.processingMs).toBe(45_000);
  });
});
