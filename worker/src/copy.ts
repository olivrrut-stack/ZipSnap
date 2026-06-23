import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type { CaptureResult } from "./types";

/**
 * Official Chrome Web Store listing categories. Using an enum guarantees the AI
 * picks a category the store will actually accept.
 */
export const STORE_CATEGORIES = [
  "Accessibility",
  "Art & Design",
  "Communication",
  "Developer Tools",
  "Education",
  "Entertainment",
  "Functionality & UI",
  "Games",
  "Household",
  "Just for Fun",
  "News & Weather",
  "Privacy & Security",
  "Shopping",
  "Social & Communication",
  "Tools",
  "Travel",
  "Well-being",
  "Workflow & Planning",
] as const;

/** The store copy we ask the AI to produce. Shapes the response exactly. */
export const StoreCopySchema = z.object({
  shortDescription: z
    .string()
    .describe(
      "Chrome Web Store short summary. One punchy sentence, AT MOST 132 characters. No quotes around it.",
    ),
  longDescription: z
    .string()
    .describe(
      "The full store description as plain text. The FIRST line must be one concise sentence stating exactly what the extension does. Then a blank line, then short feature/benefit lines (you may prefix each with '• '). No markdown headings, no hype, no emoji spam.",
    ),
  suggestedCategory: z
    .enum(STORE_CATEGORIES)
    .describe("The single best-fit Chrome Web Store category."),
  slideHeadlines: z
    .array(z.string())
    .length(5)
    .describe(
      "Exactly 5 headlines, one per screenshot. Each 3-5 words, punchy, Title Case, readable at thumbnail size. No trailing punctuation.",
    ),
  title: z.string().describe(
    "Chrome Web Store listing title. STRICT MAX 45 characters including spaces. Format: '[Product Name] — [Key Benefit]' or just the product name if descriptive enough. This must be AT MOST 45 chars — count carefully."
  ),
  keywords: z.array(z.string()).length(7).describe(
    "Exactly 7 keyword phrases for Chrome Web Store search optimization. 2-4 words each, most relevant first. Include the main use case, the problem it solves, and the target user. No duplicates of each other or of words in the title."
  ),
  permissionsAnalysis: z.object({
    safe: z.array(z.string()).describe(
      "Permissions that are clearly justified by the extension's features."
    ),
    flagged: z.array(z.object({
      permission: z.string().describe("The exact permission string from the manifest."),
      reason: z.string().describe("Why this permission may be unnecessary, overly broad, or likely to cause rejection. One clear sentence."),
      suggestion: z.string().describe("Concrete fix: what to use instead, or how to limit the scope. One clear sentence."),
      listingJustification: z.string().describe("A ready-to-paste sentence for the Chrome Web Store store description that explains WHY this permission is required. Must be specific and honest. Example: 'This extension requires access to browsing history to build your local productivity timeline — no data ever leaves your device.'"),
    })).describe(
      "Permissions that appear unnecessary for the described features, are overly broad, or commonly cause Chrome Web Store rejection."
    ),
  }).describe("Analysis of the extension's requested permissions based on its actual features."),
  privacyPolicy: z.string().describe(
    "A complete, professional, paste-ready privacy policy for this extension. Plain text (no markdown). Must cover: what data (if any) is collected, how it's used, whether it's shared with third parties, data retention, and contact info (use placeholder email). Base it ONLY on the actual permissions and features described — if no data is collected, say so clearly. Keep it concise but legally credible."
  ),
});

export type StoreCopy = z.infer<typeof StoreCopySchema>;

/** Maps well-known permissions to plain-English descriptions of what data they grant access to. */
export const PERMISSION_DATA_MAP: Record<string, string> = {
  history: "full browsing history (URLs visited, timestamps)",
  tabs: "tab titles, URLs, and navigation state for all open tabs",
  webNavigation: "page navigation events and URLs across all tabs",
  webRequest: "network requests and response headers (can read all traffic)",
  cookies: "all browser cookies for any domain",
  bookmarks: "all browser bookmarks (read and write)",
  downloads: "download history and file paths",
  geolocation: "geographic location",
  notifications: "system notifications",
  management: "list and manage other installed extensions and apps",
  nativeMessaging: "communication with native desktop applications",
  debugger: "Chrome DevTools Protocol (full page inspection access)",
  identity: "user OAuth tokens and identity",
  contentSettings: "per-site content settings",
  topSites: "the user's most frequently visited sites",
  browsingData: "browsing history, cache, cookies, and downloads (deletion access)",
  sessions: "recently closed tabs and windows across devices",
  clipboardRead: "clipboard contents (read)",
  clipboardWrite: "clipboard (write)",
};

