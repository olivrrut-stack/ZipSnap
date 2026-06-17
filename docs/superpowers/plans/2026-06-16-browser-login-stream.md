# Browser Login Stream Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When ZipSnap hits a login wall during content-script capture, pause the job and show the user a live browser view in the web UI so they can sign in, then resume capture from the logged-in state.

**Architecture:** A callback (`onLoginNeeded`) is threaded from `server.ts` through `runCapture` into `captureContentOverlay`, where it fires when a login page is detected. The server stores the live Playwright `Page` reference in the job and resolves the pause when the user POSTs to `/login-done`. The web UI polls a JPEG snapshot endpoint every 300 ms and relays clicks, keystrokes, scroll, and reload back to the browser.

**Tech Stack:** Node.js, Playwright (already in worker deps), Express, React 19 / Next.js 15. No new packages.

## Global Constraints

- All new server routes validate `job.status === "awaiting-login"` before acting; return 409 otherwise.
- No credentials, cookies, or session data are persisted — Playwright already uses a fresh `mkdtemp` dir per job and `teardown()` wipes it.
- The `"awaiting-login"` status must be added to the `JobStatus` union in `server.ts` AND the `Status` type in `page.tsx` — keep them in sync.
- Browser viewport for content capture is `1280×800` (matches existing `VIEWPORT` constant in `capture.ts`).
- Snapshot JPEG quality: 60. Polling interval: 300 ms.
- Login timeout: 5 minutes (300 000 ms). Error message on timeout: `"Login timed out — complete sign-in within 5 minutes and try again."`
- `import type { Page } from "playwright"` — type-only import, no runtime dependency added to server.ts or pipeline.ts.
- Run all tests from inside `worker/` or `web/` directories, not the repo root.

---

### Task 1: Login Detection Utility + `captureContentOverlay` Changes

**Files:**
- Modify: `worker/src/capture.ts`
- Create: `worker/src/capture.test.ts`

**Interfaces:**
- Produces: `export function looksLikeLoginPage(url: string, hasPasswordField: boolean): boolean`
- Produces: updated `captureContentOverlay` signature:
  ```ts
  export async function captureContentOverlay(
    context: BrowserContext,
    manifest: any,
    outputDir: string,
    opts: { onLoginNeeded?: (page: Page, url: string) => Promise<void> } = {},
  ): Promise<CapturedSurface>
  ```

- [ ] **Step 1: Write the failing tests**

Create `worker/src/capture.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { looksLikeLoginPage } from "./capture";

describe("looksLikeLoginPage", () => {
  it("returns true when the page has a password field regardless of URL", () => {
    expect(looksLikeLoginPage("https://example.com/home", true)).toBe(true);
  });

  it("returns true for /login in URL", () => {
    expect(looksLikeLoginPage("https://twitter.com/login", false)).toBe(true);
  });

  it("returns true for /signin in URL", () => {
    expect(looksLikeLoginPage("https://accounts.google.com/signin/v2", false)).toBe(true);
  });

  it("returns true for /sign-in in URL", () => {
    expect(looksLikeLoginPage("https://example.com/sign-in", false)).toBe(true);
  });

  it("returns true for /auth in URL", () => {
    expect(looksLikeLoginPage("https://example.com/auth/session", false)).toBe(true);
  });

  it("returns true for /account/login in URL", () => {
    expect(looksLikeLoginPage("https://example.com/account/login", false)).toBe(true);
  });

  it("returns false for normal content pages without a password field", () => {
    expect(looksLikeLoginPage("https://youtube.com/results?search_query=tech", false)).toBe(false);
    expect(looksLikeLoginPage("https://twitter.com/home", false)).toBe(false);
    expect(looksLikeLoginPage("https://linkedin.com/feed", false)).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests — confirm they fail**

```bash
cd worker
npm test -- capture.test.ts
```

Expected: FAIL — `looksLikeLoginPage` not exported from `./capture`.

- [ ] **Step 3: Add the `looksLikeLoginPage` export to `capture.ts`**

Add this right after the imports, before `capturePopup`:

```ts
/**
 * Returns true if the page looks like a login wall — either by having a
 * password input or by matching common login URL patterns.
 */
