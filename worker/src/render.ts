import path from "node:path";
import { readFileSync } from "node:fs";
import satori from "satori";
import { Resvg } from "@resvg/resvg-js";
import type { LayoutVariant } from "./layoutSpec";

/**
 * Rendering pipeline: a layout description -> SVG (Satori) -> PNG (resvg-js),
 * always at an exact pixel size.
 *
 * Look: a "premium SaaS" treatment — a dark, brand-tinted mesh-gradient backdrop
 * (soft overlapping color blobs, not a flat fade), headlines set in the Geist
 * display sans, captions/labels in Geist Mono, and the product screenshot
 * floated as a glowing window with a deep, layered shadow.
 */

// ---------- fonts ----------
const SANS_DIR = path.resolve(__dirname, "..", "node_modules", "@fontsource", "geist-sans", "files");
const MONO_DIR = path.resolve(__dirname, "..", "node_modules", "@fontsource", "geist-mono", "files");
const FONTS = [
  { name: "Geist Sans", data: readFileSync(path.join(SANS_DIR, "geist-sans-latin-500-normal.woff")), weight: 500 as const, style: "normal" as const },
  { name: "Geist Sans", data: readFileSync(path.join(SANS_DIR, "geist-sans-latin-600-normal.woff")), weight: 600 as const, style: "normal" as const },
  { name: "Geist Sans", data: readFileSync(path.join(SANS_DIR, "geist-sans-latin-700-normal.woff")), weight: 700 as const, style: "normal" as const },
  { name: "Geist Mono", data: readFileSync(path.join(MONO_DIR, "geist-mono-latin-400-normal.woff")), weight: 400 as const, style: "normal" as const },
  { name: "Geist Mono", data: readFileSync(path.join(MONO_DIR, "geist-mono-latin-700-normal.woff")), weight: 700 as const, style: "normal" as const },
];

const DISPLAY = "Geist Sans";
const MONO = "Geist Mono";

// ---------- color helpers (build a rich palette from one brand color) ----------
type RGB = [number, number, number];
function hexToRgb(hex: string): RGB {
  const m = hex.replace("#", "");
  const n = m.length === 3 ? m.split("").map((c) => c + c).join("") : m;
  return [parseInt(n.slice(0, 2), 16), parseInt(n.slice(2, 4), 16), parseInt(n.slice(4, 6), 16)];
}
function rgbToHex(r: number, g: number, b: number): string {
  const h = (v: number) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0");
  return `#${h(r)}${h(g)}${h(b)}`;
}
function darken([r, g, b]: RGB, f: number): string {
  return rgbToHex(r * f, g * f, b * f);
}
/** Blend an rgb toward a target color by amount t (0..1). */
function mix([r, g, b]: RGB, [r2, g2, b2]: RGB, t: number): RGB {
  return [r + (r2 - r) * t, g + (g2 - g) * t, b + (b2 - b) * t];
}
function rgba([r, g, b]: RGB, a: number): string {
  return `rgba(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)}, ${a})`;
}
const WHITE: RGB = [255, 255, 255];

/**
 * A dark, brand-tinted mesh: three soft color blobs (a bright tint top-left, the
 * brand mid-right, the brand again bottom-right) over a deep diagonal base. White
 * text always reads cleanly on it, and the device floats with depth.
 */
function meshBackground(rgb: RGB): string {
  const tint = mix(rgb, WHITE, 0.55);
  return [
    `radial-gradient(circle at 16% 18%, ${rgba(tint, 0.5)} 0%, ${rgba(tint, 0)} 42%)`,
    `radial-gradient(circle at 86% 14%, ${rgba(rgb, 0.45)} 0%, ${rgba(rgb, 0)} 40%)`,
    `radial-gradient(circle at 80% 92%, ${rgba(rgb, 0.4)} 0%, ${rgba(rgb, 0)} 46%)`,
    `linear-gradient(155deg, ${darken(rgb, 0.34)} 0%, ${darken(rgb, 0.16)} 100%)`,
  ].join(", ");
}

