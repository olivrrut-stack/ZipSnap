# Browser Login Stream — Design Spec

**Date:** 2026-06-16

---

## Problem

Extensions that only work on logged-in sites (YouTube, Twitter/X, Gmail, LinkedIn, etc.) produce useless screenshots today. ZipSnap visits those sites but lands on a login wall, captures a blank or generic page, and the kit looks nothing like the extension in use. Users have to either accept bad screenshots or not use ZipSnap at all.

## Goal

When ZipSnap detects a login wall during content-script capture, pause the job and show the user a live view of the browser inside the ZipSnap web UI. The user signs in, clicks **Done**, and capture continues from that logged-in state. No credentials or cookies are stored anywhere after the job ends.

---

## What Gets Built

### Detection

After navigating to the extension's target site, check whether the landing page is a login wall:

```ts
const needsLogin = await page.evaluate(() => {
  if (document.querySelector('input[type="password"]')) return true;
  return /\/(login|signin|sign-in|auth|session|account\/login)/i.test(window.location.href);
});
```

This runs only for `kind: "site"` targets (site-specific extensions). Demo-page targets never need login. If `onLoginNeeded` is not supplied (CLI without `--login`), detection is skipped entirely — no behaviour change for existing flows.

### Pause Mechanism

`captureContentOverlay` accepts a new optional callback:

```ts
opts?: { onLoginNeeded?: (page: Page, url: string) => Promise<void> }
```

When a login wall is detected and the callback is supplied, `captureContentOverlay` calls `await opts.onLoginNeeded(page, url)` and waits. The page stays live in Playwright — the user interacts with it via the web UI. When the promise resolves, capture resumes immediately: same page, post-login state, content script already injected. A 2-second settle wait is added before the screenshot to let the extension finish rendering.

The callback is wired up in `processJob` inside `server.ts` and sets `job.status = "awaiting-login"` + stores the live `Page` reference in the job while suspended. When the promise resolves (user clicked Done), status returns to `"capturing"`.

A **5-minute timeout** rejects the promise and fails the job with:
`"Login timed out — complete sign-in within 5 minutes and try again."`

### Screenshot Streaming

No WebSocket. HTTP polling every 300 ms:

```
GET /api/jobs/:id/browser-snapshot
```

Takes `page.screenshot({ type: "jpeg", quality: 60 })` on the live Playwright page and returns it as `image/jpeg`. Works in `--headless=new` mode (confirmed: Playwright screenshots work in the new headless). Server-side throttle: max one snapshot in-flight per job — if one is still encoding, the next poll returns the previous frame immediately.

The web UI shows this as a plain `<img>` tag that gets a fresh `?t=<timestamp>` query string every 300 ms to force reload. No canvas, no WebSocket.

### Interaction

Three simple POST endpoints (all require `status === "awaiting-login"`, else 409):

**`POST /api/jobs/:id/browser-click`**
Body: `{ xFrac: number, yFrac: number }` — fractions 0–1 of the 1280×800 viewport.
Action: `page.mouse.click(xFrac * 1280, yFrac * 800)`.
The web UI captures `onClick` on the `<img>` element and sends `xFrac = e.offsetX / imgWidth`, `yFrac = e.offsetY / imgHeight`.

**`POST /api/jobs/:id/browser-type`**
Body: `{ text: string }` — max 200 chars, printable characters only.
Action: `page.keyboard.type(text)`.
The web UI captures `onKeyDown` on the login panel and posts individual characters.

**`POST /api/jobs/:id/browser-scroll`**
Body: `{ deltaY: number }` — pixels, clamped ±500.
Action: `page.mouse.wheel(0, deltaY)`.
Handles login forms pushed below the fold on some sites.

**`POST /api/jobs/:id/browser-reload`**
No body. Calls `page.reload()` and waits for `domcontentloaded`. Useful when an extension's content script only injects on a full page load. Returns `{ ok: true }` once reload completes.

**`POST /api/jobs/:id/login-done`**
No body. Resolves `job.loginResolver()` → capture resumes. After this call, all five new endpoints return 409 (job is no longer in awaiting-login).

### No-Data Guarantee

`launchExtension` already uses `mkdtemp` (a unique temp dir) for `userDataDir`, and `teardown` calls `rm(userDataDir, { recursive: true, force: true })`. Every cookie, localStorage entry, and session token from the login session lives only in that temp dir and is wiped when the job ends. Nothing is written to a persistent profile. The web UI shows a one-line notice: *"Your credentials are used only in a temporary browser session and deleted when capture finishes."*

---

## Architecture

### Files Changed

| File | Change |
|------|--------|
| `worker/src/capture.ts` | `captureContentOverlay` gains optional `opts.onLoginNeeded`; add detection logic + 2s post-login wait |
| `worker/src/pipeline.ts` | `RunCaptureOptions` gains `onLoginNeeded?`; thread it into `captureContentOverlay` |
| `worker/src/server.ts` | New `Job` fields; implement `onLoginNeeded` in `processJob`; add 4 new routes |
| `web/app/page.tsx` | Add `"awaiting-login"` to status types; add login panel with browser viewer, click/type/scroll/done |

