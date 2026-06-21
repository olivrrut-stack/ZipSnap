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

// ---------- screenshot framing ----------
// Whether a captured surface is a small toolbar popup or a full web page. Page
// shots get a mock browser window so a website screenshot reads as intentional;
// popups get a floating card, since they pop down from the toolbar, not a page.
export type ShotFrame = "popup" | "page";

const BAR_H = 40;

/** Trims a source URL down to a short, readable address-bar label. */
function addressLabel(raw: string): string {
  let label = raw;
  try {
    const u = new URL(raw);
    label = u.host.replace(/^www\./, "") + (u.pathname === "/" ? "" : u.pathname);
  } catch {
    // not a URL (e.g. a friendly label like "Extension Settings") — use as-is
  }
  return label.length > 42 ? label.slice(0, 41) + "…" : label;
}

/** A small circle for the browser window's traffic-light buttons. */
function dot(color: string, marginRight: number) {
  return {
    type: "div",
    props: { style: { display: "flex", width: 12, height: 12, borderRadius: 6, backgroundColor: color, marginRight } },
  };
}

/** Wraps a page screenshot in a mock browser window (title bar + address pill). */
function browserFrame(screenshotPath: string, imgW: number, imgH: number, label: string) {
  return {
    type: "div",
    props: {
      style: {
        display: "flex", flexDirection: "column", width: imgW,
        borderRadius: 16, overflow: "hidden", backgroundColor: "#ffffff",
        border: "1px solid rgba(15,17,26,0.10)", boxShadow: "0 45px 90px rgba(0,0,0,0.38)",
      },
      children: [
        {
          type: "div",
          props: {
            style: {
              display: "flex", alignItems: "center", height: BAR_H,
              paddingLeft: 16, paddingRight: 16, backgroundColor: "#edeef3",
              borderBottom: "1px solid rgba(15,17,26,0.07)",
            },
            children: [
              dot("#ff5f57", 8), dot("#febc2e", 8), dot("#28c840", 18),
              {
                type: "div",
                props: {
                  style: {
                    display: "flex", alignItems: "center", flex: 1, height: 24,
                    backgroundColor: "#ffffff", borderRadius: 12, paddingLeft: 14,
                    fontSize: 13, color: "#9098a6", fontFamily: "Geist Mono",
                  },
                  children: label,
                },
              },
            ],
          },
        },
        {
          type: "img",
          props: { src: dataUrl(screenshotPath), width: imgW, height: imgH, style: { display: "flex" } },
        },
      ],
    },
  };
}

/** Wraps a popup screenshot in a clean floating card. */
function floatingCard(screenshotPath: string, imgW: number, imgH: number) {
  return {
    type: "div",
    props: {
      style: {
        display: "flex", borderRadius: 18, overflow: "hidden", backgroundColor: "#ffffff",
        border: "1px solid rgba(15,17,26,0.10)", boxShadow: "0 45px 90px rgba(0,0,0,0.40)",
      },
      children: {
        type: "img",
        props: { src: dataUrl(screenshotPath), width: imgW, height: imgH, style: { display: "flex" } },
      },
    },
  };
}

/** Builds the framed screenshot element, sized to fit the given area. */
function framedShot(opts: {
  frame: ShotFrame;
  screenshotPath: string;
  screenshotSize: { width: number; height: number };
  maxW: number;
  maxH: number;
  label: string;
}) {
  if (opts.frame === "popup") {
    // Popups are small; scale them up so they read clearly, not as a tiny chip.
    const img = fit(opts.screenshotSize.width, opts.screenshotSize.height, opts.maxW, opts.maxH, 2.8);
    return floatingCard(opts.screenshotPath, img.width, img.height);
  }
  // Page shots reserve room for the browser title bar above the image.
  const img = fit(opts.screenshotSize.width, opts.screenshotSize.height, opts.maxW, opts.maxH - BAR_H, 2);
  return browserFrame(opts.screenshotPath, img.width, img.height, addressLabel(opts.label));
}

// ---------- templates ----------

// "stacked" layout: bold headline above a framed screenshot on a gradient background.
async function renderScreenshotStacked(opts: ScreenshotOpts): Promise<Buffer> {
  const W = 1280;
  const H = 800;
  const PAD = 72;
  const headlineBlock = 140;
  const maxW = W - PAD * 2;
  const maxH = H - PAD - headlineBlock;

  const element = {
    type: "div",
    props: {
      style: {
        width: W, height: H,
        display: "flex", flexDirection: "column", alignItems: "center",
        paddingTop: PAD, paddingLeft: PAD, paddingRight: PAD,
        backgroundImage: opts.brand.gradient, fontFamily: "Geist Mono",
      },
      children: [
        {
          type: "div",
          props: {
            style: {
              height: headlineBlock, width: "100%",
              display: "flex", alignItems: "center", justifyContent: "center",
              textAlign: "center", color: opts.brand.ink,
              fontSize: 50, fontWeight: 700, letterSpacing: -1.5, lineHeight: 1.1,
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
            },
            children: framedShot({
              frame: opts.frame, screenshotPath: opts.screenshotPath,
              screenshotSize: opts.screenshotSize, maxW, maxH, label: opts.label,
            }),
          },
        },
      ],
    },
  };
  return toPng(element, W, H);
}

