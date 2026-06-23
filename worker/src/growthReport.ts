import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type { CaptureResult, ExtensionMeta, DetectedSurfaces, ManifestHealth } from "./types";
import { PERMISSION_DATA_MAP } from "./copy";

/**
 * Growth & Acquisition Report: grades an extension from the signals ZipSnap
 * already extracts (manifest, permissions, surfaces, health) plus an optional
 * set of self-reported numbers, and returns actionable advice across four
 * pillars. Mirrors copy.ts (generateStoreCopy): a single Claude call shaped by a
 * strict Zod schema and an anti-fabrication system prompt.
 */

/** The five acquisition-readiness tiers, weakest to strongest. */
export const ACQUISITION_TIERS = [
  "not-ready",
  "early",
  "emerging",
  "attractive",
  "acquisition-ready",
] as const;
export type AcquisitionTier = (typeof ACQUISITION_TIERS)[number];

const Recommendation = z.object({
  priority: z.string().describe("One of: high, medium, low."),
  action: z
    .string()
    .describe("A concrete, imperative step specific to THIS extension's actual signals. No generic advice."),
  rationale: z
    .string()
    .describe("Why it matters; must reference an actual signal (a permission, surface, manifest issue, or a reported number)."),
});

const PillarReport = z.object({
  score: z.number().int().min(0).max(100).describe("0-100 for this pillar."),
  summary: z.string().describe("1-2 sentences grounded in the extension's real signals."),
  recommendations: z.array(Recommendation).min(2).max(5),
});

/** The growth report shape. acquisitionTier is parsed as a string then normalized. */
export const GrowthReportSchema = z.object({
  overallScore: z.number().int().min(0).max(100).describe("Overall 0-100 readiness score."),
  acquisitionTier: z
    .string()
    .describe(`Acquisition-readiness tier. Must be exactly one of: ${ACQUISITION_TIERS.join(" | ")}.`),
  tierRationale: z.string().describe("One or two sentences explaining the tier, honestly noting any missing data."),
  pillars: z.object({
    discoverability: PillarReport.describe("Discoverability & conversion: getting found and clicked in the store."),
    acquisitionReadiness: PillarReport.describe("Acquisition readiness: what a buyer would value."),
    productIdeas: PillarReport.describe("New feature/product direction for retention and growth."),
    compliance: PillarReport.describe("Compliance & Chrome Web Store rejection risk."),
  }),
  featureIdeas: z
    .array(
      z.object({
        title: z.string(),
        description: z.string(),
        rationale: z.string().describe("Tied to the extension's existing surfaces/permissions — an extension of what it already does."),
      }),
    )
    .min(3)
    .max(6)
    .describe("Concrete next features that extend what the extension already does."),
});

export type GrowthReport = z.infer<typeof GrowthReportSchema>;

/** Self-reported, unverified numbers the user may optionally provide. */
export interface UserStats {
  users?: number;
  rating?: number;
  revenue?: number;
}

/** The manifest-only common denominator both the kit path and the fast path produce. */
export interface GrowthSignals {
  name: string;
  description: string;
  manifestVersion: number;
  permissions: string[];
  surfaces: { hasPopup: boolean; hasOptions: boolean; hasContentScripts: boolean; hasNewTab: boolean; hasSidePanel: boolean };
  health: ManifestHealth;
  brandColor?: string;
}

/** Builds signals from a full capture (kit path). */
export function signalsFromCapture(capture: CaptureResult): GrowthSignals {
  return {
    name: capture.extension.name,
    description: capture.extension.description,
    manifestVersion: capture.extension.manifestVersion,
    permissions: capture.extension.permissions,
    surfaces: {
      hasPopup: capture.surfaces.popup.exists,
      hasOptions: capture.surfaces.options.exists,
      hasContentScripts: capture.surfaces.contentOverlay.exists,
      hasNewTab: capture.surfaces.newTab.exists,
      hasSidePanel: capture.surfaces.sidePanel.exists,
    },
    health: capture.manifestHealth,
    brandColor: capture.brandColor,
  };
}

/** Builds signals from raw manifest reads (standalone fast path — no browser). */
export function signalsFromManifest(
  meta: Omit<ExtensionMeta, "id"> | ExtensionMeta,
  surfaces: DetectedSurfaces,
  health: ManifestHealth,
  brandColor?: string,
): GrowthSignals {
  return {
    name: meta.name,
    description: meta.description,
    manifestVersion: meta.manifestVersion,
    permissions: meta.permissions,
    surfaces: {
      hasPopup: surfaces.popup !== null,
      hasOptions: surfaces.optionsPage !== null,
      hasContentScripts: surfaces.hasContentScripts,
      hasNewTab: surfaces.newTabPage !== null,
      hasSidePanel: surfaces.sidePanel !== null,
    },
    health,
  };
}

