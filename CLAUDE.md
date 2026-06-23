# CLAUDE.md

ZipSnap has two tools. (1) It auto-generates a Chrome Web Store submission kit from an unpacked extension: screenshots, promo tiles, AI-written store copy, and icons. (2) It grades an extension and writes a Growth & Acquisition Report. The headline feature is **auto-capture**: ZipSnap loads the extension itself and screenshots its own UI.

UI/design note: the web app uses the actual Chrome logo colors (blue #4c8bf5, steel red #dd5144, sunshine yellow #ffcd46, mint green #1da462), a dark polished-chrome backdrop (`MetalBackdrop`), and primary buttons that rest as silver chrome and animate the Chrome rainbow only when live. Always invoke the `frontend-design` skill before any UI/visual change (user preference).

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
npm run score            # quality scorecard (Lighthouse + structural + AI judge + code + assets)
npm run score -- --url https://your-live-site.com   # grade a deployed site
npm run score -- --full  # also run a real pipeline job and time it (needs API key)
npm run typecheck
npm test
npm test -- contentTarget.test.ts
```

```bash
cd web
npm install
npm run dev        # http://localhost:3000  (routes: / hub, /generate kit, /grade grader)
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

Core flow: **capture → AI copy → grade → render**, via `runCapture`/`runRender` in `pipeline.ts`, shared by CLI and HTTP server.

**1. Capture** (`runCapture`)
- `manifest.ts` — reads `manifest.json`, extracts metadata (`extractMeta`), detects surfaces (`detectSurfaces`): popup, options, content scripts, new-tab override pages (`chrome_url_overrides.newtab`), and MV3 side panels (`side_panel.default_path`). `checkManifestHealth` returns warnings/errors the UI surfaces.
- `extensionContext.ts` — launches persistent Chrome with the extension loaded, resolves extension ID via background service worker. Extensions without a service worker get a stub injected via `withServiceWorker`.
- `brandColor.ts` — extracts dominant brand color from the 128px icon.
- `capture.ts` — screenshots each surface: `capturePopup` (tight crop), `captureOptions` (1280×800), `captureNewTab` (full 1280×800, leads the kit when present), `captureSidePanel` (slim 400-wide panel), `captureContentOverlay`. All screenshots go through `forceScreenshot`, which tries Playwright first (8s timeout) then falls back to a raw CDP `Page.captureScreenshot` call (10s timeout), needed for heavy SPAs like LinkedIn that never reach Playwright's idle-paint state.
- `contentTarget.ts` (`resolveContentTarget`) — for content scripts, uses the local demo page (`demoServer.ts`) for broad patterns (`<all_urls>`, `*` host), or visits the real site for specific patterns. `LANDING_HINTS` maps known sites to content-rich or login-walled entry URLs (e.g. `linkedin.com` → `/login`) so login detection fires correctly.
- Login wall detection: if `captureContentOverlay` lands on a login page (password field, login URL pattern), it calls `opts.onLoginNeeded`. The server uses this to pause the job, stream the live browser to the user via WebSocket, and wait for the user to sign in. After login, if the browser is already on the target domain, navigation is skipped — the extension is already running on the post-login page. Only navigates to the domain root if somehow on a different domain.
- Output: `capture.json` (`CaptureResult`, `ExtensionMeta`, `DetectedSurfaces`, `CapturedSurface` from `types.ts`).

**2. AI copy** (`copy.ts` / `generateStoreCopy`)
- Sends `capture.json` to Claude → `StoreCopy`: title, short/long description, category, 5 screenshot headlines, 7 keywords, permissions analysis with flagged risks and listing justifications, privacy policy → `copy.json`.

**2b. Growth report** (`growthReport.ts` / `generateGrowthReport`)
- Grades the extension from manifest signals (`GrowthSignals`) plus optional user-reported stats (`UserStats`: users, rating, revenue) across four pillars (discoverability, acquisition readiness, product ideas, compliance) plus feature ideas → `GrowthReport` → `growth-report.json`. Clones the `copy.ts` pattern (one Claude call shaped by a strict Zod schema + anti-fabrication prompt). Best-effort inside the kit job; also exposed standalone via `POST /api/grade` (manifest-only, no browser, fast). `signalsFromCapture` / `signalsFromManifest` feed the same brief.

**3. Render** (`runRender`, using `render.ts`)
- `makeBrand` derives a full palette from `brandColor` (or a user override): a dark brand-tinted **mesh-gradient** backdrop (`mesh` — soft overlapping radial color blobs over a deep diagonal base, not a flat fade), a brand `glow` halo, and a light `tint` accent. Pipeline: Satori → SVG → resvg-js → PNG. Type: **Geist Sans** for display headlines/names, **Geist Mono** for eyebrows/labels/the address bar. "Premium SaaS" look.
- Page surfaces (options, new-tab, content) get a mock browser-window frame; popup/side-panel get a floating card. Both float on the mesh with a glow halo behind and a deep layered drop shadow (`WINDOW_SHADOW` — no negative box-shadow spread, which crashes resvg). New-tab leads (screenshot-1) when present.
- Promo tiles use the same mesh backdrop (eyebrow + display name + accent rule + tagline); the old AI tile-background helper was removed.
- Output in `output/kit/`: `screenshot-1..5.png` (1280×800), `small-promo-440x280.png`, `marquee-1400x560.png`.
- `pngSize`/`saveVerified` assert exact Chrome Web Store pixel sizes before writing.

**4. Icon generation** (`iconGeneration.ts` / `generateIcons`)
- Generates branded extension icons at 128/48/32/16px using the extension name, description, and brand color. Output in `output/icons/`. Best-effort — failure doesn't fail the job.

## Architecture: HTTP API (`worker/src/server.ts`)

Stateless job model; client polls for status.

**Job lifecycle:** `queued → capturing → awaiting-login (optional) → writing → rendering → packaging → done/error`

**Core endpoints:**
- `POST /api/jobs` — accepts `.zip` (multer, 25 MB limit, in-memory), runs zip-bomb guard (`inspectZip`), extracts to temp folder, locates `manifest.json` (`findManifestDir`), enqueues job. Returns `{ jobId }`.
- `processJob` — runs `runCapture → generateStoreCopy → generateGrowthReport (best-effort) → runRender → generateIcons`, then zips `kit/` + `icons/` + `descriptions.txt` + `growth-report.json/txt` into `zipsnap-kit.zip`. Accepts optional `userStats` on the upload.
- `GET /api/jobs/:id` — poll status/step/error; returns `images`, `copy`, `growthReport`, `manifestHealth`, `brandColor`, `iconKit` when done.
- `POST /api/grade` — standalone fast grader: manifest-only (no browser), optional `userStats`, returns `{ report }` synchronously. Powers the `/grade` page.
- `GET /api/jobs/:id/image/:name` — serve a rendered kit image preview.
- `GET /api/jobs/:id/icon/:name` — serve a generated icon preview.
- `GET /api/jobs/:id/kit` — download the finished kit zip.
- `POST /api/jobs/:id/rerender` — re-render the kit with a new brand color; returns updated image list.
- `POST /api/jobs/:id/recopy` — re-run AI copy generation for a finished job; returns new copy.
- `POST /api/jobs/:id/regenerate-report` — re-run the growth report (optionally with new `userStats`); returns `{ report }`.
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

Three routes with a shared top nav/tab bar (`TopNav`):
- `page.tsx` — `/` landing hub: launch/grow/sell lifecycle headline + two tool cards (Generate / Grade) + the example gallery. Lean; no upload here.
- `generate/page.tsx` — renders `components/KitGenerator.tsx`, the full kit flow (was the old `page.tsx`): upload, poll status (2s), progress bar + elapsed timer, login panel with live browser view during `awaiting-login`, results panel (image grid, "Listing readiness" strip, AI copy blocks, growth report, icons, "Regenerate copy"/"Regenerate report", email capture, kit download). The Generate button gets `.btn-armed` (rainbow) once a zip is picked.
- `grade/page.tsx` — renders `components/Grader.tsx`, the standalone grader: compact drop zone + optional stats inputs → `POST /api/grade` (synchronous, no polling) → `<GrowthReport>`.

Shared components:
- `components/GrowthReport.tsx` — gamified report visual (overall score ring, four pillar mini-rings, severity-striped recommendation cards, feature-idea deck). Used by both Grader and KitGenerator results.
- `components/MetalBackdrop.tsx` — fixed polished-chrome backdrop (gunmetal base + grid + silver sheen + twinkling sparkles), rendered in `layout.tsx`.
- `components/Gallery.tsx` — animated ticker of real sample output (MaterialYouNewTab). Sample images in `web/public/samples/`.
- `components/Footer.tsx`, `LegalNav.tsx`, `TopNav.tsx`.
- `lib/utils.ts` (`sizeOf`, `deriveName`), `lib/upload.ts` (shared drag/zip helpers: `readDrop`, `filterReal`, `zipFiles`).
- `layout.tsx`, `robots.ts`, `sitemap.ts` — Open Graph, Twitter cards, sitemap, JSON-LD.

**Key UI behaviors:**
- Elapsed timer runs for the full job duration including `awaiting-login` pause.
- During `awaiting-login`: WebSocket connects to `browser-stream`, frames are displayed as blob URLs (revoked on each new frame). Falls back to the HTTP snapshot endpoint until the first WS frame arrives.
- On error: shows "Try again" (re-runs same extension) and "Try another extension" (clears state).
- Primary buttons rest as silver chrome; the Chrome rainbow animates only on hover/active/armed. Reduced motion is respected.

## Quality scorecard (`worker/src/scorecard/`)

`npm run score` (in `worker/`) grades the site + output against a fixed finish line and prints a PASS/FAIL scorecard with a readiness %, writing `worker/scorecard-report/latest.{json,md}` + `history.jsonl`. Tiers (each degrades gracefully): assets (exact Web Store sizes + completeness; `--full` runs a real job + times it), web-vitals (Lighthouse mobile), structural (drop zone, CTAs, footer, console, keyboard, mobile scroll), ai-judge (Claude vision scores the subjective design; needs API key), code (typecheck/test/build). `--url <live>` grades a deployed site. Single source of truth is `criteria.ts`. Caveat: localhost Lighthouse numbers are pessimistic; use `--url` for real ones.

## Testing

Vitest unit tests (no browser needed): manifest parsing, content-target resolution, AI copy schema, growth-report schema + brief, PNG-size verification, scorecard math (`worker/src/`), file-naming/sizing helpers, component tests incl. GrowthReport (`web/app/`). 63 worker tests, 18 web tests.

## Skill routing

When the user's request matches an available skill, invoke it via the Skill tool. The
skill has multi-step workflows, checklists, and quality gates that produce better
results than an ad-hoc answer. When in doubt, invoke the skill. A false positive is
cheaper than a false negative.

Key routing rules:
- ANY UI / visual change (layout, styling, components, colors, background, in-UI copy) → invoke /frontend-design FIRST, always, even small tweaks (user preference)
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
