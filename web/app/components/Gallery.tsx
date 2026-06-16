"use client";

import { useEffect, useState } from "react";

interface FrameProps {
  images: string[];
  alt: string;
  caption: string;
  index: string;
  variant: "browser" | "simple";
  url?: string;
  onOpen: (src: string) => void;
}

function Frame({ images, alt, caption, index, variant, url, onOpen }: FrameProps) {
  const [active, setActive] = useState(0);
  const src = images[active];
  return (
    <>
      <div className="frame">
        <div className="frame-bar">
          <span className="dot" />
          <span className="dot" />
          <span className="dot" />
          {variant === "browser" && url && <span className="frame-url">{url}</span>}
        </div>
        <div className="frame-body" onClick={() => onOpen(src)}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={src} alt={alt} />
          {images.length > 1 && (
            <div className="frame-dots">
              {images.map((_, i) => (
                <button
                  key={i}
                  type="button"
                  aria-label={`Show image ${i + 1}`}
                  className={i === active ? "active" : ""}
                  onClick={(e) => {
                    e.stopPropagation();
                    setActive(i);
                  }}
                />
              ))}
            </div>
          )}
        </div>
      </div>
      <div className="frame-caption">
        <span className="frame-index">{index}</span>
        {caption}
      </div>
    </>
  );
}

export default function Gallery() {
  const [lightbox, setLightbox] = useState<string | null>(null);

  useEffect(() => {
    if (!lightbox) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setLightbox(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [lightbox]);

  return (
    <section className="gallery" aria-label="Example output">
      <div className="section-label">Example output</div>
      <h2 className="section-title">Real output, not mockups.</h2>
      <div className="gallery-bento">
        <div className="tile tile-popup">
          <Frame
            images={["/samples/screenshot-1.png"]}
            alt="Generated 1280×800 screenshot"
            caption="Screenshot · 1280×800"
            index="01"
            variant="simple"
            onOpen={setLightbox}
          />
        </div>
        <div className="tile tile-onpage">
          <Frame
            images={["/samples/screenshot-3.png"]}
            alt="Generated on-page 1280×800 screenshot"
            caption="On-page · 1280×800"
            index="02"
            variant="simple"
            onOpen={setLightbox}
          />
        </div>
        <div className="tile tile-promo">
          <Frame
            images={["/samples/small-promo-440x280.png"]}
            alt="Generated small promo tile"
            caption="Small promo · 440×280"
            index="03"
            variant="simple"
            onOpen={setLightbox}
          />
        </div>
        <div className="tile tile-marquee">
          <Frame
            images={["/samples/marquee-1400x560.png"]}
            alt="Generated marquee promo tile"
            caption="Marquee · 1400×560"
            index="04"
            variant="simple"
            onOpen={setLightbox}
          />
        </div>
      </div>
      {lightbox && (
        <div className="lightbox" onClick={() => setLightbox(null)}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={lightbox} alt="" onClick={(e) => e.stopPropagation()} />
        </div>
      )}
    </section>
  );
}