No new files. All changes are additive — no existing behaviour is altered.

### New Job Fields

```ts
interface Job {
  // ... existing fields unchanged ...
  loginPage?: Page;            // live Playwright page, set during awaiting-login only
  loginResolver?: () => void;  // resolves the pause promise
  loginTimeout?: NodeJS.Timeout;
  snapPending?: boolean;       // throttle: one screenshot in-flight at a time
  lastSnapshot?: Buffer;       // cached last JPEG frame, served while snapPending
}
```

### New Job Status

`"awaiting-login"` is added to `JobStatus`. Progress position: 35% (between `"capturing"` at 32% and `"writing"` at 60%). Step label: `"Waiting for you to sign in…"`.

### Job Status Flow

```
queued → capturing → [awaiting-login →] capturing → writing → rendering → packaging → done
```

The `awaiting-login` sub-state is transparent to everything except the new routes and the new web UI panel. The progress bar pauses at 35%.

---

## Web UI — Login Panel

Shown when and only when `job.status === "awaiting-login"`. Replaces the normal progress panel.

```
┌─────────────────────────────────────────────────────────────┐
│  Sign in below so ZipSnap can photograph your extension.     │
│  Your credentials are temporary and deleted after capture.   │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│   [live browser image — 640×400, refreshes every 300ms]    │
│   click to interact · type to type · scroll to scroll      │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│        [ Done, I'm logged in → ]                            │
└─────────────────────────────────────────────────────────────┘
```

- The `<img>` has `cursor: crosshair` and `user-select: none`
- `onClick`: compute fractional coords from `e.nativeEvent.offsetX / img.offsetWidth`, POST to `/browser-click`
- `onKeyDown` on the panel `<div>` (tabIndex=0, auto-focused on mount): POST printable characters to `/browser-type`; handle Backspace as `page.keyboard.press("Backspace")`; handle Enter as `page.keyboard.press("Enter")`
- `onWheel`: POST `deltaY` (clamped) to `/browser-scroll`
- Clicking Done calls `POST /login-done`, then stops polling and lets the normal progress UI take over
- While polling: a small `⟳ live` badge in the top-right corner of the image

---

## Edge Cases

**Extension doesn't inject after login redirect**
After the user clicks Done, capture waits 2 seconds. If the extension hasn't injected (e.g. it needs a page reload), the screenshot will still show something — either the blank page or whatever the extension produced. The user will see this in the image preview and can choose to accept or re-upload. A "Reload page" button (`POST /browser-reload` → `page.reload()`) is included so the user can trigger injection before clicking Done.

**User navigates the browser freely**
That's fine and encouraged. The page reference stays valid across navigations. The screenshot stream follows wherever the user goes. When they click Done on a page where the extension is active, that's the screenshot we capture.

**Two-factor authentication**
Works naturally — 2FA code entry is just typing into a form. The screenshot stream shows the 2FA prompt; the user types the code; Done after.

**OAuth popups**
Some sites open a new popup window for login. Playwright's `context.waitForEvent("page")` can catch these, but we don't need to — the user can type the OAuth credentials in the popup (it appears on their screen since it opens from the Playwright browser rendered in the snapshot stream). Not all OAuth flows will work (some block headless browsers), but standard email/password always will.

**Timeout during login**
`job.loginTimeout` fires after 5 minutes → rejects the promise → `captureContentOverlay` throws → `processJob` catches → `job.status = "error"` with message `"Login timed out — complete sign-in within 5 minutes and try again."` The web UI shows this in the error panel with the existing "Try another extension" reset button.

**Server restart while awaiting-login**
Jobs are in-memory. A restart loses the job. The user re-uploads. This is acceptable — it already applies to all jobs, not just login ones.

---

## What Does NOT Change

- CLI `--login` / `interactive` mode: completely untouched. Runs exactly as before.
- `ZIPSNAP_HEADLESS=1` setting: still set by the server. The new screenshot endpoints work in headless:new mode.
- Non-login-walled extensions: zero path change. Detection only runs for `kind: "site"` targets, and only if `onLoginNeeded` is provided.
- `generateIcons`, `runRender`, `generateStoreCopy`: not touched.

---

## Verification

1. Extension targeting YouTube (login required) → job pauses at `awaiting-login` → browser stream shows YouTube login
2. User types email/password in stream → clicks appear on correct Playwright page elements
3. After login, user navigates to a page where extension is active → clicks Done → screenshot captures extension UI
4. Downloaded kit contains screenshot of logged-in page, not login wall
5. After job ends, `userDataDir` temp folder is deleted (no session files remain)
6. 5-minute timeout: set timeout to 5s in test, verify job errors with correct message
7. `npm test` passes in both `worker/` and `web/` — no regressions