/** Turns the captured facts into a short brief the model can write from. */
function buildBrief(capture: CaptureResult): string {
  const { extension, surfaces, manifestHealth } = capture;
  const features: string[] = [];
  if (surfaces.popup.exists) features.push("Has a toolbar popup window.");
  if (surfaces.options.exists) features.push("Has an options/settings page.");
  if (surfaces.newTab.exists) features.push("Replaces the browser's new-tab page with its own full-page UI.");
  if (surfaces.sidePanel.exists) features.push("Has a browser side panel.");
  if (surfaces.contentOverlay.exists) {
    const where = surfaces.contentOverlay.source
      ? (() => {
          try {
            return new URL(surfaces.contentOverlay.source!).host;
          } catch {
            return "web pages";
          }
        })()
      : "web pages";
    features.push(`Adds on-page features while browsing ${where}.`);
  }

  const permDataLines = extension.permissions
    .map((p) => {
      const data = PERMISSION_DATA_MAP[p];
      return data ? `  - ${p}: grants access to ${data}` : null;
    })
    .filter((l): l is string => l !== null);

  const healthErrors = (manifestHealth?.issues ?? []).filter((i) => i.type === "error");
  const healthWarnings = (manifestHealth?.issues ?? []).filter((i) => i.type === "warning");

  const lines: string[] = [
    `Name: ${extension.name}`,
    `Version: ${extension.version}`,
    `Manifest version: ${extension.manifestVersion}`,
    `Developer's own description: ${extension.description || "(none provided)"}`,
    `Permissions requested: ${extension.permissions.length ? extension.permissions.join(", ") : "(none)"}`,
  ];

  if (permDataLines.length) {
    lines.push(`\nData accessed per permission:\n${permDataLines.join("\n")}`);
  }

  lines.push(`(For permissions analysis: flag anything not clearly justified by the features below, and provide a ready-to-paste listingJustification for each flagged permission)`);
  lines.push(`Detected UI surfaces:\n  - ${features.length ? features.join("\n  - ") : "none detected"}`);

  if (healthErrors.length) {
    lines.push(`\nMANIFEST ERRORS (rejection blockers):\n${healthErrors.map((i) => `  - [${i.code}] ${i.message}`).join("\n")}`);
  }
  if (healthWarnings.length) {
    lines.push(`\nMANIFEST WARNINGS:\n${healthWarnings.map((i) => `  - [${i.code}] ${i.message}`).join("\n")}`);
  }

  return lines.join("\n");
}

const SYSTEM_PROMPT = `You are an expert Chrome Web Store listing writer and extension compliance advisor.
Write clear, honest, benefit-focused copy that helps a real user instantly understand what the extension does.
Rules:
- Never invent features not supported by the given facts. If unsure, stay general rather than fabricate.
- No marketing fluff, no exclamation overload, no emoji spam.
- The long description must lead with ONE concise sentence, then list concrete features/benefits.
- The short description must be at most 132 characters.
- Slide headlines must each be 3-5 words, Title Case, readable as a thumbnail.
- The title must be AT MOST 45 characters — count every character.
- Keywords must each be 2-4 words, focusing on search intent.
- For permissions analysis: flag anything that isn't clearly needed for the described features.
  Common rejection causes: 'tabs' when 'activeTab' would suffice, broad host permissions like '<all_urls>' when specific sites would work, 'history', 'management', 'nativeMessaging', 'debugger'.
- For each flagged permission, listingJustification must be a complete, specific, paste-ready sentence for the Chrome Web Store description. It must name what the permission actually accesses (use the data access info from the brief) and explain exactly why the feature needs it. If no data leaves the device, say so explicitly.
- The privacy policy must be SPECIFIC to the actual permissions in the brief — not generic. If the extension has 'history' permission, explicitly state what history data is accessed, how it is used, and that it is not shared. Cover every sensitive permission listed. A generic policy that does not address the actual permissions will cause reviewer rejection. Use placeholder contact email: privacy@[extensionname].example.`;

// zodOutputFormat can't represent transforms, so we parse with z.string() for the
// category field and normalize it to a valid enum value in code afterwards.
const StoreCopyParseSchema = StoreCopySchema.extend({
  suggestedCategory: z
    .string()
    .describe(
      `The single best-fit Chrome Web Store category. Must be exactly one of: ${STORE_CATEGORIES.join(" | ")}.`,
    ),
});

function normalizeCategory(val: string): (typeof STORE_CATEGORIES)[number] {
  const exact = STORE_CATEGORIES.find((c) => c === val);
  if (exact) return exact;
  const ci = STORE_CATEGORIES.find((c) => c.toLowerCase() === val.toLowerCase());
  if (ci) return ci;
  const partial = STORE_CATEGORIES.find(
    (c) =>
      c.toLowerCase().includes(val.toLowerCase()) ||
      val.toLowerCase().includes(c.toLowerCase()),
  );
  return partial ?? "Tools";
}

/**
 * Calls Claude to generate store copy from the captured extension facts.
 * Returns strictly-shaped, validated copy (the SDK enforces the schema).
 */
export async function generateStoreCopy(capture: CaptureResult): Promise<StoreCopy> {
  // reads ANTHROPIC_API_KEY from the environment. maxRetries bumped above the
  // SDK default (2) so a job can ride out an Anthropic 529 "overloaded" spike
  // before failing — these are transient and clear within seconds.
  const client = new Anthropic({ maxRetries: 4 });

  const response = await client.messages.parse({
    model: "claude-sonnet-4-6",
    max_tokens: 16000,
    thinking: { type: "adaptive" },
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: `Write the Chrome Web Store listing copy for this extension.\n\n${buildBrief(capture)}`,
      },
    ],
    output_config: {
      format: zodOutputFormat(StoreCopyParseSchema),
      effort: "medium",
    },
  });

  if (response.stop_reason === "refusal") {
    throw new Error("The AI declined to write copy for this extension.");
  }
  if (!response.parsed_output) {
    throw new Error("The AI response could not be parsed into the expected shape.");
  }
  return {
    ...response.parsed_output,
    suggestedCategory: normalizeCategory(response.parsed_output.suggestedCategory),
  };
}
