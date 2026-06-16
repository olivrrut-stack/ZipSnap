"use client";
import React from "react";

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

const S: Record<string, React.CSSProperties> = {
  label: { fontFamily: "var(--font-mono), monospace", fontSize: 10, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--accent-2)", marginBottom: 5 },
  text: { fontSize: 13, color: "var(--text)", lineHeight: 1.4 },
  textDim: { fontSize: 12.5, color: "var(--text-dim)", lineHeight: 1.45 },
  sep: { borderTop: "1px solid var(--line)", margin: "10px 0" },
  chip: { display: "inline-block", fontSize: 11, padding: "2px 8px", borderRadius: 999, border: "1px solid var(--line)", background: "var(--panel-2)", color: "var(--text-dim)", margin: "2px 2px" },
  safeItem: { display: "inline-block", fontSize: 11, fontFamily: "var(--font-mono), monospace", padding: "2px 7px", borderRadius: 6, border: "1px solid rgba(52,168,83,0.25)", background: "rgba(52,168,83,0.08)", color: "#34a853", margin: "2px 2px" },
  flagBox: { padding: "8px 10px", borderRadius: 8, border: "1px solid rgba(251,188,5,0.25)", background: "rgba(251,188,5,0.06)", marginTop: 8 },
  flagHeader: { fontFamily: "var(--font-mono), monospace", fontSize: 11, fontWeight: 600, color: "var(--yellow)", marginBottom: 3 },
  flagReason: { fontSize: 11, color: "var(--text-dim)", marginBottom: 3 },
  flagFix: { fontSize: 11, color: "var(--accent-2)" },
};

function ContentBody({ type }: { type: "store" | "keywords" | "permissions" | "privacy" | "icons" }) {
  const wrap: React.CSSProperties = { padding: "14px 14px", height: "100%", overflow: "hidden" };

  if (type === "store") return (
    <div style={wrap}>
      <div style={S.label}>Store Title</div>
      <div style={{ ...S.text, fontWeight: 580, lineHeight: 1.3, marginBottom: 10 }}>{STORE_TITLE}</div>
      <div style={S.sep} />
      <div style={S.label}>Short Description</div>
      <div style={S.textDim}>{SHORT_DESC}</div>
      <div style={S.sep} />
      <div style={S.label}>Category</div>
      <span style={{ display: "inline-block", fontSize: 12, padding: "4px 10px", borderRadius: 8, border: "1px solid var(--line)", background: "rgba(66,133,244,0.10)", color: "var(--text)" }}>Productivity</span>
    </div>
  );

  if (type === "keywords") return (
    <div style={{ ...wrap, display: "flex", flexDirection: "column", justifyContent: "center" }}>
      <div style={S.label}>Keywords</div>
      <div style={{ marginTop: 6 }}>
        {KEYWORDS.map((kw) => <span key={kw} style={S.chip}>{kw}</span>)}
      </div>
    </div>
  );

  if (type === "permissions") return (
    <div style={wrap}>
      <div style={S.label}>Permissions</div>
      <div style={{ marginBottom: 4 }}>
        {SAFE_PERMS.map((p) => <span key={p} style={S.safeItem}>✓ {p}</span>)}
      </div>
      {FLAGGED_PERMS.map((f) => (
        <div key={f.perm} style={S.flagBox}>
          <div style={S.flagHeader}>⚠ {f.perm}</div>
          <div style={S.flagReason}>{f.reason}</div>
          <div style={S.flagFix}>→ {f.fix}</div>
        </div>
      ))}
    </div>
  );

  if (type === "privacy") return (
    <div style={wrap}>
      <div style={S.label}>Privacy Policy</div>
      <div style={{ ...S.textDim, whiteSpace: "pre-line", marginTop: 4 }}>{PRIVACY}</div>
    </div>
  );

  if (type === "icons") {
    const sizes: [number, number][] = [[128, 60], [48, 44], [32, 32], [16, 20]];
    return (
      <div style={{ ...wrap, display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", gap: 14 }}>
        <div style={S.label}>Generated Icons</div>
        <div style={{ display: "flex", alignItems: "flex-end", gap: 16 }}>
          {sizes.map(([actual, display]) => (
            <div key={actual} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 7 }}>
              <div style={{
                width: display, height: display,
                borderRadius: Math.round(display * 0.22),
                background: "linear-gradient(135deg, #6f5de7 0%, #4285f4 100%)",
                border: "1px solid rgba(111,93,231,0.35)",
                display: "grid", placeItems: "center",
                color: "#fff",
                fontSize: Math.max(Math.round(display * 0.42), 9),
                fontWeight: 700,
                flexShrink: 0,
              }}>✦</div>
              <span style={{ fontFamily: "var(--font-mono), monospace", fontSize: 10, color: "var(--text-faint)" }}>{actual}px</span>
            </div>
          ))}
        </div>
        <div style={{ fontFamily: "var(--font-mono), monospace", fontSize: 10, color: "var(--text-faint)", marginTop: 2 }}>All sizes included in your kit</div>
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
  return (
    <section className="gallery" aria-label="Example output">
      <div className="section-label">Example output</div>
      <h2 className="section-title">Real output, not mockups.</h2>
      <div className="ticker-outer">
        <div className="ticker-track">
          {[...TILES, ...TILES].map((t, i) => (
            <div className="ticker-item" key={i} aria-hidden={i >= TILES.length ? true : undefined}>
              <div className="ticker-card silver">
                <div className="ticker-bar">
                  <span className="dot" />
                  <span className="dot" />
                  <span className="dot" />
                </div>
                <div className="ticker-body">
                  {t.kind === "image" ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={t.src} alt={i < TILES.length ? t.caption : ""} />
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
    </section>
  );
}
