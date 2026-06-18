import Anthropic from "@anthropic-ai/sdk";
import { readFileSync, existsSync } from "node:fs";

export type LayoutVariant = "stacked" | "split" | "spotlight";

/**
 * Calls Claude vision to pick the best screenshot layout for this extension.
 * Passes the first available screenshot and gets back one of three layout names.
 * Falls back to "stacked" (the classic layout) on any error or timeout.
 */
export async function analyzeLayout(
  screenshotPaths: string[],
  extensionName: string,
): Promise<LayoutVariant> {
  if (!process.env.ANTHROPIC_API_KEY) return "stacked";

  const imgPath = screenshotPaths.find((p) => p && existsSync(p));
  if (!imgPath) return "stacked";

  try {
    const client = new Anthropic();
    const imgData = readFileSync(imgPath).toString("base64");

    const response = await Promise.race([
      client.messages.create({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 16,
        system: "Pick a layout. Reply with exactly one word: stacked, split, or spotlight.",
        messages: [
          {
            role: "user",
            content: [
              {
                type: "image",
                source: { type: "base64", media_type: "image/png", data: imgData },
              },
              {
                type: "text",
                text: `Pick the best Chrome Web Store screenshot layout for "${extensionName}":
- stacked: bold headline at top, screenshot in a card below. Best default.
- split: gradient text panel on left (35%), screenshot on right (65%). Good for dense or info-heavy UIs.
- spotlight: dark background, screenshot large and centered, small headline above. Good for dark-themed UIs.
Reply with exactly one word.`,
              },
            ],
          },
        ],
      }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("layout analysis timed out")), 10_000),
      ),
    ]);

    const text = (response.content[0] as { type: "text"; text: string }).text.trim().toLowerCase();
    if (text === "split" || text === "spotlight") return text;
    return "stacked";
  } catch {
    return "stacked";
  }
}
