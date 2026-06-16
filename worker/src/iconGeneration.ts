import Anthropic from "@anthropic-ai/sdk";
import { Resvg } from "@resvg/resvg-js";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

export interface IconKit {
  iconsDir: string;
  files: string[]; // ["icon-128.png", "icon-48.png", "icon-32.png", "icon-16.png"]
}

const ICON_SIZES = [128, 48, 32, 16] as const;

/**
 * Asks Claude to design an SVG icon for the extension, then renders it to
 * PNG at all 4 Chrome extension icon sizes using resvg-js.
 * Icons are saved to outputDir/icons/ and the list of filenames is returned.
 */
export async function generateIcons(
  extensionName: string,
  description: string,
  brandColor: string,
  outputDir: string,
): Promise<IconKit> {
  const iconsDir = path.join(outputDir, "icons");
  await mkdir(iconsDir, { recursive: true });

  // 1. Ask Claude to generate an SVG icon
  const client = new Anthropic();
  const msg = await client.messages.create({
    model: "claude-opus-4-5",
    max_tokens: 2000,
    messages: [
      {
        role: "user",
        content: `Design a Chrome browser extension icon as a single SVG element.

Extension name: "${extensionName}"
Description: ${description}
Brand color: ${brandColor}

CRITICAL RULES — follow exactly:
1. Output ONLY the raw SVG markup. Start with <svg and end with </svg>. Zero other text.
2. The SVG must have: viewBox="0 0 128 128" width="128" height="128"
3. Use a rounded rectangle as the background (rx="20") filled with the brand color
4. Draw 1-2 simple white (#ffffff) geometric shapes that symbolize the extension's purpose
5. NO text elements — icons must be legible at 16×16 pixels
6. Keep it minimal: rounded rect background + 1-2 clean white shapes only
7. Shapes must have crisp, thick strokes or solid fills so they're visible at 16px
`,
      },
    ],
  });

  const raw = msg.content[0].type === "text" ? msg.content[0].text.trim() : "";

  // Extract SVG — handle cases where Claude wraps it in fences or adds preamble
  const svgMatch = raw.match(/<svg[\s\S]*?<\/svg>/i);
  if (!svgMatch) {
    throw new Error(
      "Icon generation failed: Claude did not return a valid SVG element.",
    );
  }
  const svg = svgMatch[0];

  // 2. Render to PNG at each required size
  const files: string[] = [];
  for (const size of ICON_SIZES) {
    const resvg = new Resvg(svg, {
      fitTo: { mode: "width", value: size },
    });
    const png = Buffer.from(resvg.render().asPng());
    const filename = `icon-${size}.png`;
    await writeFile(path.join(iconsDir, filename), png);
    files.push(filename);
  }

  return { iconsDir, files };
}
