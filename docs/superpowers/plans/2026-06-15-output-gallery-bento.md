# Output Gallery Bento Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the "Real output, not mockups" gallery strip on the landing page with a dark-themed bento grid of four browser-chrome-framed output tiles (popup, on-page, small promo, marquee), each with a mono caption and a click-to-fullscreen lightbox.

**Architecture:** New `Gallery` component (`web/app/components/Gallery.tsx`) containing a `Frame` sub-component (chrome bar + image + optional carousel dots) and a lightbox overlay, driven by local `useState`/`useEffect`. `page.tsx` swaps its inline gallery markup for `<Gallery />`. New CSS rules in `globals.css` replace the old `.gallery-strip`/`.shot` rules. Two raw capture PNGs are copied from `worker/output/` into `web/public/samples/`.

**Tech Stack:** Next.js 15 / React 19, plain CSS (`globals.css`), Vitest + @testing-library/react for tests. No new dependencies.

---

### Task 1: Copy raw capture sample assets

**Files:**
- Create: `web/public/samples/popup.png` (copy of `worker/output/popup.png`)
- Create: `web/public/samples/on-page.png` (copy of `worker/output/content-overlay.png`)

- [ ] **Step 1: Copy the files**

```bash
cp "worker/output/popup.png" "web/public/samples/popup.png"
cp "worker/output/content-overlay.png" "web/public/samples/on-page.png"
```

- [ ] **Step 2: Verify they exist**

Run: `ls web/public/samples/`
Expected: includes `popup.png`, `on-page.png`, plus the existing `marquee-1400x560.png`, `screenshot-1.png`, `screenshot-3.png`, `small-promo-440x280.png`.

- [ ] **Step 3: Commit**

```bash
git add web/public/samples/popup.png web/public/samples/on-page.png
git commit -m "Add raw capture samples for output gallery redesign"
```

---

### Task 2: Replace gallery CSS with bento/frame/lightbox styles

**Files:**
- Modify: `web/app/globals.css:273-308` (sample gallery rules)
- Modify: `web/app/globals.css:458-463` (mobile overrides inside the existing `@media (max-width: 760px)` block)

- [ ] **Step 1: Replace the "sample gallery" block**

In `web/app/globals.css`, replace lines 273-308 (the `/* ---------- sample gallery ---------- */` block, from `.gallery {` through the closing `}` of `.shot-wide`) with:

```css
/* ---------- output gallery (bento) ---------- */
.gallery {
  margin: 88px 0 20px;
}
.gallery-bento {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  grid-template-rows: auto auto;
  gap: 16px;
}
.tile {
  display: flex;
  flex-direction: column;
}
.tile-popup {
  grid-column: 1;
  grid-row: 1 / 3;
}
.tile-onpage {
  grid-column: 2 / 4;
  grid-row: 1;
}
.tile-promo {
  grid-column: 2;
  grid-row: 2;
}
.tile-marquee {
  grid-column: 3;
  grid-row: 2;
}
.frame {
  display: flex;
  flex-direction: column;
  flex: 1;
  border-radius: var(--radius);
  border: 1px solid var(--line);
  overflow: hidden;
  background: var(--panel);
  box-shadow: 0 24px 60px rgba(0, 0, 0, 0.45);
  transition: transform 0.2s ease, box-shadow 0.2s ease;
}
.frame:hover {
  transform: translateY(-3px);
  box-shadow: 0 28px 70px rgba(66, 133, 244, 0.18);
}
.frame-bar {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 9px 10px;
  background: var(--panel-2);
  border-bottom: 1px solid var(--line-soft);
}
.frame-bar .dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  opacity: 0.35;
}
.frame-bar .dot:nth-child(1) {
  background: var(--red);
}
.frame-bar .dot:nth-child(2) {
  background: var(--yellow);
}
.frame-bar .dot:nth-child(3) {
  background: var(--green);
}
.frame-url {
  margin-left: 8px;
  font-family: var(--font-mono), monospace;
  font-size: 11px;
  color: var(--text-faint);
  background: var(--bg);
  border: 1px solid var(--line-soft);
  border-radius: 999px;
  padding: 3px 10px;
}
.frame-body {
  position: relative;
  flex: 1;
  cursor: zoom-in;
  overflow: hidden;
}
.tile-onpage .frame-body {
  aspect-ratio: 1280 / 800;
}
.tile-promo .frame-body {
  aspect-ratio: 440 / 280;
}
.tile-marquee .frame-body {
  aspect-ratio: 1400 / 560;
}
.frame-body img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
  object-position: center;
}
.frame-dots {
  position: absolute;
  bottom: 10px;
  left: 0;
  right: 0;
  display: flex;
  justify-content: center;
  gap: 6px;
}
.frame-dots button {
  width: 6px;
  height: 6px;
  padding: 0;
  border: none;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.3);
  cursor: pointer;
}
.frame-dots button.active {
  background: var(--accent-2);
}
.frame-caption {
  margin-top: 10px;
  display: flex;
  align-items: center;
  gap: 8px;
  font-family: var(--font-mono), monospace;
  font-size: 12px;
  color: var(--text-faint);
}
.frame-index {
  flex-shrink: 0;
  width: 22px;
  height: 22px;
  display: grid;
  place-items: center;
  font-size: 11px;
  color: var(--accent-2);
  border: 1px solid var(--line);
  border-radius: 6px;
}
.lightbox {
  position: fixed;
  inset: 0;
  z-index: 100;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background: rgba(0, 0, 0, 0.85);
}
.lightbox img {
  max-width: 90vw;
  max-height: 90vh;
  border-radius: 8px;
  box-shadow: 0 30px 80px rgba(0, 0, 0, 0.6);
}
```

