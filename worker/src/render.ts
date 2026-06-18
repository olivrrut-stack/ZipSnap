import path from "node:path";
import { readFileSync } from "node:fs";
import satori from "satori";
import { Resvg } from "@resvg/resvg-js";
import type { LayoutVariant } from "./layoutSpec";

/**
 * Rendering pipeline: a layout description -> SVG (Satori) -> PNG (resvg-js),
 * always at an exact pixel size. Type is Geist Mono throughout.
 */

// ---------- fonts ----------
const FONTS_DIR = path.resolve(
  __dirname,
  "..",
  "node_modules",
  "@fontsource",
  "geist-mono",
  "files",
);
const FONTS = [
  {
    name: "Geist Mono",
    data: readFileSync(path.join(FONTS_DIR, "geist-mono-latin-400-normal.woff")),
    weight: 400 as const,
    style: "normal" as const,
  },
  {
    name: "Geist Mono",
    data: readFileSync(path.join(FONTS_DIR, "geist-mono-latin-700-normal.woff")),
    weight: 700 as const,
    style: "normal" as const,
  },
];

// ---------- color helpers (build a gradient + readable text from one brand color) ----------
function hexToRgb(hex: string): [number, number, number] {
  const m = hex.replace("#", "");
  const n = m.length === 3 ? m.split("").map((c) => c + c).join("") : m;
  return [parseInt(n.slice(0, 2), 16), parseInt(n.slice(2, 4), 16), parseInt(n.slice(4, 6), 16)];
}
function rgbToHex(r: number, g: number, b: number): string {
  const h = (v: number) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0");
  return `#${h(r)}${h(g)}${h(b)}`;
}
function darken([r, g, b]: [number, number, number], f: number): string {
  return rgbToHex(r * f, g * f, b * f);
}
/** White or near-black text, whichever is readable on the brand color. */
function textOn([r, g, b]: [number, number, number]): string {
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.62 ? "#11131a" : "#ffffff";
}

export interface Brand {
  color: string;
  rgb: [number, number, number];
  gradient: string;
  ink: string; // readable text color on the gradient
}
export function makeBrand(hex: string): Brand {
  const rgb = hexToRgb(hex);
  const gradient = `linear-gradient(135deg, ${hex} 0%, ${darken(rgb, 0.62)} 100%)`;
  return { color: hex, rgb, gradient, ink: textOn(rgb) };
}

// ---------- image fit ----------
function dataUrl(absPngPath: string): string {
  return `data:image/png;base64,${readFileSync(absPngPath).toString("base64")}`;
}
function fit(
  w: number,
  h: number,
  maxW: number,
  maxH: number,
  maxScale = 2,
): { width: number; height: number } {
  const s = Math.min(maxW / w, maxH / h, maxScale);
  return { width: Math.round(w * s), height: Math.round(h * s) };
}

// ---------- core render ----------
async function toPng(element: any, width: number, height: number): Promise<Buffer> {
  const svg = await satori(element, { width, height, fonts: FONTS });
  const resvg = new Resvg(svg, {
    fitTo: { mode: "width", value: width },
    font: { loadSystemFonts: false },
  });
  return Buffer.from(resvg.render().asPng());
}

// ---------- templates ----------

// "stacked" layout: bold headline above a screenshot card on a gradient background.
async function renderScreenshotStacked(opts: {
  brand: Brand;
  headline: string;
  screenshotPath: string;
  screenshotSize: { width: number; height: number };
}): Promise<Buffer> {
  const W = 1280;
  const H = 800;
  const PAD = 64;
  const CARD_PAD = 28;
  const headlineBlock = 132;
  const maxW = W - PAD * 2 - CARD_PAD * 2;
  const maxH = H - PAD * 2 - headlineBlock - CARD_PAD * 2;
  const img = fit(opts.screenshotSize.width, opts.screenshotSize.height, maxW, maxH);

  const element = {
    type: "div",
    props: {
      style: {
        width: W, height: H,
        display: "flex", flexDirection: "column", alignItems: "center",
        padding: PAD, backgroundImage: opts.brand.gradient, fontFamily: "Geist Mono",
      },
      children: [
        {
          type: "div",
          props: {
            style: {
              height: headlineBlock,
              display: "flex", alignItems: "center", justifyContent: "center",
              textAlign: "center", color: opts.brand.ink,
              fontSize: 46, fontWeight: 700, letterSpacing: -1, lineHeight: 1.15,
            },
            children: opts.headline,
          },
        },
        {
          type: "div",
          props: {
            style: {
              flex: 1, width: "100%",
              display: "flex", alignItems: "center", justifyContent: "center",
              backgroundColor: "#f4f4f7", borderRadius: 24, padding: CARD_PAD,
              boxShadow: "0 30px 60px rgba(0,0,0,0.28)",
            },
            children: {
              type: "img",
              props: {
                src: dataUrl(opts.screenshotPath),
                width: img.width, height: img.height,
                style: { borderRadius: 8, border: "1px solid #e2e3ea" },
              },
            },
          },
        },
      ],
    },
  };
  return toPng(element, W, H);
}

