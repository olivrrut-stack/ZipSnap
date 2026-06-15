# "Real output, not mockups" section redesign

## Context

The landing page's gallery section, right after the hero and before "Three
steps. Zero screenshots.", currently shows four images from
`web/public/samples/` in a `.gallery-strip` grid: `screenshot-1.png`,
`screenshot-3.png`, `small-promo-440x280.png`, `marquee-1400x560.png`.

`screenshot-1.png` and `screenshot-3.png` are *rendered kit* outputs — each
already has a blue brand-color gradient background and a giant "Toolbar
Popup Window"-style headline baked into the PNG by the render pipeline
(`worker/src/render.ts`). This clashes with the near-black theme used in the
hero and "Three steps" sections, and duplicates text that also appears as
the entire content of `small-promo-440x280.png`. The tiles also have no
framing, despite the section's claim of "real output, not mockups."

This redesign replaces that strip with a themed bento grid that frames each
of ZipSnap's four distinct output types (popup/toolbar screenshot, on-page
screenshot, small promo tile, marquee tile) in minimal browser-window chrome,
removes the redundant text block, and adds a click-to-fullscreen lightbox.

Only this section changes. The hero and "Three steps" sections are untouched.

## Assets

Copy two raw, unbranded captures from `worker/output/` into
`web/public/samples/` (plain file copy, no new tooling):

- `worker/output/popup.png` → `web/public/samples/popup.png` — clean popup
  capture (white card UI, no branding baked in)
- `worker/output/content-overlay.png` → `web/public/samples/on-page.png` —
  extension badge overlaid on a demo article page

Keep the existing `small-promo-440x280.png` and `marquee-1400x560.png` —
these promo tiles are *meant* to show branded color, so they stay as real
rendered output.

Remove `screenshot-1.png` and `screenshot-3.png` from the section (files can
stay in `public/samples/` since `scripts/make-samples.ts` regenerates them,
but they're no longer referenced by the gallery).

## Components

All new code lives in `web/app/page.tsx` (already a `"use client"` component
with existing `useState`/`useRef` usage) plus new styles in
`web/app/globals.css`. No new dependencies.

### `Frame` component

Wraps one tile's image(s) in browser-window chrome + caption:

- **Chrome bar** (`.frame-bar`): three small circles on the left (`.dot`),
  muted/dimmed tones — not bright traffic-light red/yellow/green, to fit the
  dark theme. Background `var(--panel-2)`, bottom border `var(--line-soft)`.
  - `variant="browser"` (on-page tile only): adds a fake URL pill
    (`.frame-url`, mono font, e.g. `thedailyreader.com/article`) next to the
    dots, reinforcing it's a real page capture.
  - `variant="simple"` (promo tiles): dots only, no URL pill.
- **Image**: `object-fit: cover` inside a fixed-`aspect-ratio` box (same
  pattern as the current `.shot`). Clicking the image opens the lightbox.
- **Caption** (`.frame-caption`, below the frame): mono, small, styled like
  the `.step-num` badges — a bordered index box (`01`/`02`/`03`/`04`) plus a
  short label (e.g. "Toolbar popup", "On-page UI", "Small promo · 440×280",
  "Marquee · 1400×560").
- **Carousel support**: `Frame` accepts `images: string[]`. If
  `images.length > 1`, render small dot pagination under the chrome bar and
  cycle the displayed image on click. Each current tile passes a single-item
  array — the carousel UI only appears once a tile has >1 image, so this is
  free to extend later without restructuring.

### Lightbox

A single overlay rendered at the bottom of the gallery section, shown when
`lightboxSrc` state is non-null:

- `position: fixed`, full-viewport, `background: rgba(0,0,0,.85)`,
  centered image capped at e.g. `90vw`/`90vh`.
- Click on the backdrop closes it (click on the image itself does not,
  via `stopPropagation`).
- A `useEffect` adds a `keydown` listener for `Escape` while the lightbox is
  open, removed on close/unmount.

## Layout — bento grid

New `.gallery-bento` replaces `.gallery-strip`. Desktop: 3-column CSS grid,
`gap: 16px` (matches current `.gallery-strip` gap), `border-radius: var(--radius)`
tiles with `background: var(--panel)` and `border: 1px solid var(--line)`
(matching `.step`/`.shot`):

```
┌──────────┬───────────────────────┐
│          │   on-page (wide)      │
│  popup   ├────────────┬──────────┤
│  (tall)  │ small promo│ marquee  │
└──────────┴────────────┴──────────┘
```

- `.tile-popup`: grid-column 1, grid-row 1/3 (spans both rows), tall aspect
  ratio, `object-fit: cover`
- `.tile-onpage`: grid-column 2/4, grid-row 1, ~1280×800 aspect ratio,
  `variant="browser"`
- `.tile-promo`: grid-column 2, grid-row 2, 440×280 aspect ratio,
  `variant="simple"`
- `.tile-marquee`: grid-column 3, grid-row 2, 1400×560 aspect ratio (cropped
  to fit the narrower cell), `variant="simple"`

### Mobile (≤760px, existing breakpoint)

`.gallery-bento` collapses to a single column (`grid-template-columns: 1fr`,
all tiles `grid-column: auto`/`grid-row: auto`), each tile keeps its natural
aspect ratio, stacked in order: popup → on-page → small promo → marquee.

## Removed

- `.gallery-strip`, `.shot`, `.shot-small`, `.shot-wide` rules in
  `globals.css` and their corresponding mobile overrides.
- The four `<div className="shot">` image elements in `page.tsx`'s gallery
  section.
- References to `screenshot-1.png`/`screenshot-3.png` in the gallery.

## Verification

- `cd web && npm run typecheck && npm test`
- `npm run dev`, view `http://localhost:3000`:
  - confirm bento grid renders with dark theme matching hero/"Three steps"
  - confirm each tile shows browser chrome (dots, + URL pill on on-page
    tile only) and a mono caption below
  - click each image, confirm lightbox opens; click backdrop and press
    Escape, confirm it closes
  - resize to mobile width, confirm single-column stack with no overflow
