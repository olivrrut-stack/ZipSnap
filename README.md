# ZipSnap

Auto-generate a Chrome Web Store submission kit from an extension — screenshots,
promo tiles, and a written description. The headline feature is **auto-capture**:
ZipSnap loads the extension and screenshots its *own* UI, so the developer never
has to take screenshots by hand.

## Layout

- `worker/` — the capture engine (Node + Playwright). Needs a full machine to run
  on, because loading an unpacked extension needs a real, persistent Chrome.
- `web/` — the upload website (not built yet; will live here in a later phase).

## Status: Phase 3 (rendering pipeline) — done

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

## Status: Phase 2 (AI store copy) — done

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

### Known limitation: state-dependent UIs

Some extensions only show their UI once there's real data or a logged-in
account behind them (e.g. an extension that labels *your* YouTube
subscriptions). A fresh, logged-out browser has nothing for them to act on, so
the capture comes out empty. Planned fix: a **"sign in once, then capture"**
mode that pauses for a one-time login before shooting.

### Run it

```bash
cd worker
npm install
npm run setup:browser        # one-time: downloads Playwright's Chromium

npm run spike                            # uses the bundled test extension
npm run spike -- "C:\path\to\your\ext"   # uses your own unpacked extension
```