- [ ] **Step 2: Replace the mobile gallery override**

In the same file, inside the existing `@media (max-width: 760px) { ... }` block, replace:

```css
  .gallery-strip {
    grid-template-columns: 1fr;
  }
  .shot-wide {
    grid-column: auto;
  }
```

with:

```css
  .gallery-bento {
    grid-template-columns: 1fr;
    grid-template-rows: none;
  }
  .tile-popup,
  .tile-onpage,
  .tile-promo,
  .tile-marquee {
    grid-column: auto;
    grid-row: auto;
  }
  .tile-popup .frame-body {
    aspect-ratio: 3 / 4;
  }
```

- [ ] **Step 3: Verify the dev server still compiles**

Run: `cd web && npm run typecheck`
Expected: passes (CSS changes don't affect typecheck, but confirms nothing else broke).

- [ ] **Step 4: Commit**

```bash
git add web/app/globals.css
git commit -m "Replace gallery strip styles with bento/frame/lightbox CSS"
```

---

### Task 3: Write failing tests for the Gallery component

**Files:**
- Test: `web/app/components/Gallery.test.tsx`

- [ ] **Step 1: Write the test file**

```tsx
import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import Gallery from "./Gallery";

describe("Gallery", () => {
  it("renders a captioned tile for each output type", () => {
    render(<Gallery />);
    expect(screen.getByText("Toolbar popup")).toBeInTheDocument();
    expect(screen.getByText("On-page UI")).toBeInTheDocument();
    expect(screen.getByText("Small promo · 440×280")).toBeInTheDocument();
    expect(screen.getByText("Marquee · 1400×560")).toBeInTheDocument();
  });

  it("shows the fake URL pill only on the on-page tile", () => {
    render(<Gallery />);
    expect(screen.getByText("thedailyreader.com/article")).toBeInTheDocument();
  });

  it("opens a lightbox with the clicked image and closes on backdrop click", () => {
    const { container } = render(<Gallery />);
    expect(container.querySelector(".lightbox")).not.toBeInTheDocument();

    const popup = screen.getByAltText("Generated popup screenshot");
    fireEvent.click(popup.closest(".frame-body")!);

    const lightbox = container.querySelector(".lightbox");
    expect(lightbox).toBeInTheDocument();
    expect(lightbox?.querySelector("img")).toHaveAttribute("src", "/samples/popup.png");

    fireEvent.click(lightbox!);
    expect(container.querySelector(".lightbox")).not.toBeInTheDocument();
  });

  it("closes the lightbox on Escape", () => {
    const { container } = render(<Gallery />);
    const popup = screen.getByAltText("Generated popup screenshot");
    fireEvent.click(popup.closest(".frame-body")!);
    expect(container.querySelector(".lightbox")).toBeInTheDocument();

    fireEvent.keyDown(window, { key: "Escape" });
    expect(container.querySelector(".lightbox")).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd web && npx vitest run app/components/Gallery.test.tsx`
Expected: FAIL — cannot find module `./Gallery` (it doesn't exist yet).

---

### Task 4: Implement the Gallery component

**Files:**
- Create: `web/app/components/Gallery.tsx`

- [ ] **Step 1: Write the component**

```tsx
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
            images={["/samples/popup.png"]}
            alt="Generated popup screenshot"
            caption="Toolbar popup"
            index="01"
            variant="simple"
            onOpen={setLightbox}
          />
        </div>
        <div className="tile tile-onpage">
          <Frame
            images={["/samples/on-page.png"]}
            alt="Generated on-page screenshot"
            caption="On-page UI"
            index="02"
            variant="browser"
            url="thedailyreader.com/article"
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
```

- [ ] **Step 2: Run the test to verify it passes**

Run: `cd web && npx vitest run app/components/Gallery.test.tsx`
Expected: PASS (4 tests).

- [ ] **Step 3: Commit**

```bash
git add web/app/components/Gallery.tsx web/app/components/Gallery.test.tsx
git commit -m "Add Gallery component with browser-chrome frames and lightbox"
```

---

### Task 5: Wire Gallery into the landing page

**Files:**
- Modify: `web/app/page.tsx:5` (imports)
- Modify: `web/app/page.tsx:309-318` (gallery section)

- [ ] **Step 1: Add the import**

In `web/app/page.tsx`, change:

```tsx
import Footer from "./components/Footer";
```

to:

```tsx
import Footer from "./components/Footer";
import Gallery from "./components/Gallery";
```

- [ ] **Step 2: Replace the gallery section**

Replace:

```tsx
            <section className="gallery" aria-label="Example output">
              <div className="section-label">Example output</div>
              <h2 className="section-title">Real output, not mockups.</h2>
              <div className="gallery-strip">
                <div className="shot"><img src="/samples/screenshot-1.png" alt="Generated store screenshot" /></div>
                <div className="shot"><img src="/samples/screenshot-3.png" alt="Generated store screenshot" /></div>
                <div className="shot shot-small"><img src="/samples/small-promo-440x280.png" alt="Generated small promo tile" /></div>
                <div className="shot shot-wide"><img src="/samples/marquee-1400x560.png" alt="Generated marquee promo tile" /></div>
              </div>
            </section>
```

with:

```tsx
            <Gallery />
```

- [ ] **Step 3: Run typecheck and the full web test suite**

Run: `cd web && npm run typecheck && npm test`
Expected: both pass, including the existing `Footer.test.tsx`, `utils.test.ts`, and the new `Gallery.test.tsx`.

- [ ] **Step 4: Commit**

```bash
git add web/app/page.tsx
git commit -m "Replace landing page gallery strip with bento Gallery component"
```

---

### Task 6: Manual visual verification

**Files:** none (manual check only)

- [ ] **Step 1: Start the dev server**

Run: `cd web && npm run dev`

- [ ] **Step 2: Check the section in a browser**

Open `http://localhost:3000` and confirm:
- The "Real output, not mockups" section now shows a dark bento grid matching the hero/"Three steps" theme (near-black tiles, `var(--line)` borders), with no leftover solid-blue cards.
- Each tile has a chrome bar with three muted dots; the on-page tile additionally shows the `thedailyreader.com/article` URL pill.
- Each tile has a small mono caption below it (`01 Toolbar popup`, `02 On-page UI`, `03 Small promo · 440×280`, `04 Marquee · 1400×560`).
- Clicking any tile's image opens a fullscreen lightbox; clicking the dark backdrop or pressing Escape closes it.
- Resize the window to mobile width (<760px) and confirm the bento collapses to a single column with no horizontal overflow, in order: popup, on-page, small promo, marquee.

- [ ] **Step 3: Stop the dev server** (Ctrl+C)

---

## Self-Review Notes

- **Spec coverage:** dark theme (Task 2), browser-chrome framing incl. URL pill on on-page tile (Tasks 2 & 4), removed redundant headline text (old `screenshot-1`/`screenshot-3` references dropped in Task 5), mono captions styled like step-num (`.frame-index` in Task 2), bento grid with popup/on-page/promo/marquee tiles (Tasks 2, 4, 5), carousel-ready `Frame` (Task 4, `images` array + dots), lightbox with backdrop-click/Escape close (Tasks 3 & 4), mobile single-column collapse (Task 2 Step 2).
- **Type consistency:** `Frame` props (`images`, `alt`, `caption`, `index`, `variant`, `url`, `onOpen`) used identically across Task 4's component and Task 3's tests reference only public DOM output, not internal types.
- **No placeholders:** all CSS, component, and test code is complete and final.
