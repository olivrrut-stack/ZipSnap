# Accent Color Picker — Design Spec

**Date:** 2026-06-16

## Problem

ZipSnap currently renders all kit images using the auto-extracted brand color from the extension's icon. This defaults to a purple (`#6d5efc`) when no icon is found, and always uses the extracted color even if the user would prefer something different. Users have no control over the output color.

## Goal

Default all renders to neutral gray. Let users pick any accent color from a swatch grid or hex input after the kit is generated, then re-render the full kit with that color in ~5–10 seconds.

## What Gets Colored

- Screenshot backgrounds (gradient)
- Small promo tile background (440×280)
- Marquee tile background (1400×560)
- Generated icon backgrounds (128/48/32/16px)

## Default Color

`#64748b` (slate gray). Applied to every initial render. The auto-extracted brand color is still captured and stored in the job but no longer drives rendering.

## User Flow

1. User uploads extension → job runs → kit renders in gray
2. Results panel shows images + color picker panel to the right of the Download button
3. User clicks a swatch or types a hex code
4. User clicks **Apply**
5. Images stay visible at reduced opacity with a spinner overlay (~5–10s)
6. Images swap to the re-rendered version; spinner clears

## Color Picker UI

Positioned in the `panel-head` div, to the right of "Download kit (.zip)". Always visible once the job is done — no toggle.

**Layout (top to bottom):**
- 6×4 grid of 24 preset swatches (small rounded squares)
- Hex input field
- Apply button (full width, disabled when picker color matches rendered color)

**Selected state:** The swatch matching the currently-rendered color shows a white ring.

**Swatch palette:**

| Row | Colors |
|-----|--------|
| Neutrals | `#64748b` `#6b7280` `#78716c` `#71717a` `#374151` `#1e1e2e` |
| Blues/purples | `#1e3a8a` `#2563eb` `#7c3aed` `#9333ea` `#4f46e5` `#0d9488` |
| Greens/warm | `#166534` `#059669` `#d97706` `#ea580c` `#dc2626` `#be123c` |
| Softer | `#0284c7` `#0891b2` `#65a30d` `#db2777` `#e11d48` `#92400e` |

## Server Changes

### `worker/src/brandColor.ts`
- Change `FALLBACK` from `#6d5efc` to `#64748b`

### `worker/src/server.ts` — `processJob`
- Pass `#64748b` as `colorOverride` to `runRender` and `generateIcons` so initial render is always gray

### `worker/src/server.ts` — new route
`POST /api/jobs/:id/rerender`
- Request body: `{ color: string }` (validated as 6-digit hex)
- Job must be in `done` state
- Sets job status to `rendering`
- Re-runs: `runRender(capture, copy, outputDir, color)` + `generateIcons(name, desc, color, outputDir)` + repackages zip
- Sets job back to `done`, updates `job.images` + `job.iconFiles`
- Returns: `{ images: string[], iconKit: { files: string[] } }`

### `worker/src/render.ts` / pipeline
- `runRender` accepts optional `colorOverride?: string`; uses it instead of `capture.brandColor` when provided

## Web UI Changes (`web/app/page.tsx`)

### New state in `Results`
- `accentColor: string` — color currently rendered (starts `#64748b`)
- `pickerColor: string` — color selected in picker (starts same)
- `rerendering: boolean`

### Re-render call
```
POST /api/jobs/:id/rerender { color: pickerColor }
```
On response: update `job.images`, `job.iconKit`, set `accentColor = pickerColor`, clear `rerendering`.

### Spinner overlay
During re-render: image grid gets `opacity: 0.4`, centered spinner overlaid. Images remain in the DOM.

## Files to Modify

- `worker/src/brandColor.ts` — change fallback constant
- `worker/src/render.ts` — add `colorOverride` param to `runRender`
- `worker/src/server.ts` — update `processJob`, add rerender route
- `web/app/page.tsx` — add color picker UI, rerender state, spinner overlay

## Verification

1. Fresh job renders gray by default — no purple
2. Picking a swatch + Apply triggers re-render; spinner shows during wait
3. Images update to new color after re-render
4. Hex input accepts custom color; Apply re-renders with it
5. Apply button disabled when picker color matches rendered color
6. Download zip contains images in the selected color
7. `npm test` passes in both `worker/` and `web/`