export function looksLikeLoginPage(url: string, hasPasswordField: boolean): boolean {
  if (hasPasswordField) return true;
  return /\/(login|signin|sign-in|auth|session|account\/login)/i.test(url);
}
```

- [ ] **Step 4: Add `Page` to the existing playwright import in `capture.ts`**

The file currently imports:
```ts
import type { BrowserContext, Page } from "playwright";
```

`Page` is already imported (used in `dismissConsent`'s parameter type). Confirm it's there — no change needed.

- [ ] **Step 5: Update `captureContentOverlay` signature to accept `opts`**

Change the function signature from:
```ts
export async function captureContentOverlay(
  context: BrowserContext,
  manifest: any,
  outputDir: string,
): Promise<CapturedSurface> {
```

To:
```ts
export async function captureContentOverlay(
  context: BrowserContext,
  manifest: any,
  outputDir: string,
  opts: { onLoginNeeded?: (page: Page, url: string) => Promise<void> } = {},
): Promise<CapturedSurface> {
```

- [ ] **Step 6: Add login detection inside `captureContentOverlay` after the real-site wait**

Find the block inside `captureContentOverlay` that ends with:
```ts
    if (target.kind === "site") {
      await dismissConsent(page);
      // Real sites render progressively; give the page and the extension time.
      await page.waitForTimeout(4000);
    } else {
      await page.waitForTimeout(1500);
    }
```

Add the login detection block immediately after that closing brace, before the screenshot:

```ts
    // Detect login wall on real-site targets only.
    if (target.kind === "site" && opts.onLoginNeeded) {
      const currentUrl = page.url();
      const hasPasswordField = await page.evaluate(
        () => !!document.querySelector('input[type="password"]'),
      );
      if (looksLikeLoginPage(currentUrl, hasPasswordField)) {
        info("Login wall detected — pausing for user sign-in");
        await opts.onLoginNeeded(page, currentUrl);
        // Give the content script time to inject after the post-login navigation.
        await page.waitForTimeout(2000);
      }
    }
```

- [ ] **Step 7: Run tests — confirm they pass**

```bash
cd worker
npm test -- capture.test.ts
```

Expected: all 8 tests PASS.

- [ ] **Step 8: Run typecheck**

```bash
cd worker
npm run typecheck
```

Expected: no errors.

- [ ] **Step 9: Commit**

```bash
git add worker/src/capture.ts worker/src/capture.test.ts
git commit -m "feat: add login detection to captureContentOverlay with onLoginNeeded callback"
```

---

### Task 2: Thread `onLoginNeeded` Through `pipeline.ts`

**Files:**
- Modify: `worker/src/pipeline.ts`

**Interfaces:**
- Consumes: `captureContentOverlay(context, manifest, outputDir, opts)` from Task 1
- Produces: updated `RunCaptureOptions`:
  ```ts
  export interface RunCaptureOptions {
    interactive?: boolean;
    onLoginNeeded?: (page: Page, url: string) => Promise<void>;
  }
  ```

- [ ] **Step 1: Add `type { Page }` import to `pipeline.ts`**

Find the existing imports at the top. Add `Page` to the playwright import — or add a new type import since `pipeline.ts` doesn't currently import from playwright directly. Add this line after the existing imports:

```ts
import type { Page } from "playwright";
```

- [ ] **Step 2: Add `onLoginNeeded` to `RunCaptureOptions`**

Find the existing `RunCaptureOptions` interface:

```ts
export interface RunCaptureOptions {
  interactive?: boolean;
}
```

Replace with:

```ts
export interface RunCaptureOptions {
  /**
   * "Sign in once, then capture" mode: pauses with a visible browser window
   * after launch so the user can log into any accounts the extension needs,
   * then waits for Enter in the terminal before capturing. CLI-only — has no
   * effect under ZIPSNAP_HEADLESS=1 (the server never enables it).
   */
  interactive?: boolean;
  /**
   * Called when a login wall is detected during content-script capture.
   * The server uses this to pause the job and stream the browser to the user.
   * The returned promise should resolve once the user has signed in.
   */
  onLoginNeeded?: (page: Page, url: string) => Promise<void>;
}
```

- [ ] **Step 3: Thread `onLoginNeeded` into `captureContentOverlay` inside `runCapture`**

Find the existing call to `captureContentOverlay` in `runCapture`:

```ts
    const contentOverlay = await captureContentOverlay(loaded.context, manifest, outputDir);
```

Replace with:

```ts
    const contentOverlay = await captureContentOverlay(loaded.context, manifest, outputDir, {
      onLoginNeeded: opts.onLoginNeeded,
    });
```

- [ ] **Step 4: Run typecheck**

```bash
cd worker
npm run typecheck
```

Expected: no errors.

- [ ] **Step 5: Run existing tests — confirm nothing broke**

```bash
cd worker
npm test
```

Expected: all existing tests PASS (including the new capture tests from Task 1).

- [ ] **Step 6: Commit**

```bash
git add worker/src/pipeline.ts
git commit -m "feat: thread onLoginNeeded callback through runCapture into captureContentOverlay"
```

---

### Task 3: Server Changes — Job Type, processJob Callback, Six New Routes

**Files:**
- Modify: `worker/src/server.ts`

**Interfaces:**
- Consumes: `RunCaptureOptions.onLoginNeeded` from Task 2
- Consumes: `"awaiting-login"` as a valid `JobStatus`
- Produces: six new HTTP endpoints (see below)

- [ ] **Step 1: Add `type { Page }` import to `server.ts`**

At the top of `server.ts`, find:
```ts
import { runCapture, runRender, isValidHex } from "./pipeline";
```

Add immediately after all existing imports:

```ts
import type { Page } from "playwright";
```

- [ ] **Step 2: Add `"awaiting-login"` to the `JobStatus` union**

Find:
```ts
type JobStatus =
  | "queued"
  | "capturing"
  | "writing"
  | "rendering"
  | "packaging"
  | "done"
  | "error";
```

Replace with:

```ts
type JobStatus =
  | "queued"
  | "capturing"
  | "awaiting-login"
  | "writing"
  | "rendering"
  | "packaging"
  | "done"
  | "error";
```

- [ ] **Step 3: Add new fields to the `Job` interface**

Find the `Job` interface. Add these fields after `rerendering?: boolean;`:

```ts
  loginPage?: Page;               // live Playwright page held during awaiting-login
  loginResolver?: () => void;     // resolves the pause promise when user clicks Done
  loginTimeout?: ReturnType<typeof setTimeout>;
  snapPending?: boolean;          // throttle: true while a screenshot is being encoded
  lastSnapshot?: Buffer;          // last JPEG frame, returned while snapPending is true
```

- [ ] **Step 4: Wire up `onLoginNeeded` in `processJob`**

Find the existing call to `runCapture` inside `processJob`:

```ts
    job.status = "capturing";
    const capture = await runCapture(job.extPath, job.outputDir, (s) => (job.step = s));
```

Replace with:

```ts
    job.status = "capturing";
    const capture = await runCapture(job.extPath, job.outputDir, (s) => (job.step = s), {
      onLoginNeeded: async (page, url) => {
        const host = (() => { try { return new URL(url).host; } catch { return url; } })();
        job.status = "awaiting-login";
        job.step = `Sign in to ${host} in the browser below`;
        job.loginPage = page;
        await new Promise<void>((resolve, reject) => {
          job.loginResolver = resolve;
          job.loginTimeout = setTimeout(
            () => reject(new Error("Login timed out — complete sign-in within 5 minutes and try again.")),
            5 * 60 * 1000,
          );
        });
        clearTimeout(job.loginTimeout);
        job.loginPage = undefined;
        job.loginResolver = undefined;
        job.lastSnapshot = undefined;
        job.status = "capturing";
        job.step = "Resuming capture";
      },
    });
```

- [ ] **Step 5: Add the login interaction rate limiter**

Find the existing `rerenderLimiter` block and add the new limiter directly after it:

```ts
const loginInteractionLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 300, // ~5 req/sec — covers 300 ms snapshot polling + interaction
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many browser interaction requests. Please slow down." },
});
```

- [ ] **Step 6: Add the six new routes**

Add all six routes together, placed after the existing `GET /api/jobs/:id/icon/:name` route and before the rerender route. Each one requires `job.status === "awaiting-login"`.

```ts
// Stream a JPEG snapshot of the live login browser view.
app.get("/api/jobs/:id/browser-snapshot", loginInteractionLimiter, async (req, res) => {
  const job = jobs.get(req.params.id);
  if (!job || job.status !== "awaiting-login" || !job.loginPage) {
    res.status(409).end();
    return;
  }
  // If a screenshot is already being encoded, return the last frame immediately.
  if (job.snapPending && job.lastSnapshot) {
    res.set("Content-Type", "image/jpeg");
    res.send(job.lastSnapshot);
    return;
  }
  job.snapPending = true;
  try {
    const buf = await job.loginPage.screenshot({ type: "jpeg", quality: 60 });
    job.lastSnapshot = buf;
    res.set("Content-Type", "image/jpeg");
    res.send(buf);
  } catch {
    res.status(500).end();
  } finally {
    job.snapPending = false;
  }
});

