# CLAUDE.md

ZipSnap auto-generates a Chrome Web Store submission kit from an unpacked extension: screenshots, promo tiles, and AI-written store copy. The headline feature is **auto-capture** — ZipSnap loads the extension itself and screenshots its own UI.

## Communication style

When explaining things, always use plain language — no technical jargon. If a technical term is unavoidable, give a one-sentence plain-English definition right after it.

After every significant code change, explain what changed to the user in simple, plain-English terms — no jargon, no technical detail unless asked.

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
- `manifest.ts` — reads `manifest.json`, extracts metadata (`extractMeta`), detects surfaces (`detectSurfaces`): popup, options, content scripts. `checkManifestHealth` returns warnings/errors the UI surfaces.
- `extensionContext.ts` — launches persistent Chrome with the extension loaded, resolves extension ID via background service worker. Extensions without a service worker get a stub injected via `withServiceWorker`.
- `brandColor.ts` — extracts dominant brand color from the 128px icon.
- `capture.ts` — screenshots each surface: `capturePopup` (tight crop), `captureOptions` (1280×800), `captureContentOverlay`. All screenshots go through `forceScreenshot`, which tries Playwright first (8s timeout) then falls back to a raw CDP `Page.captureScreenshot` call (10s timeout) — needed for heavy SPAs like LinkedIn that never reach Playwright's idle-paint state.
- `contentTarget.ts` (`resolveContentTarget`) — for content scripts, uses the local demo page (`demoServer.ts`) for broad patterns (`<all_urls>`, `*` host), or visits the real site for specific patterns. `LANDING_HINTS` maps known sites to content-rich or login-walled entry URLs (e.g. `linkedin.com` → `/login`) so login detection fires correctly.
- Login wall detection: if `captureContentOverlay` lands on a login page (password field, login URL pattern), it calls `opts.onLoginNeeded`. The server uses this to pause the job, stream the live browser to the user via WebSocket, and wait for the user to sign in. After login, if the browser is already on the target domain, navigation is skipped — the extension is already running on the post-login page. Only navigates to the domain root if somehow on a different domain.
- Output: `capture.json` (`CaptureResult`, `ExtensionMeta`, `DetectedSurfaces`, `CapturedSurface` from `types.ts`).

**2. AI copy** (`copy.ts` / `generateStoreCopy`)
- Sends `capture.json` to Claude → `StoreCopy`: title, short/long description, category, 5 screenshot headlines, 7 keywords, permissions analysis with flagged risks and listing justifications, privacy policy → `copy.json`.

**3. Render** (`runRender`, using `render.ts`)
- `makeBrand` derives palette from `brandColor` (or a user-supplied override color). Pipeline: Satori → SVG → resvg-js → PNG. Typeface: Geist Mono.
- Output in `output/kit/`: `screenshot-1..5.png` (1280×800), `small-promo-440x280.png`, `marquee-1400x560.png`.
- `pngSize`/`saveVerified` assert exact Chrome Web Store pixel sizes before writing.

**4. Icon generation** (`iconGeneration.ts` / `generateIcons`)
- Generates branded extension icons at 128/48/32/16px using the extension name, description, and brand color. Output in `output/icons/`. Best-effort — failure doesn't fail the job.

## Architecture: HTTP API (`worker/src/server.ts`)

Stateless job model; client polls for status.

**Job lifecycle:** `queued → capturing → awaiting-login (optional) → writing → rendering → packaging → done/error`

**Core endpoints:**
- `POST /api/jobs` — accepts `.zip` (multer, 25 MB limit, in-memory), runs zip-bomb guard (`inspectZip`), extracts to temp folder, locates `manifest.json` (`findManifestDir`), enqueues job. Returns `{ jobId }`.
- `processJob` — runs `runCapture → generateStoreCopy → runRender → generateIcons`, then zips `kit/` + `icons/` + `descriptions.txt` into `zipsnap-kit.zip`.
- `GET /api/jobs/:id` — poll status/step/error; returns `images`, `copy`, `manifestHealth`, `brandColor`, `iconKit` when done.
- `GET /api/jobs/:id/image/:name` — serve a rendered kit image preview.
- `GET /api/jobs/:id/icon/:name` — serve a generated icon preview.
- `GET /api/jobs/:id/kit` — download the finished kit zip.
- `POST /api/jobs/:id/rerender` — re-render the kit with a new brand color; returns updated image list.
- `POST /api/jobs/:id/recopy` — re-run AI copy generation for a finished job; returns new copy.
- `POST /api/subscribe` — log an email subscriber to Railway stdout as `[SUBSCRIBER]` JSON.

**Browser interaction endpoints** (all rate-limited, only valid during `awaiting-login`):
- `GET /api/jobs/:id/browser-snapshot` — single JPEG screenshot of the live browser (HTTP fallback for first frame).
- `WS /api/jobs/:id/browser-stream` — WebSocket that pushes JPEG frames via CDP `Page.startScreencast` (~50ms latency). Frames stop when login completes or times out.
- `POST /api/jobs/:id/browser-click` — relay a click at fractional coordinates `{ xFrac, yFrac }`.
- `POST /api/jobs/:id/browser-type` — relay a keystroke `{ text }` (supports "Backspace", "Enter", or a single character).
- `POST /api/jobs/:id/browser-scroll` — relay a scroll `{ deltaY }`.
- `POST /api/jobs/:id/browser-back` — navigate the browser back one step.
- `POST /api/jobs/:id/browser-reload` — reload the browser page.
- `POST /api/jobs/:id/login-done` — signal login complete; resumes the paused capture.

