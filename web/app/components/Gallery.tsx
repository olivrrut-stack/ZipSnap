"use client";
import React, { useState, useEffect } from "react";

const STORE_TITLE = "FocusDash – Focus Timer & Productivity Tracker";
const SHORT_DESC =
  "Boost deep work with automatic focus tracking, pomodoro timers, and a distraction-blocking toolbar button — all without leaving your browser.";
const KEYWORDS = ["focus timer", "pomodoro", "time tracker", "deep work", "productivity", "work sessions", "distraction blocker"];
const SAFE_PERMS = ["storage", "activeTab", "alarms"];
const FLAGGED_PERMS = [
  {
    perm: "history",
    reason: "Broad browsing data access — add a clear justification to lower rejection risk.",
    fix: "Mention in store listing",
  },
];
const PRIVACY = `This Privacy Policy describes how FocusDash handles your information.

Data collected: Session timings stored locally in your browser only. No data leaves your device. No accounts required. No third-party sharing.`;

function getS(large: boolean) {
  const f = large ? 1.55 : 1;
  const p = large ? 24 : 14;
  return {
    wrap: { padding: p, height: "100%", overflow: "hidden" } as React.CSSProperties,
    label: { fontFamily: "var(--font-mono), monospace", fontSize: 10 * f, letterSpacing: "0.06em", textTransform: "uppercase" as const, color: "var(--accent-2)", marginBottom: 5 * f },
    text: { fontSize: 13 * f, color: "var(--text)", lineHeight: 1.4 } as React.CSSProperties,
    textDim: { fontSize: 12.5 * f, color: "var(--text-dim)", lineHeight: 1.45 } as React.CSSProperties,
    sep: { borderTop: "1px solid var(--line)", margin: `${10 * f}px 0` } as React.CSSProperties,
    chip: { display: "inline-block", fontSize: 11 * f, padding: `${2 * f}px ${8 * f}px`, borderRadius: 999, border: "1px solid var(--line)", background: "var(--panel-2)", color: "var(--text-dim)", margin: `${2 * f}px ${2 * f}px` } as React.CSSProperties,
    safeItem: { display: "inline-block", fontSize: 11 * f, fontFamily: "var(--font-mono), monospace", padding: `${2 * f}px ${7 * f}px`, borderRadius: 6 * f, border: "1px solid rgba(29,164,98,0.25)", background: "rgba(29,164,98,0.08)", color: "#1da462", margin: `${2 * f}px ${2 * f}px` } as React.CSSProperties,
    flagBox: { padding: `${8 * f}px ${10 * f}px`, borderRadius: 8 * f, border: "1px solid rgba(255,205,70,0.25)", background: "rgba(255,205,70,0.06)", marginTop: 8 * f } as React.CSSProperties,
    flagHeader: { fontFamily: "var(--font-mono), monospace", fontSize: 11 * f, fontWeight: 600, color: "var(--yellow)", marginBottom: 3 * f } as React.CSSProperties,
    flagReason: { fontSize: 11 * f, color: "var(--text-dim)", marginBottom: 3 * f } as React.CSSProperties,
    flagFix: { fontSize: 11 * f, color: "var(--accent-2)" } as React.CSSProperties,
  };
}

function ContentBody({ type, large = false }: { type: "store" | "keywords" | "permissions" | "privacy" | "icons"; large?: boolean }) {
  const S = getS(large);
  const f = large ? 1.55 : 1;

  if (type === "store") return (
    <div style={S.wrap}>
      <div style={S.label}>Store Title</div>
      <div style={{ ...S.text, fontWeight: 580, lineHeight: 1.3, marginBottom: 10 * f }}>{STORE_TITLE}</div>
      <div style={S.sep} />
      <div style={S.label}>Short Description</div>
      <div style={S.textDim}>{SHORT_DESC}</div>
      <div style={S.sep} />
      <div style={S.label}>Category</div>
      <span style={{ display: "inline-block", fontSize: 12 * f, padding: `${4 * f}px ${10 * f}px`, borderRadius: 8 * f, border: "1px solid var(--line)", background: "rgba(76,139,245,0.10)", color: "var(--text)" }}>Productivity</span>
    </div>
  );

  if (type === "keywords") return (
    <div style={{ ...S.wrap, display: "flex", flexDirection: "column", justifyContent: "center" }}>
      <div style={S.label}>Keywords</div>
      <div style={{ marginTop: 6 * f }}>
        {KEYWORDS.map((kw) => <span key={kw} style={S.chip}>{kw}</span>)}
      </div>
    </div>
  );

  if (type === "permissions") return (
    <div style={S.wrap}>
      <div style={S.label}>Permissions</div>
      <div style={{ marginBottom: 4 * f }}>
        {SAFE_PERMS.map((p) => <span key={p} style={S.safeItem}>✓ {p}</span>)}
      </div>
      {FLAGGED_PERMS.map((item) => (
        <div key={item.perm} style={S.flagBox}>
          <div style={S.flagHeader}>⚠ {item.perm}</div>
          <div style={S.flagReason}>{item.reason}</div>
          <div style={S.flagFix}>→ {item.fix}</div>
        </div>
      ))}
    </div>
  );

  if (type === "privacy") return (
    <div style={S.wrap}>
      <div style={S.label}>Privacy Policy</div>
      <div style={{ ...S.textDim, whiteSpace: "pre-line", marginTop: 4 * f }}>{PRIVACY}</div>
    </div>
  );

  if (type === "icons") {
    const sizes: [number, number][] = [[128, 60], [48, 44], [32, 32], [16, 20]];
    return (
      <div style={{ ...S.wrap, display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", gap: 14 * f }}>
        <div style={S.label}>Generated Icons</div>
        <div style={{ display: "flex", alignItems: "flex-end", gap: 16 * f }}>
          {sizes.map(([actual, display]) => {
            const px = display * (large ? 1.5 : 1);
            return (
              <div key={actual} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 7 * f }}>
                <div style={{
                  width: px, height: px,
                  borderRadius: Math.round(px * 0.22),
                  background: "linear-gradient(135deg, #6f5de7 0%, #4c8bf5 100%)",
                  border: "1px solid rgba(111,93,231,0.35)",
                  display: "grid", placeItems: "center",
                  color: "#fff",
                  fontSize: Math.max(Math.round(px * 0.42), 9),
                  fontWeight: 700,
                  flexShrink: 0,
                }}>✦</div>
                <span style={{ fontFamily: "var(--font-mono), monospace", fontSize: 10 * f, color: "var(--text-faint)" }}>{actual}px</span>
              </div>
            );
          })}
        </div>
        <div style={{ fontFamily: "var(--font-mono), monospace", fontSize: 10 * f, color: "var(--text-faint)", marginTop: 2 * f }}>All sizes included in your kit</div>
      </div>
    );
  }

  return null;
}

