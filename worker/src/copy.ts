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
});

export type StoreCopy = z.infer<typeof StoreCopySchema>;

/** Turns the captured facts into a short brief the model can write from. */
function buildBrief(capture: CaptureResult): string {
  const { extension, surfaces } = capture;
  const features: string[] = [];
  if (surfaces.popup.exists) features.push("Has a toolbar popup window.");
  if (surfaces.options.exists) features.push("Has an options/settings page.");
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

  const lines = [
    `Name: ${extension.name}`,
    `Version: ${extension.version}`,
    `Developer's own description: ${extension.description || "(none provided)"}`,
    `Permissions requested: ${extension.permissions.length ? extension.permissions.join(", ") : "(none)"}`,
    `Detected UI surfaces:\n  - ${features.length ? features.join("\n  - ") : "none detected"}`,
  ];
  return lines.join("\n");
}

const SYSTEM_PROMPT = `You are an expert copywriter for Chrome Web Store listings.
Write clear, honest, benefit-focused copy that helps a real user instantly understand what the extension does and why they'd want it.
Rules:
- Never invent features that aren't supported by the facts given. If unsure, stay general rather than fabricate.
- No marketing fluff, no exclamation overload, no emoji spam.
- The long description must lead with ONE concise sentence saying exactly what the extension does, then list concrete features/benefits.
- The short description must be at most 132 characters.
- Slide headlines must each be 3-5 words, Title Case, readable as a thumbnail.`;

/**
 * Calls Claude to generate store copy from the captured extension facts.
 * Returns strictly-shaped, validated copy (the SDK enforces the schema).
 */
export async function generateStoreCopy(capture: CaptureResult): Promise<StoreCopy> {
  const client = new Anthropic(); // reads ANTHROPIC_API_KEY from the environment

  const response = await client.messages.parse({
    model: "claude-opus-4-8",
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
      format: zodOutputFormat(StoreCopySchema),
      effort: "medium",
    },
  });

  if (response.stop_reason === "refusal") {
    throw new Error("The AI declined to write copy for this extension.");
  }
  if (!response.parsed_output) {
    throw new Error("The AI response could not be parsed into the expected shape.");
  }
  return response.parsed_output;
}