**Screencast internals:** `startScreencast` opens a CDP session on the login page and calls `Page.startScreencast`. Each frame is acknowledged and pushed as a JPEG buffer to all connected WebSocket clients. `stopScreencast` races `Page.stopScreencast` and `cdp.detach()` each against short timeouts (5s / 3s) so a navigated/dead CDP session can't hang the pipeline.

**Infrastructure:**
- Concurrency: `MAX_CONCURRENT_JOBS` (default 2, env-configurable). Extra jobs queue in memory up to `MAX_PENDING_JOBS` (50), then return 503.
- Rate limiting: job creation (10/hour), rerender (5/min), recopy (3/min), browser interaction (300/min).
- Zip-bomb guard: rejects zips with >5000 entries, >250 MB uncompressed, or >200× compression ratio.
- Analytics: `logEvent` emits `[EVENT]` JSON lines to stdout at `job_created`, `job_started`, `job_capture_done`, `job_done`, `job_error`, `job_recopy`.
- Jobs live in `os.tmpdir()/zipsnap-jobs/<id>`, purged after 24h by `cleanupOldJobs`.
- Server forces `ZIPSNAP_HEADLESS=1`; login panel is server-side only.

## Architecture: web app (`web/app/`)

- `page.tsx` — main UI. Upload (drop zip/folder or click to browse), poll status with 2s interval, show progress bar + elapsed timer, login panel with live browser view during `awaiting-login`, results panel with image grid, AI copy blocks, brand color picker (swatches + hex input), "Apply" re-render, "Regenerate copy", email capture form, kit download, "Generate another" / "Try again" buttons.
- `lib/utils.ts` — `sizeOf` (filename → Chrome Web Store dimensions) and `deriveName` (names zip from dropped folder).
- `components/Gallery.tsx` — animated ticker showcasing sample output tiles.
- `components/Footer.tsx`, `LegalNav.tsx`.
- `layout.tsx`, `robots.ts`, `sitemap.ts` — Open Graph, Twitter cards, sitemap, JSON-LD.

**Key UI behaviors:**
- Elapsed timer runs for the full job duration including `awaiting-login` pause.
- During `awaiting-login`: WebSocket connects to `browser-stream`, frames are displayed as blob URLs (revoked on each new frame). Falls back to the HTTP snapshot endpoint until the first WS frame arrives.
- On error: shows "Try again" (re-runs same extension) and "Try another extension" (clears state).
- Color picker: 24 preset swatches + free hex input. "Apply" calls `rerender`; images fade to 40% opacity with a spinner while re-rendering.

## Testing

Vitest unit tests (no browser needed): manifest parsing, content-target resolution, AI copy schema, PNG-size verification (`worker/src/`), file-naming/sizing helpers, component tests (`web/app/`). 47 worker tests, 13 web tests.

## Skill routing

When the user's request matches an available skill, invoke it via the Skill tool. The
skill has multi-step workflows, checklists, and quality gates that produce better
results than an ad-hoc answer. When in doubt, invoke the skill. A false positive is
cheaper than a false negative.

Key routing rules:
- Product ideas, "is this worth building", brainstorming → invoke /office-hours
- Strategy, scope, "think bigger", "what should we build" → invoke /plan-ceo-review
- Architecture, "does this design make sense" → invoke /plan-eng-review
- Design system, brand, "how should this look" → invoke /design-consultation
- Design review of a plan → invoke /plan-design-review
- Developer experience of a plan → invoke /plan-devex-review
- "Review everything", full review pipeline → invoke /autoplan
- Bugs, errors, "why is this broken", "wtf", "this doesn't work" → invoke /investigate
- Test the site, find bugs, "does this work" → invoke /qa (or /qa-only for report only)
- Code review, check the diff, "look at my changes" → invoke /review
- Visual polish, design audit, "this looks off" → invoke /design-review
- Developer experience audit, try onboarding → invoke /devex-review
- Ship, deploy, create a PR, "send it" → invoke /ship
- Merge + deploy + verify → invoke /land-and-deploy
- Configure deployment → invoke /setup-deploy
- Post-deploy monitoring → invoke /canary
- Update docs after shipping → invoke /document-release
- Weekly retro, "how'd we do" → invoke /retro
- Second opinion, codex review → invoke /codex
- Safety mode, careful mode, lock it down → invoke /careful or /guard
- Restrict edits to a directory → invoke /freeze or /unfreeze
- Upgrade gstack → invoke /gstack-upgrade
- Save progress, "save my work" → invoke /context-save
- Resume, restore, "where was I" → invoke /context-restore
- Security audit, OWASP, "is this secure" → invoke /cso
- Make a PDF, document, publication → invoke /make-pdf
- Launch real browser for QA → invoke /open-gstack-browser
- Import cookies for authenticated testing → invoke /setup-browser-cookies
- Performance regression, page speed, benchmarks → invoke /benchmark
- Review what gstack has learned → invoke /learn
- Tune question sensitivity → invoke /plan-tune
- Code quality dashboard → invoke /health
