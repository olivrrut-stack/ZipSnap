# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

ZipSnap auto-generates a Chrome Web Store submission kit from an unpacked
extension: screenshots, promo tiles, and AI-written store copy. The headline
feature is **auto-capture** — ZipSnap loads the extension itself and
screenshots its own UI, so the developer never takes screenshots by hand.

## Layout

- `worker/` — capture engine (Node + Playwright/Chromium) and HTTP API. Needs
  a real machine, since loading an unpacked extension requires a persistent
  Chrome instance (not just a serverless function).
- `web/` — upload website (Next.js 15 / React 19). Drag in a `.zip` or
  folder, watch job progress, then preview and download the finished kit.

These are two independent npm projects with separate `package.json`,
`tsconfig.json`, and `vitest.config`.

## Commands

All commands are run from inside `worker/` or `web/` (not the repo root).

```bash
cd worker
npm install
npm run setup:browser   # one-time: downloads Playwright's Chromium
npm run spike            # CLI capture using the bundled fixture extension
npm run spike -- "C:\path\to\extension"          # capture a real extension
npm run spike -- --login "C:\path\to\extension"  # pause to sign in before capturing (CLI-only)
npm run copy             # AI writes store listing from output/capture.json -> output/copy.json
npm run render           # build the exact-size image kit into output/kit/
npm run server           # start the HTTP API (default http://localhost:4000)
npm run typecheck
npm test                 # vitest run
npm test -- contentTarget.test.ts   # run a single test file
```

```bash
cd web
npm install
npm run dev        # http://localhost:3000
npm run typecheck
npm test
npm test -- utils.test.ts
```

The web UI talks to the worker's HTTP API. Override the URL with
`NEXT_PUBLIC_WORKER_URL` (defaults to `http://localhost:4000`).

A GitHub Actions workflow (`.github/workflows/ci.yml`) runs `typecheck` +
`test` for both projects, plus a production build for `web/`, on every push
and PR.

## Required environment

`worker/` needs an Anthropic API key for AI store copy generation, in a
`.env` file at the repo root or in `worker/`:

```
ANTHROPIC_API_KEY=sk-ant-...
```

(This is a pay-as-you-go API key, separate from a Claude Pro subscription.)

## Architecture: the pipeline (`worker/src/`)

The core flow is **capture -> AI copy -> render**, implemented as reusable
functions in `pipeline.ts` (`runCapture`, `runRender`) that are shared by the
CLI (`index.ts`, `generateCopy.ts`, `renderKit.ts`) and the HTTP server
(`server.ts`).

1. **Capture** (`runCapture` in `pipeline.ts`)
   - `manifest.ts` reads `manifest.json`, extracts metadata
     (`extractMeta`) and detects which UI surfaces exist (`detectSurfaces`):
     popup, options page, content scripts.
   - `extensionContext.ts` launches a persistent Chrome with the extension
     loaded (`launchExtension`) and resolves its real extension ID via the
     background service worker (`resolveExtensionId`).
   - `brandColor.ts` extracts a dominant brand color from the 128px icon.
   - `capture.ts` screenshots each surface: `capturePopup` (tightly
     cropped), `captureOptions` (1280x800 window), `captureContentOverlay`.
   - For content scripts, `contentTarget.ts` (`resolveContentTarget`)
     decides *where* to capture: if any `matches` pattern is broad
     (`<all_urls>` or a `*` host), the built-in local demo page
     (`demoServer.ts`) is used; if all patterns target specific sites (e.g.
     `*://*.youtube.com/*`), a real page on that site is visited instead
     (with `LANDING_HINTS` for sites that are empty when logged out, like
     YouTube).
   - Everything is written to `capture.json` (shape defined in `types.ts`:
     `CaptureResult`, `ExtensionMeta`, `DetectedSurfaces`, `CapturedSurface`).
   - `--login`/`--interactive` (CLI-only, ignored when
     `ZIPSNAP_HEADLESS=1`): pauses with a visible browser so the user can
     sign in to accounts the extension needs before capture proceeds.

2. **AI copy** (`copy.ts` / `generateStoreCopy`)
   - Sends `capture.json` to Claude to produce `StoreCopy`: short/long
     description, suggested store category, and 5 screenshot headlines.
   - Written to `copy.json`.

3. **Render** (`runRender` in `pipeline.ts`, using `render.ts`)
   - `makeBrand` derives a brand palette from `capture.brandColor`.
   - Pipeline: Satori (layout -> SVG) -> resvg-js (SVG -> PNG). Typeface is
     Geist Mono.
   - Produces, into `output/kit/`: `screenshot-1..5.png` (1280x800, captured
     UI framed on a branded gradient with a headline from `copy.json`),
     `small-promo-440x280.png`, `marquee-1400x560.png`.
   - `pipeline.ts` also exports `pngSize`/`saveVerified`, which read the PNG
     header to assert every output file is the *exact* required Chrome Web
     Store pixel size before writing it.

## Architecture: the HTTP API (`worker/src/server.ts`)

Stateless-per-process job model used by the web frontend:

- `POST /api/jobs` — accepts a `.zip` upload (multer, in-memory), extracts
  it to a temp job folder, locates the subfolder containing `manifest.json`
  (`findManifestDir`, handles nested zips), then kicks off `processJob`
  in the background (`status`: `queued -> capturing -> writing -> rendering
  -> packaging -> done`/`error`). Returns a `jobId` immediately; client
  polls for status.
- `processJob` runs `runCapture` -> `generateStoreCopy` -> `runRender`,
  then zips `kit/` plus a generated `descriptions.txt` into
  `zipsnap-kit.zip`.
- `GET /api/jobs/:id` — poll status/step/error and (when done) the image
  list and `copy`.
- `GET /api/jobs/:id/image/:name` — serve a single rendered preview image.
- `GET /api/jobs/:id/kit` — download the finished kit zip.
- Job folders live under `os.tmpdir()/zipsnap-jobs/<id>` and are purged
  after `JOB_TTL_MS` (24h) by a periodic `cleanupOldJobs` sweep.
- The server forces `ZIPSNAP_HEADLESS=1`, so it always runs Chrome headless
  and never enables the `--login` sign-in pause (CLI-only feature).

## Architecture: web app (`web/app/`)

- `page.tsx` — main upload/progress/preview UI: drop a `.zip` or folder,
  upload to the worker API, poll job status, then show rendered images and
  AI copy with copy-to-clipboard and kit download.
- `lib/utils.ts` — pure helpers shared with tests: `sizeOf` (maps a kit
  filename to its Chrome Web Store dimensions for display) and `deriveName`
  (names the uploaded zip from a dropped folder).
- `components/` — `Footer.tsx`, `LegalNav.tsx`.
- `layout.tsx`, `robots.ts`, `sitemap.ts` — SEO/metadata (Open Graph,
  Twitter cards, sitemap, robots, JSON-LD).

## Testing

Both projects use Vitest for pure-logic unit tests (no browser/Chrome
needed): manifest parsing and content-target resolution
(`worker/src/manifest.test.ts`, `contentTarget.test.ts`), AI copy schema
(`copy.test.ts`), pipeline PNG-size verification (`pipeline.test.ts`), and
the web UI's file-naming/sizing helpers (`web/app/lib/utils.test.ts`) plus
component tests (`Footer.test.tsx`).
