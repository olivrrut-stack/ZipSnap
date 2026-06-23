import { describe, it, expect } from "vitest";
import {
  GrowthReportSchema,
  buildGrowthBrief,
  signalsFromManifest,
  type GrowthSignals,
} from "./growthReport";
import type { DetectedSurfaces, ManifestHealth } from "./types";

function pillar() {
  return {
    score: 55,
    summary: "Grounded summary.",
    recommendations: [
      { priority: "high", action: "Do X", rationale: "Because signal Y" },
      { priority: "medium", action: "Do Z", rationale: "Because signal W" },
    ],
  };
}

function validReport() {
  return {
    overallScore: 62,
    acquisitionTier: "emerging",
    tierRationale: "Solid product signals, no traction data provided.",
    pillars: {
      discoverability: pillar(),
      acquisitionReadiness: pillar(),
      productIdeas: pillar(),
      compliance: pillar(),
    },
    featureIdeas: [
      { title: "A", description: "d", rationale: "extends popup" },
      { title: "B", description: "d", rationale: "extends content script" },
      { title: "C", description: "d", rationale: "extends options" },
    ],
  };
}

describe("GrowthReportSchema", () => {
  it("accepts a well-formed report", () => {
    expect(GrowthReportSchema.safeParse(validReport()).success).toBe(true);
  });

  it("rejects an out-of-range overall score", () => {
    const bad = { ...validReport(), overallScore: 120 };
    expect(GrowthReportSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects a pillar with fewer than 2 recommendations", () => {
    const bad = validReport();
    bad.pillars.compliance.recommendations = [{ priority: "high", action: "a", rationale: "r" }];
    expect(GrowthReportSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects fewer than 3 feature ideas", () => {
    const bad = validReport();
    bad.featureIdeas = bad.featureIdeas.slice(0, 2);
    expect(GrowthReportSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects a missing pillar", () => {
    const bad = validReport() as any;
    delete bad.pillars.discoverability;
    expect(GrowthReportSchema.safeParse(bad).success).toBe(false);
  });
});

const baseSignals: GrowthSignals = {
  name: "Demo",
  description: "A demo extension.",
  manifestVersion: 2,
  permissions: ["<all_urls>", "tabs"],
  surfaces: { hasPopup: true, hasOptions: false, hasContentScripts: true },
  health: { issues: [{ type: "error", code: "MV2_DEPRECATED", message: "Manifest V2 is deprecated.", fix: "Upgrade to V3." }] },
};

describe("buildGrowthBrief", () => {
  it("surfaces real permissions and manifest issues so the model can ground its grade", () => {
    const brief = buildGrowthBrief(baseSignals);
    expect(brief).toContain("<all_urls>");
    expect(brief).toContain("Manifest V2 is deprecated.");
    expect(brief).toContain("toolbar popup");
  });

  it("includes the reported numbers block when stats are given", () => {
    const brief = buildGrowthBrief(baseSignals, { users: 5000, rating: 4.6 });
    expect(brief).toContain("YOUR REPORTED NUMBERS");
    expect(brief).toContain("5000");
    expect(brief).toContain("4.6");
  });

  it("states plainly when no numbers are provided", () => {
    const brief = buildGrowthBrief(baseSignals);
    expect(brief).toContain("NO USER-REPORTED NUMBERS PROVIDED");
  });
});

describe("signalsFromManifest", () => {
  it("maps detected surfaces to booleans", () => {
    const surfaces: DetectedSurfaces = { popup: "popup.html", optionsPage: null, hasContentScripts: true, iconPath: null };
    const health: ManifestHealth = { issues: [] };
    const signals = signalsFromManifest(
      { name: "X", description: "d", version: "1.0.0", manifestVersion: 3, permissions: ["storage"] },
      surfaces,
      health,
    );
    expect(signals.surfaces).toEqual({ hasPopup: true, hasOptions: false, hasContentScripts: true });
    expect(signals.permissions).toEqual(["storage"]);
  });
});