export interface Brand {
  color: string;
  rgb: RGB;
  gradient: string; // legacy flat gradient (kept for callers)
  mesh: string; // premium mesh-gradient backdrop
  meshBase: string; // solid fallback color behind the mesh
  glow: string; // brand-colored halo placed behind the device
  tint: string; // light brand tint, for accent rules
  ink: string; // primary text color on the mesh (always light)
}
export function makeBrand(hex: string): Brand {
  const rgb = hexToRgb(hex);
  return {
    color: hex,
    rgb,
    gradient: `linear-gradient(135deg, ${hex} 0%, ${darken(rgb, 0.62)} 100%)`,
    mesh: meshBackground(rgb),
    meshBase: darken(rgb, 0.16),
    glow: rgba(mix(rgb, WHITE, 0.2), 0.55),
    tint: rgbToHex(...(mix(rgb, WHITE, 0.45) as RGB)),
    ink: "#ffffff",
  };
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

// A deep, layered drop shadow that lifts a light window off a dark backdrop.
// (No spread radius — resvg crashes on a negative box-shadow spread.)
const WINDOW_SHADOW =
  "0 2px 6px rgba(0,0,0,0.25), 0 22px 45px rgba(0,0,0,0.42), 0 50px 100px rgba(0,0,0,0.4)";

/** Wraps a page screenshot in a mock browser window (title bar + address pill). */
function browserFrame(screenshotPath: string, imgW: number, imgH: number, label: string) {
  return {
    type: "div",
    props: {
      style: {
        display: "flex", flexDirection: "column", width: imgW,
        borderRadius: 14, overflow: "hidden", backgroundColor: "#ffffff",
        border: "1px solid rgba(255,255,255,0.18)", boxShadow: WINDOW_SHADOW,
      },
      children: [
        {
          type: "div",
          props: {
            style: {
              display: "flex", alignItems: "center", height: BAR_H,
              paddingLeft: 16, paddingRight: 16, backgroundColor: "#f3f4f7",
              borderBottom: "1px solid rgba(15,17,26,0.06)",
            },
            children: [
              dot("#ff5f57", 8), dot("#febc2e", 8), dot("#28c840", 18),
              {
                type: "div",
                props: {
                  style: {
                    display: "flex", alignItems: "center", flex: 1, height: 24,
                    backgroundColor: "#ffffff", borderRadius: 12, paddingLeft: 14,
                    fontSize: 12, color: "#9098a6", fontFamily: MONO,
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
        border: "1px solid rgba(255,255,255,0.18)", boxShadow: WINDOW_SHADOW,
      },
      children: {
        type: "img",
        props: { src: dataUrl(screenshotPath), width: imgW, height: imgH, style: { display: "flex" } },
      },
    },
  };
}

/**
 * Places a soft brand-colored glow halo directly behind the window so it reads
 * as lit from within the backdrop, not pasted on top of it.
 */
function withGlow(windowEl: any, w: number, h: number, glow: string) {
  return {
    type: "div",
    props: {
      style: { position: "relative", display: "flex", alignItems: "center", justifyContent: "center" },
      children: [
        {
          type: "div",
          props: {
            style: {
              position: "absolute",
              left: -Math.round(w * 0.16), top: -Math.round(h * 0.2),
              width: Math.round(w * 1.32), height: Math.round(h * 1.4),
              backgroundImage: `radial-gradient(circle, ${glow} 0%, rgba(0,0,0,0) 68%)`,
            },
          },
        },
        windowEl,
      ],
    },
  };
}

/** Builds the framed screenshot element (with glow halo), sized to fit the area. */
function framedShot(opts: {
  frame: ShotFrame;
  screenshotPath: string;
  screenshotSize: { width: number; height: number };
  maxW: number;
  maxH: number;
  label: string;
  glow: string;
}) {
  if (opts.frame === "popup") {
    // Popups are small; scale them up so they read clearly, not as a tiny chip.
    const img = fit(opts.screenshotSize.width, opts.screenshotSize.height, opts.maxW, opts.maxH, 2.8);
    return withGlow(floatingCard(opts.screenshotPath, img.width, img.height), img.width, img.height, opts.glow);
  }
  // Page shots reserve room for the browser title bar above the image.
  const img = fit(opts.screenshotSize.width, opts.screenshotSize.height, opts.maxW, opts.maxH - BAR_H, 2);
  const win = browserFrame(opts.screenshotPath, img.width, img.height, addressLabel(opts.label));
  return withGlow(win, img.width, img.height + BAR_H, opts.glow);
}

// ---------- templates ----------

// "stacked" layout: eyebrow + bold headline above a framed screenshot on the mesh.
async function renderScreenshotStacked(opts: ScreenshotOpts): Promise<Buffer> {
  const W = 1280;
  const H = 800;
  const PAD = 72;
  const headlineBlock = 150;
  const maxW = W - PAD * 2;
  const maxH = H - PAD - headlineBlock;

  const element = {
    type: "div",
    props: {
      style: {
        width: W, height: H,
        display: "flex", flexDirection: "column", alignItems: "center",
        paddingTop: PAD - 8, paddingLeft: PAD, paddingRight: PAD,
        backgroundColor: opts.brand.meshBase, backgroundImage: opts.brand.mesh,
        fontFamily: DISPLAY,
      },
      children: [
        {
          type: "div",
          props: {
            style: {
              height: headlineBlock, width: "100%",
              display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
              textAlign: "center",
            },
            children: [
              {
                type: "div",
                props: {
                  style: {
                    display: "flex", fontFamily: MONO, fontSize: 13, letterSpacing: 3,
                    textTransform: "uppercase", color: opts.brand.tint, marginBottom: 14,
                  },
                  children: opts.name,
                },
              },
              {
                type: "div",
                props: {
                  style: {
                    display: "flex", color: opts.brand.ink,
                    fontSize: 52, fontWeight: 700, letterSpacing: -1.6, lineHeight: 1.08,
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
              flex: 1, width: "100%",
              display: "flex", alignItems: "center", justifyContent: "center",
            },
            children: framedShot({
              frame: opts.frame, screenshotPath: opts.screenshotPath,
              screenshotSize: opts.screenshotSize, maxW, maxH, label: opts.label, glow: opts.brand.glow,
            }),
          },
        },
      ],
    },
  };
  return toPng(element, W, H);
}

// "split" layout: mesh text panel on the left, framed screenshot on a soft field right.
async function renderScreenshotSplit(opts: ScreenshotOpts): Promise<Buffer> {
  const W = 1280;
  const H = 800;
  const LEFT_W = 460;
  const RIGHT_W = W - LEFT_W;
  const RIGHT_PAD = 64;

  const element = {
    type: "div",
    props: {
      style: {
        width: W, height: H, display: "flex", flexDirection: "row", fontFamily: DISPLAY,
      },
      children: [
        {
          type: "div",
          props: {
            style: {
              width: LEFT_W, height: H, display: "flex", flexDirection: "column",
              justifyContent: "center", padding: 60,
              backgroundColor: opts.brand.meshBase, backgroundImage: opts.brand.mesh, color: opts.brand.ink,
            },
            children: [
              {
                type: "div",
                props: {
                  style: {
                    display: "flex", fontFamily: MONO, fontSize: 13, color: opts.brand.tint,
                    marginBottom: 20, letterSpacing: 3, textTransform: "uppercase",
                  },
                  children: opts.name,
                },
              },
              {
                type: "div",
                props: {
                  style: {
                    display: "flex", fontSize: 44, fontWeight: 700, letterSpacing: -1.2, lineHeight: 1.1,
                  },
                  children: opts.headline,
                },
              },
              {
                type: "div",
                props: {
                  style: {
                    display: "flex", width: 56, height: 4, marginTop: 28, borderRadius: 999,
                    backgroundColor: opts.brand.tint,
                  },
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
              backgroundColor: "#0d0f15",
              backgroundImage: `radial-gradient(circle at 60% 40%, ${rgba(opts.brand.rgb, 0.22)} 0%, rgba(0,0,0,0) 60%)`,
              padding: RIGHT_PAD,
            },
            children: framedShot({
              frame: opts.frame, screenshotPath: opts.screenshotPath,
              screenshotSize: opts.screenshotSize,
              maxW: RIGHT_W - RIGHT_PAD * 2, maxH: H - RIGHT_PAD * 2, label: opts.label, glow: opts.brand.glow,
            }),
          },
        },
      ],
    },
  };
  return toPng(element, W, H);
}

// "spotlight" layout: mesh background, headline top-left, large framed screenshot below.
async function renderScreenshotSpotlight(opts: ScreenshotOpts): Promise<Buffer> {
  const W = 1280;
  const H = 800;
  const HEADLINE_H = 104;
  const PAD_X = 60;
  const PAD_B = 48;

  const element = {
    type: "div",
    props: {
      style: {
        width: W, height: H, display: "flex", flexDirection: "column",
        alignItems: "center", backgroundColor: opts.brand.meshBase,
        backgroundImage: opts.brand.mesh, fontFamily: DISPLAY,
      },
      children: [
        {
          type: "div",
          props: {
            style: {
              height: HEADLINE_H, width: W,
              display: "flex", flexDirection: "column", justifyContent: "center",
              paddingLeft: PAD_X, paddingRight: PAD_X,
            },
            children: [
              {
                type: "div",
                props: {
                  style: {
                    display: "flex", fontFamily: MONO, fontSize: 12, letterSpacing: 3,
                    textTransform: "uppercase", color: opts.brand.tint, marginBottom: 8,
                  },
                  children: opts.name,
                },
              },
              {
                type: "div",
                props: {
                  style: {
                    display: "flex", color: opts.brand.ink,
                    fontSize: 40, fontWeight: 700, letterSpacing: -1, lineHeight: 1.1,
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
              flex: 1, width: "100%", display: "flex",
              alignItems: "center", justifyContent: "center",
              paddingLeft: PAD_X, paddingRight: PAD_X, paddingBottom: PAD_B,
            },
            children: framedShot({
              frame: opts.frame, screenshotPath: opts.screenshotPath,
              screenshotSize: opts.screenshotSize,
              maxW: W - PAD_X * 2, maxH: H - HEADLINE_H - PAD_B, label: opts.label, glow: opts.brand.glow,
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
 * A promo tile (small 440x280 or marquee 1400x560): eyebrow + name + tagline on
 * the premium mesh backdrop, with a brand accent rule under the name.
 *
 * backgroundDataUrl is accepted for backwards-compatibility but no longer used —
 * the mesh backdrop is richer and stays on-brand for every extension.
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
        padding: big ? 90 : 40,
        backgroundColor: opts.brand.meshBase,
        backgroundImage: opts.brand.mesh,
        fontFamily: DISPLAY,
        color: opts.brand.ink,
      },
      children: [
        {
          type: "div",
          props: {
            style: {
              display: "flex", fontFamily: MONO,
              fontSize: big ? 16 : 11, letterSpacing: big ? 4 : 2.5,
              textTransform: "uppercase", color: opts.brand.tint, marginBottom: big ? 18 : 11,
            },
            children: "Chrome extension",
          },
        },
        {
          type: "div",
          props: {
            style: {
              display: "flex",
              fontSize: big ? 70 : 32,
              fontWeight: 700,
              letterSpacing: -2,
              lineHeight: 1.05,
            },
            children: opts.name,
          },
        },
        {
          type: "div",
          props: {
            style: {
              display: "flex", borderRadius: 999, backgroundColor: opts.brand.tint,
              width: big ? 64 : 40, height: big ? 5 : 3, marginTop: big ? 26 : 14,
            },
          },
        },
        {
          type: "div",
          props: {
            style: {
              display: "flex",
              marginTop: big ? 22 : 12,
              fontSize: big ? 27 : 15,
              fontWeight: 500,
              maxWidth: big ? 900 : 360,
              color: "rgba(255,255,255,0.86)",
              lineHeight: 1.3,
            },
            children: opts.tagline,
          },
        },
      ],
    },
  };
  return toPng(element, opts.width, opts.height);
}
