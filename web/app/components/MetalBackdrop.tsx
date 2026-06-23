/**
 * Fixed polished-chrome backdrop. The metal look (base, technical grid, diagonal
 * reflective streaks, silver sheen) is all CSS on .metal-backdrop; this component
 * adds a sparse scatter of tiny twinkling sparkles (mostly silver, a few in Chrome
 * accent colors) on top. No image files; stays dark so the UI reads cleanly.
 */

// Deterministic positions so server and client render identically (no randomness).
const SPARKLES: Array<{ top: string; left: string; s: number; d: number; dur: number; c?: string }> = [
  { top: "11%", left: "17%", s: 3, d: 0.0, dur: 4.2 },
  { top: "7%", left: "41%", s: 2, d: 1.4, dur: 3.6 },
  { top: "19%", left: "66%", s: 4, d: 0.6, dur: 5.0, c: "blue" },
  { top: "14%", left: "83%", s: 2, d: 2.2, dur: 4.0 },
  { top: "29%", left: "9%", s: 3, d: 1.0, dur: 4.6 },
  { top: "25%", left: "52%", s: 2, d: 3.0, dur: 3.8, c: "green" },
  { top: "37%", left: "88%", s: 3, d: 0.4, dur: 4.4 },
  { top: "44%", left: "29%", s: 2, d: 2.6, dur: 5.2 },
  { top: "9%", left: "72%", s: 3, d: 1.8, dur: 4.0, c: "yellow" },
  { top: "32%", left: "76%", s: 2, d: 0.9, dur: 3.5 },
  { top: "47%", left: "61%", s: 3, d: 3.4, dur: 4.8 },
  { top: "21%", left: "36%", s: 2, d: 1.2, dur: 4.1 },
  { top: "6%", left: "26%", s: 3, d: 2.0, dur: 4.5 },
  { top: "40%", left: "47%", s: 2, d: 0.2, dur: 3.9 },
  { top: "16%", left: "94%", s: 2, d: 2.8, dur: 4.3 },
  { top: "34%", left: "19%", s: 2, d: 1.6, dur: 5.1 },
];

export default function MetalBackdrop() {
  return (
    <div aria-hidden className="metal-backdrop">
      {SPARKLES.map((sp, i) => {
        const accent = sp.c ? `var(--${sp.c})` : undefined;
        return (
          <span
            key={i}
            className="mb-sparkle"
            style={{
              top: sp.top,
              left: sp.left,
              width: sp.s,
              height: sp.s,
              animationDelay: `${sp.d}s`,
              animationDuration: `${sp.dur}s`,
              ...(accent ? { background: accent, boxShadow: `0 0 8px 1px ${accent}` } : {}),
            }}
          />
        );
      })}
    </div>
  );
}