/** Turns the signals (and optional numbers) into the text brief the model grades. */
export function buildGrowthBrief(signals: GrowthSignals, userStats?: UserStats): string {
  const permLines = signals.permissions.map((p) => {
    const data = PERMISSION_DATA_MAP[p];
    return data ? `  - ${p}: grants access to ${data}` : `  - ${p}`;
  });

  const surfaceList: string[] = [];
  if (signals.surfaces.hasPopup) surfaceList.push("toolbar popup");
  if (signals.surfaces.hasOptions) surfaceList.push("options/settings page");
  if (signals.surfaces.hasNewTab) surfaceList.push("new-tab page takeover");
  if (signals.surfaces.hasSidePanel) surfaceList.push("side panel");
  if (signals.surfaces.hasContentScripts) surfaceList.push("on-page content features");

  const errors = signals.health.issues.filter((i) => i.type === "error");
  const warnings = signals.health.issues.filter((i) => i.type === "warning");

  const lines: string[] = [
    `Name: ${signals.name}`,
    `Developer's own description: ${signals.description || "(none provided)"}`,
    `Manifest version: ${signals.manifestVersion}`,
    `Permissions requested: ${signals.permissions.length ? "" : "(none)"}`,
    ...permLines,
    `Detected UI surfaces: ${surfaceList.length ? surfaceList.join(", ") : "none detected"}`,
  ];

  if (errors.length) {
    lines.push(`\nMANIFEST ERRORS (rejection blockers):\n${errors.map((i) => `  - [${i.code}] ${i.message}`).join("\n")}`);
  }
  if (warnings.length) {
    lines.push(`\nMANIFEST WARNINGS:\n${warnings.map((i) => `  - [${i.code}] ${i.message}`).join("\n")}`);
  }

  const hasStats = userStats && (userStats.users != null || userStats.rating != null || userStats.revenue != null);
  if (hasStats) {
    const s: string[] = ["\nYOUR REPORTED NUMBERS (self-reported by the developer, unverified):"];
    if (userStats!.users != null) s.push(`  - Users: ${userStats!.users}`);
    if (userStats!.rating != null) s.push(`  - Store rating: ${userStats!.rating}`);
    if (userStats!.revenue != null) s.push(`  - Monthly revenue: ${userStats!.revenue}`);
    lines.push(s.join("\n"));
  } else {
    lines.push(
      "\nNO USER-REPORTED NUMBERS PROVIDED — score acquisition readiness from product signals alone, " +
        "say plainly that absence of traction data caps the achievable tier, and name which metrics would sharpen it.",
    );
  }

  return lines.join("\n");
}

const GROWTH_SYSTEM_PROMPT = `You are an expert Chrome extension growth and M&A advisor. You grade an extension and give sharp, specific, actionable advice across four pillars: discoverability & conversion, acquisition readiness, new feature/product ideas, and compliance & rejection risk.

Rules:
- Never invent features, users, or metrics not present in the brief. If the brief says no numbers were provided, do not assume any — grade acquisition readiness from product signals and state which metrics would sharpen it.
- Every recommendation's "action" must be specific to THIS extension's actual surfaces, permissions, and manifest health. No generic SaaS advice. The "rationale" must cite the concrete signal (a named permission, a surface, a manifest issue, or a reported number) it responds to.
- The compliance pillar must directly reflect the manifest health issues and over-broad permissions in the brief. Common rejection causes to weigh: '<all_urls>' or broad host permissions, 'tabs' where 'activeTab' would do, Manifest V2, 'unsafe-eval'/'unsafe-inline', missing description.
- Acquisition readiness: if real numbers are provided, weigh them honestly; if not, base the tier on durability signals (defensible permissions, content-script footprint, retention surfaces like an options page) and keep it honest — absence of traction data caps the achievable tier (do not award the top tiers without real numbers).
- Feature ideas must extend what the extension already does (look at its surfaces and permissions), not propose an unrelated product.
- Treat any reported numbers as unverified developer claims. Frame the tier as indicative, not a valuation.
- Scores must be honest: most extensions land 45-70 overall. Reserve 85+ for genuinely strong, polished, defensible products.`;

function normalizeTier(val: string): AcquisitionTier {
  const v = val.toLowerCase().trim().replace(/\s+/g, "-");
  const exact = ACQUISITION_TIERS.find((t) => t === v);
  if (exact) return exact;
  const partial = ACQUISITION_TIERS.find((t) => v.includes(t) || t.includes(v));
  return partial ?? "early";
}

/**
 * Calls Claude to grade the extension. Returns a strictly-shaped, validated
 * report (the SDK enforces the schema), with the tier normalized to a known value.
 */
export async function generateGrowthReport(signals: GrowthSignals, userStats?: UserStats): Promise<GrowthReport> {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error(
      "No ANTHROPIC_API_KEY found. Put it in a .env file (ANTHROPIC_API_KEY=sk-ant-...).",
    );
  }

  const client = new Anthropic({ maxRetries: 4 });

  // The grader is a fast, free triage, so it favors speed over deep reasoning:
  // no extended thinking, low reasoning effort, and a token cap sized to the
  // report (the schema keeps the output grounded and complete either way).
  const response = await client.messages.parse({
    model: "claude-sonnet-4-6",
    max_tokens: 6000,
    system: GROWTH_SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: `Grade this Chrome extension and write its Growth & Acquisition Report.\n\n${buildGrowthBrief(signals, userStats)}`,
      },
    ],
    output_config: {
      format: zodOutputFormat(GrowthReportSchema),
      effort: "low",
    },
  });

  if (response.stop_reason === "refusal") {
    throw new Error("The AI declined to grade this extension.");
  }
  if (!response.parsed_output) {
    throw new Error("The AI response could not be parsed into the expected shape.");
  }
  return {
    ...response.parsed_output,
    acquisitionTier: normalizeTier(response.parsed_output.acquisitionTier),
  };
}
