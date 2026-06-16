"use client";

const TILES = [
  { src: "/samples/screenshot-1.png", caption: "Screenshot · 1280×800", index: "01", silver: false },
  { src: "/samples/screenshot-3.png", caption: "On-page · 1280×800", index: "02", silver: false },
  { src: "/samples/small-promo-440x280.png", caption: "Small promo · 440×280", index: "03", silver: true },
  { src: "/samples/marquee-1400x560.png", caption: "Marquee · 1400×560", index: "04", silver: true },
] as const;

export default function Gallery() {
  return (
    <section className="gallery" aria-label="Example output">
      <div className="section-label">Example output</div>
      <h2 className="section-title">Real output, not mockups.</h2>
      <div className="ticker-outer">
        <div className="ticker-track">
          {[...TILES, ...TILES].map((t, i) => (
            <div className="ticker-item" key={i} aria-hidden={i >= TILES.length ? true : undefined}>
              <div className={`ticker-card${t.silver ? " silver" : ""}`}>
                <div className="ticker-bar">
                  <span className="dot" />
                  <span className="dot" />
                  <span className="dot" />
                </div>
                <div className="ticker-body">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={t.src} alt={i < TILES.length ? t.caption : ""} />
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