// "split" layout: gradient text panel on the left, framed screenshot on the right.
async function renderScreenshotSplit(opts: ScreenshotOpts): Promise<Buffer> {
  const W = 1280;
  const H = 800;
  const LEFT_W = 440;
  const RIGHT_W = W - LEFT_W;
  const RIGHT_PAD = 56;

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
              justifyContent: "center", padding: 56,
              backgroundImage: opts.brand.gradient, color: opts.brand.ink,
            },
            children: [
              {
                type: "div",
                props: {
                  style: {
                    display: "flex", fontSize: 13, fontWeight: 400, opacity: 0.7,
                    marginBottom: 22, letterSpacing: 2, textTransform: "uppercase",
                  },
                  children: opts.name,
                },
              },
              {
                type: "div",
                props: {
                  style: {
                    display: "flex", fontSize: 42, fontWeight: 700, letterSpacing: -1, lineHeight: 1.12,
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
              backgroundColor: "#eceef3", padding: RIGHT_PAD,
            },
            children: framedShot({
              frame: opts.frame, screenshotPath: opts.screenshotPath,
              screenshotSize: opts.screenshotSize,
              maxW: RIGHT_W - RIGHT_PAD * 2, maxH: H - RIGHT_PAD * 2, label: opts.label,
            }),
          },
        },
      ],
    },
  };
  return toPng(element, W, H);
}

// "spotlight" layout: dark background, large framed screenshot center, headline above.
async function renderScreenshotSpotlight(opts: ScreenshotOpts): Promise<Buffer> {
  const W = 1280;
  const H = 800;
  const HEADLINE_H = 96;
  const PAD_X = 60;
  const PAD_B = 48;
  const bgColor = darken(opts.brand.rgb, 0.14);

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
              color: opts.brand.ink === "#ffffff" ? "#ffffff" : opts.brand.color,
              fontSize: 40, fontWeight: 700, letterSpacing: -1, lineHeight: 1.1,
            },
            children: opts.headline,
          },
        },
        {
          type: "div",
          props: {
            style: {
              flex: 1, width: "100%", display: "flex",
              alignItems: "center", justifyContent: "center",
              paddingLeft: PAD_X, paddingRight: PAD_X, paddingBottom: PAD_B,
            },
            children: framedShot({
              frame: opts.frame, screenshotPath: opts.screenshotPath,
              screenshotSize: opts.screenshotSize,
              maxW: W - PAD_X * 2, maxH: H - HEADLINE_H - PAD_B, label: opts.label,
            }),
          },
        },
      ],
    },
  };
  return toPng(element, W, H);
}

interface ScreenshotOpts {
  brand: Brand;
  headline: string;
  name: string;
  screenshotPath: string;
  screenshotSize: { width: number; height: number };
  /** "popup" = floating card, "page" = mock browser window. Defaults to "page". */
  frame: ShotFrame;
  /** Source URL or friendly label shown in the browser address bar. */
  label: string;
  layout?: LayoutVariant;
}

/** A 1280x800 store screenshot. Layout variant is chosen by the AI in the pipeline. */
export async function renderScreenshot(opts: ScreenshotOpts): Promise<Buffer> {
  const layout = opts.layout ?? "stacked";
  if (layout === "split") return renderScreenshotSplit(opts);
  if (layout === "spotlight") return renderScreenshotSpotlight(opts);
  return renderScreenshotStacked(opts);
}

/**
 * A promo tile (small 440x280 or marquee 1400x560): name + tagline.
 *
 * If backgroundDataUrl is given (a generated image), it's used as a full-bleed
 * backdrop with a translucent brand-gradient overlay on top so the text stays
 * readable. Without it, the tile is just the solid brand gradient.
 */
export async function renderTile(opts: {
  brand: Brand;
  name: string;
  tagline: string;
  width: number;
  height: number;
  backgroundDataUrl?: string;
}): Promise<Buffer> {
  const big = opts.width >= 1000;
  const [r, g, b] = opts.brand.rgb;
  const d = opts.brand.rgb.map((v) => Math.round(v * 0.6));
  // Translucent version of the brand gradient so a background image shows
  // through but the text on top stays legible.
  const overlay = `linear-gradient(135deg, rgba(${r},${g},${b},0.80) 0%, rgba(${d[0]},${d[1]},${d[2]},0.93) 100%)`;

  const layers: any[] = [];
  if (opts.backgroundDataUrl) {
    layers.push({
      type: "img",
      props: {
        src: opts.backgroundDataUrl,
        width: opts.width,
        height: opts.height,
        style: { position: "absolute", top: 0, left: 0, objectFit: "cover" },
      },
    });
    layers.push({
      type: "div",
      props: {
        style: {
          position: "absolute", top: 0, left: 0,
          width: opts.width, height: opts.height, backgroundImage: overlay,
        },
      },
    });
  }

  const element = {
    type: "div",
    props: {
      style: {
        position: "relative",
        width: opts.width,
        height: opts.height,
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        overflow: "hidden",
        padding: big ? 80 : 36,
        // Solid gradient when there's no image; the image+overlay sit on top of it otherwise.
        backgroundImage: opts.brand.gradient,
        fontFamily: "Geist Mono",
        color: opts.brand.ink,
      },
      children: [
        ...layers,
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