// Relay a mouse click to the login browser.
app.post("/api/jobs/:id/browser-click", loginInteractionLimiter, express.json(), async (req, res) => {
  const job = jobs.get(req.params.id);
  if (!job || job.status !== "awaiting-login" || !job.loginPage) {
    res.status(409).json({ error: "No active login session." });
    return;
  }
  const { xFrac, yFrac } = req.body as { xFrac?: unknown; yFrac?: unknown };
  if (
    typeof xFrac !== "number" || typeof yFrac !== "number" ||
    xFrac < 0 || xFrac > 1 || yFrac < 0 || yFrac > 1
  ) {
    res.status(400).json({ error: "xFrac and yFrac must be numbers between 0 and 1." });
    return;
  }
  await job.loginPage.mouse.click(Math.round(xFrac * 1280), Math.round(yFrac * 800));
  res.json({ ok: true });
});

// Relay a keystroke to the login browser.
app.post("/api/jobs/:id/browser-type", loginInteractionLimiter, express.json(), async (req, res) => {
  const job = jobs.get(req.params.id);
  if (!job || job.status !== "awaiting-login" || !job.loginPage) {
    res.status(409).json({ error: "No active login session." });
    return;
  }
  const { text } = req.body as { text?: unknown };
  if (typeof text !== "string" || text.length === 0 || text.length > 200) {
    res.status(400).json({ error: "text must be a non-empty string of up to 200 characters." });
    return;
  }
  if (text === "Backspace") {
    await job.loginPage.keyboard.press("Backspace");
  } else if (text === "Enter") {
    await job.loginPage.keyboard.press("Enter");
  } else {
    await job.loginPage.keyboard.type(text);
  }
  res.json({ ok: true });
});