type Tile =
  | { kind: "image"; src: string; caption: string; index: string }
  | { kind: "content"; type: "store" | "keywords" | "permissions" | "privacy" | "icons"; caption: string; index: string };

const TILES: Tile[] = [
  { kind: "image", src: "/samples/screenshot-1.png", caption: "Screenshot · 1280×800", index: "01" },
  { kind: "image", src: "/samples/screenshot-3.png", caption: "On-page · 1280×800", index: "02" },
  { kind: "image", src: "/samples/small-promo-440x280.png", caption: "Small promo · 440×280", index: "03" },
  { kind: "image", src: "/samples/marquee-1400x560.png", caption: "Marquee · 1400×560", index: "04" },
  { kind: "content", type: "store", caption: "Store listing · AI-written", index: "05" },
  { kind: "content", type: "keywords", caption: "Keywords · 7 generated", index: "06" },
  { kind: "content", type: "permissions", caption: "Permissions · risk report", index: "07" },
  { kind: "content", type: "privacy", caption: "Privacy policy · paste-ready", index: "08" },
  { kind: "content", type: "icons", caption: "Icons · 128 / 48 / 32 / 16 px", index: "09" },
];

export default function Gallery() {
  const [selected, setSelected] = useState<number | null>(null);

  useEffect(() => {
    if (selected === null) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setSelected(null); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [selected]);

  // Prevent body scroll when modal open
  useEffect(() => {
    document.body.style.overflow = selected !== null ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [selected]);

  const tile = selected !== null ? TILES[selected] : null;

  return (
    <section className="gallery" aria-label="Example output">
      <div className="section-label">Example output</div>
      <h2 className="section-title">Real output, not mockups.</h2>
      <div className="ticker-outer">
        <div className="ticker-track">
          {[...TILES, ...TILES].map((t, i) => (
            <div
              className="ticker-item"
              key={i}
              aria-hidden={i >= TILES.length ? true : undefined}
              role={i < TILES.length ? "button" : undefined}
              tabIndex={i < TILES.length ? 0 : -1}
              onClick={() => setSelected(i % TILES.length)}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") setSelected(i % TILES.length); }}
            >
              <div className="ticker-card silver">
                <div className="ticker-bar">
                  <span className="dot" />
                  <span className="dot" />
                  <span className="dot" />
                </div>
                <div className="ticker-body">
                  {t.kind === "image" ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={t.src} alt={i < TILES.length ? t.caption : ""} loading="lazy" decoding="async" />
                  ) : (
                    <ContentBody type={t.type} />
                  )}
                </div>
              </div>
              <div className="ticker-caption">
                <span className="frame-index">{t.index}</span>
                {t.caption}
              </div>
            </div>
          ))}
        </div>
      </div>

      {tile && (
        <div className="tile-modal-backdrop" onClick={() => setSelected(null)}>
          <div
            className={`tile-modal${tile.kind === "image" ? " tile-modal--image" : " tile-modal--content"}`}
            onClick={(e) => e.stopPropagation()}
          >
            <button className="tile-modal-close" onClick={() => setSelected(null)} aria-label="Close">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M6 6l12 12M18 6L6 18" />
              </svg>
            </button>
            <div className="tile-modal-bar">
              <span className="dot" /><span className="dot" /><span className="dot" />
            </div>
            <div className="tile-modal-body">
              {tile.kind === "image" ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={tile.src} alt={tile.caption} className="tile-modal-img" />
              ) : (
                <ContentBody type={tile.type} large />
              )}
            </div>
            <div className="tile-modal-caption">
              <span className="frame-index">{tile.index}</span>
              {tile.caption}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