// "split" layout: gradient text panel on the left, screenshot on the right.
async function renderScreenshotSplit(opts: {
  brand: Brand;
  headline: string;
  name: string;
  screenshotPath: string;
  screenshotSize: { width: number; height: number };
}): Promise<Buffer> {
  const W = 1280;
  const H = 800;
  const LEFT_W = 420;
  const RIGHT_W = W - LEFT_W;
  const RIGHT_PAD = 44;
  const img = fit(opts.screenshotSize.width, opts.screenshotSize.height, RIGHT_W - RIGHT_PAD * 2, H - RIGHT_PAD * 2);

  const element = {
    type: "div",
    props: {
      style: {
        width: W, height: H, display: "flex", flexDirection: "row", fontFamily: "Geist Mono",
      },
      children: [
        {
          type: "div",
          props: {
            style: {
              width: LEFT_W, height: H, display: "flex", flexDirection: "column",
              justifyContent: "center", padding: 48,
              backgroundImage: opts.brand.gradient, color: opts.brand.ink,
            },
            children: [
              {
                type: "div",
                props: {
                  style: {
                    fontSize: 12, fontWeight: 400, opacity: 0.65,
                    marginBottom: 20, letterSpacing: 1.5, textTransform: "uppercase",
                  },
                  children: opts.name,
                },
              },
              {
                type: "div",
                props: {
                  style: {
                    fontSize: 38, fontWeight: 700, letterSpacing: -0.5, lineHeight: 1.2,
                  },
                  children: opts.headline,
                },
              },
            ],
          },
        },
        {
          type: "div",
          props: {
            style: {
              flex: 1, height: H,
              display: "flex", alignItems: "center", justifyContent: "center",
              backgroundColor: "#f4f4f7", padding: RIGHT_PAD,
            },
            children: {
              type: "img",
              props: {
                src: dataUrl(opts.screenshotPath),
                width: img.width, height: img.height,
                style: {
                  borderRadius: 10, border: "1px solid #e2e3ea",
                  boxShadow: "0 20px 50px rgba(0,0,0,0.18)",
                },
              },
            },
          },
        },
      ],
    },
  };
  return toPng(element, W, H);
}

// "spotlight" layout: dark background, large screenshot center, small headline above.
async function renderScreenshotSpotlight(opts: {
  brand: Brand;
  headline: string;
  screenshotPath: string;
  screenshotSize: { width: number; height: number };
}): Promise<Buffer> {
  const W = 1280;
  const H = 800;
  const HEADLINE_H = 88;
  const PAD_X = 52;
  const PAD_B = 40;
  const maxW = W - PAD_X * 2;
  const maxH = H - HEADLINE_H - PAD_B * 2;
  const img = fit(opts.screenshotSize.width, opts.screenshotSize.height, maxW, maxH, 1.5);
  const bgColor = darken(opts.brand.rgb, 0.16);

  const element = {
    type: "div",
    props: {
      style: {
        width: W, height: H, display: "flex", flexDirection: "column",
        alignItems: "center", backgroundColor: bgColor, fontFamily: "Geist Mono",
      },
      children: [
        {
          type: "div",
          props: {
            style: {
              height: HEADLINE_H, width: W,
              display: "flex", alignItems: "center",
              paddingLeft: PAD_X, paddingRight: PAD_X,
              color: opts.brand.ink === "#ffffff" ? opts.brand.color : "#ffffff",
              fontSize: 38, fontWeight: 700, letterSpacing: -0.5, lineHeight: 1.15,
            },
            children: opts.headline,
          },
        },
        {
          type: "div",
          props: {
            style: {
              flex: 1, display: "flex",
              alignItems: "center", justifyContent: "center",
              paddingLeft: PAD_X, paddingRight: PAD_X, paddingBottom: PAD_B,
            },
            children: {
              type: "img",
              props: {
                src: dataUrl(opts.screenshotPath),
                width: img.width, height: img.height,
                style: {
                  borderRadius: 12, boxShadow: "0 40px 80px rgba(0,0,0,0.50)",
                },
              },
            },
          },
        },
      ],
    },
  };
  return toPng(element, W, H);
}

/** A 1280x800 store screenshot. Layout variant is chosen by the AI in the pipeline. */
export async function renderScreenshot(opts: {
  brand: Brand;
  headline: string;
  name: string;
  screenshotPath: string;
  screenshotSize: { width: number; height: number };
  layout?: LayoutVariant;
}): Promise<Buffer> {
  const layout = opts.layout ?? "stacked";
  if (layout === "split") return renderScreenshotSplit(opts);
  if (layout === "spotlight") return renderScreenshotSpotlight(opts);
  return renderScreenshotStacked(opts);
}

/** A promo tile (small 440x280 or marquee 1400x560): name + tagline on the brand gradient. */
export async function renderTile(opts: {
  brand: Brand;
  name: string;
  tagline: string;
  width: number;
  height: number;
}): Promise<Buffer> {
  const big = opts.width >= 1000;
  const element = {
    type: "div",
    props: {
      style: {
        width: opts.width,
        height: opts.height,
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        padding: big ? 80 : 36,
        backgroundImage: opts.brand.gradient,
        fontFamily: "Geist Mono",
        color: opts.brand.ink,
      },
      children: [
        {
          type: "div",
          props: {
            style: {
              display: "flex",
              fontSize: big ? 64 : 30,
              fontWeight: 700,
              letterSpacing: -1.5,
              lineHeight: 1.1,
            },
            children: opts.name,
          },
        },
        {
          type: "div",
          props: {
            style: {
              display: "flex",
              marginTop: big ? 24 : 12,
              fontSize: big ? 28 : 15,
              fontWeight: 400,
              opacity: 0.9,
            },
            children: opts.tagline,
          },
        },
      ],
    },
  };
  return toPng(element, opts.width, opts.height);
}