// Relay a scroll event to the login browser.
app.post("/api/jobs/:id/browser-scroll", loginInteractionLimiter, express.json(), async (req, res) => {
  const job = jobs.get(req.params.id);
  if (!job || job.status !== "awaiting-login" || !job.loginPage) {
    res.status(409).json({ error: "No active login session." });
    return;
  }
  const { deltaY } = req.body as { deltaY?: unknown };
  if (typeof deltaY !== "number") {
    res.status(400).json({ error: "deltaY must be a number." });
    return;
  }
  await job.loginPage.mouse.wheel(0, Math.max(-500, Math.min(500, deltaY)));
  res.json({ ok: true });
});

// Reload the login browser page (triggers content-script re-injection).
app.post("/api/jobs/:id/browser-reload", loginInteractionLimiter, async (req, res) => {
  const job = jobs.get(req.params.id);
  if (!job || job.status !== "awaiting-login" || !job.loginPage) {
    res.status(409).json({ error: "No active login session." });
    return;
  }
  await job.loginPage.reload({ waitUntil: "domcontentloaded" });
  res.json({ ok: true });
});

// Signal that login is complete — resumes the paused capture.
app.post("/api/jobs/:id/login-done", loginInteractionLimiter, async (req, res) => {
  const job = jobs.get(req.params.id);
  if (!job || job.status !== "awaiting-login" || !job.loginResolver) {
    res.status(409).json({ error: "No active login session." });
    return;
  }
  job.loginResolver();
  res.json({ ok: true });
});
```

- [ ] **Step 7: Run typecheck**

```bash
cd worker
npm run typecheck
```

Expected: no errors.

- [ ] **Step 8: Run full test suite**

```bash
cd worker
npm test
```

Expected: all tests PASS.

- [ ] **Step 9: Commit**

```bash
git add worker/src/server.ts
git commit -m "feat: add awaiting-login job state and six browser interaction routes"
```

---

### Task 4: Web UI — Login Panel

**Files:**
- Modify: `web/app/page.tsx`

**Interfaces:**
- Consumes: `GET /api/jobs/:id/browser-snapshot` → JPEG image
- Consumes: `POST /api/jobs/:id/browser-click` with `{ xFrac, yFrac }`
- Consumes: `POST /api/jobs/:id/browser-type` with `{ text }`
- Consumes: `POST /api/jobs/:id/browser-scroll` with `{ deltaY }`
- Consumes: `POST /api/jobs/:id/browser-reload` (no body)
- Consumes: `POST /api/jobs/:id/login-done` (no body)

- [ ] **Step 1: Add `"awaiting-login"` to the `Status` type**

Find:
```ts
type Status = "queued" | "capturing" | "writing" | "rendering" | "packaging" | "done" | "error";
```

Replace with:
```ts
type Status = "queued" | "capturing" | "awaiting-login" | "writing" | "rendering" | "packaging" | "done" | "error";
```

- [ ] **Step 2: Add `"awaiting-login"` to `PCT` and `STEP_LABEL`**

Find the `PCT` object and add the new entry:
```ts
const PCT: Record<Status, number> = {
  queued: 8, capturing: 32, "awaiting-login": 35, writing: 60, rendering: 82, packaging: 93, done: 100, error: 100,
};
```

Find the `STEP_LABEL` object and add:
```ts
const STEP_LABEL: Record<Status, string> = {
  queued: "Queued…",
  capturing: "Loading your extension & capturing its screens…",
  "awaiting-login": "Sign in below to continue…",
  writing: "Writing your store listing with AI…",
  rendering: "Rendering the store images…",
  packaging: "Packaging your kit…",
  done: "Done!",
  error: "Something went wrong.",
};
```

- [ ] **Step 3: Add `snapKey` state and snapshot polling `useEffect` to `Home`**

In `Home`, find the existing state declarations and add after them:
```ts
const [snapKey, setSnapKey] = useState(0);
```

Add a `useRef` for the login panel focus:
```ts
const loginPanelRef = useRef<HTMLDivElement>(null);
```

Add a `useEffect` that drives snapshot polling while `awaiting-login`. Place it after the existing state declarations:
```ts
const awaitingLogin = job?.status === "awaiting-login";

