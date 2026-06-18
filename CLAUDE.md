# CLAUDE.md

ZipSnap auto-generates a Chrome Web Store submission kit from an unpacked extension: screenshots, promo tiles, and AI-written store copy. The headline feature is **auto-capture** — ZipSnap loads the extension itself and screenshots its own UI.

## Communication style

When explaining things, always use plain language — no technical jargon. If a technical term is unavoidable, give a one-sentence plain-English definition right after it.

## Layout

Two independent npm projects (separate `package.json`, `tsconfig.json`, `vitest.config`):

- `worker/` — capture engine (Node + Playwright/Chromium) and HTTP API. Requires a real machine; loading an unpacked extension needs a persistent Chrome instance.
- `web/` — upload website (Next.js 15 / React 19). Drop a `.zip` or folder, watch progress, preview and download the kit.

## Commands

Run from inside `worker/` or `web/` (not the repo root).

```bash
cd worker
npm install
npm run setup:browser   # one-time: download Playwright's Chromium
npm run spike            # CLI capture using the bundled fixture extension
npm run spike -- "C:\path\to\extension"
npm run spike -- --login "C:\path\to\extension"  # pause to sign in (CLI-only)
npm run copy             # AI store listing: capture.json -> copy.json
npm run render           # build image kit -> output/kit/
npm run server           # HTTP API at http://localhost:4000
npm run typecheck
npm test
npm test -- contentTarget.test.ts
```

```bash
cd web
npm install
npm run dev        # http://localhost:3000
npm run typecheck
npm test
npm test -- utils.test.ts
```

Web UI talks to the worker API. Override with `NEXT_PUBLIC_WORKER_URL` (default `http://localhost:4000`).

CI (`.github/workflows/ci.yml`) runs `typecheck` + `test` for both projects, plus a `web/` production build, on every push/PR.

## Environment

`worker/` needs an Anthropic API key in `.env` at the repo root or in `worker/`:

```
ANTHROPIC_API_KEY=sk-ant-...
```

## Architecture: pipeline (`worker/src/`)

Core flow: **capture → AI copy → render**, via `runCapture`/`runRender` in `pipeline.ts`, shared by CLI and HTTP server.

**1. Capture** (`runCapture`)
- `manifest.ts` — reads `manifest.json`, extracts metadata (`extractMeta`), detects surfaces (`detectSurfaces`): popup, options, content scripts.
- `extensionContext.ts` — launches persistent Chrome with the extension loaded, resolves extension ID via background service worker.
- `brandColor.ts` — extracts dominant brand color from the 128px icon.
- `capture.ts` — screenshots each surface: `capturePopup` (tight crop), `captureOptions` (1280×800), `captureContentOverlay`.
- `contentTarget.ts` (`resolveContentTarget`) — for content scripts, uses the local demo page (`demoServer.ts`) for broad patterns (`<all_urls>`, `*` host), or visits the real site for specific patterns (with `LANDING_HINTS` for login-walled sites like YouTube).
- Output: `capture.json` (`CaptureResult`, `ExtensionMeta`, `DetectedSurfaces`, `CapturedSurface` from `types.ts`).
- `--login` pauses for sign-in; ignored when `ZIPSNAP_HEADLESS=1`.

**2. AI copy** (`copy.ts` / `generateStoreCopy`)
- Sends `capture.json` to Claude → `StoreCopy`: short/long description, category, 5 screenshot headlines → `copy.json`.

**3. Render** (`runRender`, using `render.ts`)
- `makeBrand` derives palette from `brandColor`. Pipeline: Satori → SVG → resvg-js → PNG. Typeface: Geist Mono.
- Output in `output/kit/`: `screenshot-1..5.png` (1280×800), `small-promo-440x280.png`, `marquee-1400x560.png`.
- `pngSize`/`saveVerified` assert exact Chrome Web Store pixel sizes before writing.

## Architecture: HTTP API (`worker/src/server.ts`)

Stateless job model; client polls for status.

- `POST /api/jobs` — accepts `.zip` (multer, in-memory), extracts to temp folder, locates `manifest.json` (`findManifestDir`), runs `processJob` in background. Status: `queued → capturing → writing → rendering → packaging → done/error`.
- `processJob` — runs `runCapture → generateStoreCopy → runRender`, then zips `kit/` + `descriptions.txt` into `zipsnap-kit.zip`.
- `GET /api/jobs/:id` — poll status/step/error; returns image list and `copy` when done.
- `GET /api/jobs/:id/image/:name` — serve a preview image.
- `GET /api/jobs/:id/kit` — download the finished kit zip.
- Jobs live in `os.tmpdir()/zipsnap-jobs/<id>`, purged after 24h by `cleanupOldJobs`.
- Server forces `ZIPSNAP_HEADLESS=1`; `--login` is never enabled server-side.

## Architecture: web app (`web/app/`)

- `page.tsx` — upload/progress/preview UI: drop zip/folder, upload, poll status, show images + AI copy, copy-to-clipboard, kit download.
- `lib/utils.ts` — `sizeOf` (filename → Chrome Web Store dimensions) and `deriveName` (names zip from dropped folder).
- `components/` — `Footer.tsx`, `LegalNav.tsx`.
- `layout.tsx`, `robots.ts`, `sitemap.ts` — Open Graph, Twitter cards, sitemap, JSON-LD.

## Testing

Vitest unit tests (no browser needed): manifest parsing, content-target resolution, AI copy schema, PNG-size verification (`worker/src/`), file-naming/sizing helpers, component tests (`web/app/`).
