import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import type { BrowserContext } from "playwright";

/**
 * Finds the extension's dominant brand color from its 128px icon.
 *
 * We reuse the running Chromium: load the icon onto a <canvas>, read its
 * pixels, and pick the most prominent vivid color. This needs no image
 * libraries. Near-white, near-black, and transparent pixels are ignored so we
 * land on the actual brand hue rather than the background.
 *
 * Returns a hex string, falling back to a neutral purple if anything fails.
 */
const FALLBACK = "#6d5efc";

export async function extractBrandColor(
  context: BrowserContext,
  iconPath: string | null,
): Promise<string> {
  if (!iconPath || !existsSync(iconPath)) return FALLBACK;

  const dataUrl = `data:image/png;base64,${(await readFile(iconPath)).toString("base64")}`;
  const page = await context.newPage();
  try {
    return await page.evaluate(async (src) => {
      const img = new Image();
      img.src = src;
      await img.decode();

      const canvas = document.createElement("canvas");
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext("2d");
      if (!ctx) return "#6d5efc";
      ctx.drawImage(img, 0, 0);
      const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);

      // Bucket colors quantized to 16 levels per channel.
      const buckets = new Map<string, { count: number; r: number; g: number; b: number; sat: number }>();
      for (let i = 0; i < data.length; i += 4) {
        const a = data[i + 3];
        if (a < 200) continue; // mostly transparent
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];
        const max = Math.max(r, g, b);
        const min = Math.min(r, g, b);
        const light = (max + min) / 2;
        if (light > 245 || light < 12) continue; // near-white / near-black
        const sat = max - min;
        const key = `${r >> 4},${g >> 4},${b >> 4}`;
        const cur = buckets.get(key) ?? { count: 0, r: 0, g: 0, b: 0, sat: 0 };
        cur.count++;
        cur.r += r;
        cur.g += g;
        cur.b += b;
        cur.sat += sat;
        buckets.set(key, cur);
      }

      // Prefer buckets that are both common AND vivid.
      let best: { count: number; r: number; g: number; b: number; sat: number } | null = null;
      let bestScore = -1;
      for (const v of buckets.values()) {
        const avgSat = v.sat / v.count;
        const score = v.count * (1 + avgSat / 255);
        if (score > bestScore) {
          bestScore = score;
          best = v;
        }
      }
      if (!best) return "#6d5efc";

      const toHex = (n: number) => Math.round(n).toString(16).padStart(2, "0");
      return `#${toHex(best.r / best.count)}${toHex(best.g / best.count)}${toHex(best.b / best.count)}`;
    }, dataUrl);
  } catch {
    return FALLBACK;
  } finally {
    await page.close();
  }
}