useEffect(() => {
  if (!awaitingLogin) return;
  const id = setInterval(() => setSnapKey((k) => k + 1), 300);
  // Auto-focus the panel so keyboard events are captured immediately.
  loginPanelRef.current?.focus();
  return () => clearInterval(id);
}, [awaitingLogin]);
```

- [ ] **Step 4: Add the browser interaction helper functions to `Home`**

Add these five functions inside the `Home` component, after the `generate` and `reset` functions:

```ts
async function relayClick(jobId: string, xFrac: number, yFrac: number) {
  await fetch(`${WORKER}/api/jobs/${jobId}/browser-click`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ xFrac, yFrac }),
  }).catch(() => {});
  loginPanelRef.current?.focus();
}

async function relayKey(jobId: string, key: string) {
  let text: string;
  if (key === "Backspace" || key === "Enter") {
    text = key;
  } else if (key.length === 1) {
    text = key;
  } else {
    return; // Ignore modifier keys, arrows, etc.
  }
  await fetch(`${WORKER}/api/jobs/${jobId}/browser-type`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  }).catch(() => {});
}

async function relayScroll(jobId: string, deltaY: number) {
  await fetch(`${WORKER}/api/jobs/${jobId}/browser-scroll`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ deltaY }),
  }).catch(() => {});
}

async function relayReload(jobId: string) {
  await fetch(`${WORKER}/api/jobs/${jobId}/browser-reload`, { method: "POST" }).catch(() => {});
}

async function loginDone(jobId: string) {
  await fetch(`${WORKER}/api/jobs/${jobId}/login-done`, { method: "POST" }).catch(() => {});
}
```

- [ ] **Step 5: Update the `working` check and add the login panel to the JSX**

Find the existing `working` check:
```ts
const working = job && job.status !== "done" && job.status !== "error";
```

Replace with:
```ts
const working = job && job.status !== "done" && job.status !== "error" && job.status !== "awaiting-login";
```

Now find the JSX section where the progress panel and error panel are rendered. It looks like:
```tsx
          {working && (
            <div className="panel">
              ...
            </div>
          )}

          {job?.status === "error" && (
            ...
          )}

          {job?.status === "done" && (
            ...
          )}
