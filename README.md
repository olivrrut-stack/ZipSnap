# ZipSnap

Auto-generate a Chrome Web Store submission kit from an extension — screenshots,
promo tiles, and a written description. The headline feature is **auto-capture**:
ZipSnap loads the extension and screenshots its *own* UI, so the developer never
has to take screenshots by hand.

## Layout

- `worker/` — the capture engine (Node + Playwright) and HTTP API. Needs a full
  machine to run on, because loading an unpacked extension needs a real,
  persistent Chrome.
- `web/` — the upload website (Next.js). Drag in a `.zip` or folder, watch
  progress, then preview and download the finished kit.

## Status: feature-complete (capture → AI copy → render → web UI)

All four phases below are done end-to-end: drop an extension on the website,
and ZipSnap captures its screens, writes the store listing, renders the
exact-size image kit, and serves it back as a downloadable zip.

## Rendering pipeline (Phase 3)

After capture + copy, `npm run render` turns the raw captures and AI headlines
into the finished, store-ready images in `worker/output/kit/`, each verified to
be the EXACT Chrome Web Store pixel size:

- `screenshot-1..5.png` — 1280×800, captured UI framed on a branded gradient
  (in the extension's brand color) with its Geist Mono headline
- `small-promo-440x280.png` — 440×280 promo tile
- `marquee-1400x560.png` — 1400×560 promo tile

Pipeline: Satori (layout → SVG) → resvg-js (SVG → PNG). Type is Geist Mono.

Full local pipeline:

```bash
cd worker
npm run spike -- "C:\path\to\extension"   # capture screens + brand color
npm run copy                              # AI writes the listing
npm run render                            # build the exact-size image kit
```

## AI store copy (Phase 2)

After a capture, `npm run copy` reads `worker/output/capture.json` and uses
Claude to write the store listing, saved to `worker/output/copy.json`:

- short description (≤132 chars), long description (leads with one clear line,
  then features), a suggested store category, and 5 screenshot headlines.

Needs an Anthropic API key in a `.env` file (`ANTHROPIC_API_KEY=sk-ant-...`).
Note: the API is pay-as-you-go and **separate** from a Claude Pro subscription.

## Phase 1 (robust capture engine)

The capture engine can currently:

1. Load an unpacked Chrome extension into a visible Chrome window.
2. Resolve the extension's real ID (via its background service worker).
3. Read the manifest: metadata, permissions, and which screens exist.
4. Capture **every** screen that exists:
   - popup → `worker/output/popup.png` (tightly cropped)
   - options page → `worker/output/options.png` (1280×800 window)
   - content-script overlay on a neutral local demo page →
     `worker/output/content-overlay.png` (1280×800 window)
5. Extract the dominant brand color from the 128×128 icon.
6. Write a structured `worker/output/capture.json` describing everything found.

These raw captures are the *source material*. A later phase frames them onto
backgrounds built at the exact Chrome Web Store sizes (1280×800, etc.).

For content scripts, the engine is **site-aware**: extensions that only run on
specific sites are captured on a real target site (e.g. a YouTube extension is
shot on a real YouTube page), while broad "any site" extensions use the safe
built-in demo page.

### State-dependent UIs: sign in once, then capture

Some extensions only show their UI once there's real data or a logged-in
account behind them (e.g. an extension that labels *your* YouTube
subscriptions). A fresh, logged-out browser has nothing for them to act on, so
the capture would come out empty.

Pass `--login` to pause before shooting: ZipSnap opens a visible Chrome window
with your extension loaded, then waits for you to sign in to whatever
accounts/sites it needs. Press Enter in the terminal when you're ready, and
the normal capture sequence runs from there.

```bash
npm run spike -- --login "C:\path\to\your\ext"
```

This is a CLI-only flag — the hosted worker (`npm run server`) always runs
headless and captures immediately, so it's best for extensions that work fine
in a fresh, logged-out browser.

### Run it

```bash
cd worker
npm install
npm run setup:browser        # one-time: downloads Playwright's Chromium

npm run spike                            # uses the bundled test extension
npm run spike -- "C:\path\to\your\ext"   # uses your own unpacked extension
npm run spike -- --login "C:\path\to\your\ext"  # pause to sign in first
```

## Web UI

```bash
cd web
npm install
npm run dev   # http://localhost:3000
```

The website talks to the worker's HTTP API (`npm run server` in `worker/`,
default `http://localhost:4000`; override with `NEXT_PUBLIC_WORKER_URL`). Drop
in a `.zip` or a folder, and it uploads, polls job progress, then shows the
rendered images and AI-written listing with one-click copy and a kit download.

## Testing & CI

Both `worker/` and `web/` have a Vitest unit test suite covering the pure
logic (manifest parsing, content-target resolution, AI copy schema, PNG-size
verification, and the web UI's file-naming/sizing helpers):

```bash
cd worker && npm test   # or: cd web && npm test
```

A GitHub Actions workflow (`.github/workflows/ci.yml`) runs `typecheck` +
`test` for both projects (plus a production build for `web/`) on every push
and pull request.