```

Add the login panel between the `working` panel and the error panel:

```tsx
          {awaitingLogin && job && (
            <div className="panel">
              <div className="panel-head" style={{ flexDirection: "column", alignItems: "stretch", gap: 8 }}>
                <div className="panel-title">Sign in to continue</div>
                <p style={{ margin: 0, fontSize: 13, color: "var(--text-faint)", lineHeight: 1.5 }}>
                  Sign in below so ZipSnap can photograph your extension on this site.
                  Your credentials are used only in a temporary browser session and deleted when capture finishes.
                </p>
              </div>

              {/* Live browser view */}
              <div
                ref={loginPanelRef}
                tabIndex={0}
                style={{
                  outline: "none",
                  cursor: "crosshair",
                  userSelect: "none",
                  position: "relative",
                  borderRadius: 8,
                  overflow: "hidden",
                  border: "1px solid var(--line)",
                }}
                onKeyDown={(e) => {
                  e.preventDefault();
                  void relayKey(job.id, e.key);
                }}
                onWheel={(e) => {
                  void relayScroll(job.id, e.deltaY);
                }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={`${WORKER}/api/jobs/${job.id}/browser-snapshot?t=${snapKey}`}
                  alt="Live browser view — click to interact"
                  style={{ width: "100%", display: "block" }}
                  onClick={(e) => {
                    const img = e.currentTarget;
                    const xFrac = e.nativeEvent.offsetX / img.offsetWidth;
                    const yFrac = e.nativeEvent.offsetY / img.offsetHeight;
                    void relayClick(job.id, xFrac, yFrac);
                  }}
                />
                <span style={{
                  position: "absolute",
                  top: 8,
                  right: 8,
                  background: "rgba(0,0,0,0.55)",
                  color: "#22c55e",
                  fontSize: 11,
                  padding: "2px 10px",
                  borderRadius: 99,
                  fontFamily: "monospace",
                  pointerEvents: "none",
                }}>
                  ⟳ live
                </span>
              </div>

              {/* Action buttons */}
              <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
                <button
                  className="btn btn-ghost"
                  title="Reloads the page — useful if the extension didn't inject after login"
                  onClick={() => void relayReload(job.id)}
                  style={{ flexShrink: 0 }}
                >
                  ↺ Reload page
                </button>
                <button
                  className="btn btn-primary"
                  style={{ flex: 1 }}
                  onClick={() => void loginDone(job.id)}
                >
                  Done, I&apos;m logged in →
                </button>
              </div>

              <p style={{ margin: "8px 0 0", fontSize: 11, color: "var(--text-faint)", textAlign: "center" }}>
                Click inside the browser above to interact · Type to type · Scroll to scroll
              </p>
            </div>
          )}
```

- [ ] **Step 6: Run typecheck**

```bash
cd web
npm run typecheck
```

Expected: no errors.

- [ ] **Step 7: Run tests**

```bash
cd web
npm test
```

Expected: all existing tests PASS.

- [ ] **Step 8: Commit**

```bash
git add web/app/page.tsx
git commit -m "feat: add awaiting-login browser stream panel to web UI"
```

---

## Self-Review

**Spec coverage check:**

| Spec requirement | Covered by |
|-----------------|-----------|
| Login detection (password field + URL pattern) | Task 1 `looksLikeLoginPage` |
| `onLoginNeeded` callback in `captureContentOverlay` | Task 1 |
| 2-second post-login settle wait | Task 1 |
| Thread callback through `runCapture` / `RunCaptureOptions` | Task 2 |
| `"awaiting-login"` `JobStatus` | Task 3 |
| Job fields: `loginPage`, `loginResolver`, `loginTimeout`, `snapPending`, `lastSnapshot` | Task 3 |
| `onLoginNeeded` implementation in `processJob` with 5-min timeout | Task 3 |
| `GET /browser-snapshot` with throttle | Task 3 |
| `POST /browser-click` with coordinate validation | Task 3 |
| `POST /browser-type` with Backspace/Enter handling | Task 3 |
| `POST /browser-scroll` with ±500 clamp | Task 3 |
| `POST /browser-reload` | Task 3 |
| `POST /login-done` | Task 3 |
| `loginInteractionLimiter` rate limiter | Task 3 |
| `"awaiting-login"` in `Status`, `PCT` at 35%, `STEP_LABEL` | Task 4 |
| Snapshot polling every 300 ms | Task 4 |
| `<img>` click → `xFrac`/`yFrac` relay | Task 4 |
| `onKeyDown` → relay Backspace, Enter, printable chars | Task 4 |
| `onWheel` → scroll relay | Task 4 |
| ↺ Reload page button | Task 4 |
| Done, I'm logged in button | Task 4 |
| Auto-focus panel for keyboard input | Task 4 |
| ⟳ live badge | Task 4 |
| No-data privacy notice in UI | Task 4 |
| `working` excludes `awaiting-login` so progress panel doesn't show | Task 4 |

All spec requirements are covered. No placeholders. Type signatures are consistent across all four tasks.
