# Accent Color Picker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Default all kit renders to slate gray and let users pick any accent color from a swatch grid or hex input after the kit is generated, re-rendering everything server-side on Apply.

**Architecture:** Add an optional `colorOverride` param to `runRender`; pass `#64748b` from `processJob` so the first render is always gray. Add `POST /api/jobs/:id/rerender` that re-runs render + icons + repackage with a chosen color. In the web UI, attach a color picker panel to the results header; on Apply call the rerender endpoint and swap images in place with a spinner overlay.

**Tech Stack:** TypeScript, Express (worker), React/Next.js 15 (web), existing `makeBrand`/`renderScreenshot`/`renderTile` pipeline, `AdmZip` for packaging.

## Global Constraints

- Default accent color: `#64748b`
- Swatch palette: 24 colors in 6×4 grid (exact values in Task 3)
- Hex validation regex: `/^#[0-9a-fA-F]{6}$/`
- Rerender endpoint: `POST /api/jobs/:id/rerender` body `{ color: string }`
- Job must be `done` to rerender; 409 if not
- Apply button disabled when picker color equals currently-rendered color
- Images stay visible at `opacity: 0.4` with spinner overlay during re-render
- Image URLs must include a cache-bust param after re-render (filenames don't change)

---

### Task 1: Default render color to gray + colorOverride in pipeline

**Files:**
- Modify: `worker/src/brandColor.ts`
- Modify: `worker/src/pipeline.ts`
- Modify: `worker/src/server.ts`
- Modify: `worker/src/pipeline.test.ts`

**Interfaces:**
- Produces: `isValidHex(color: string): boolean` — exported from `pipeline.ts`
- Produces: `runRender(capture, copy, outputDir, onStep?, colorOverride?: string)` — new optional last param; when provided, passed to `makeBrand` instead of `capture.brandColor`

- [ ] **Step 1: Write failing test for isValidHex**

Add to `worker/src/pipeline.test.ts` (after existing imports):

```ts
import { pngSize, saveVerified, isValidHex } from "./pipeline";
```

Add at the end of the file:

```ts
describe("isValidHex", () => {
  it("accepts valid 6-digit hex strings", () => {
    expect(isValidHex("#64748b")).toBe(true);
    expect(isValidHex("#FFFFFF")).toBe(true);
    expect(isValidHex("#000000")).toBe(true);
    expect(isValidHex("#aAbBcC")).toBe(true);
  });
  it("rejects invalid values", () => {
    expect(isValidHex("#fff")).toBe(false);
    expect(isValidHex("64748b")).toBe(false);
    expect(isValidHex("#gggggg")).toBe(false);
    expect(isValidHex("not-a-color")).toBe(false);
    expect(isValidHex("")).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to confirm it fails**

Run from `worker/`:
```bash
npm test -- pipeline.test.ts
```
Expected: FAIL — `isValidHex` is not exported from `./pipeline`

- [ ] **Step 3: Export isValidHex from pipeline.ts**

Add after the existing imports in `worker/src/pipeline.ts`:

```ts
export function isValidHex(color: string): boolean {
  return /^#[0-9a-fA-F]{6}$/.test(color);
}
```

- [ ] **Step 4: Add colorOverride param to runRender**

In `worker/src/pipeline.ts`, change the `runRender` signature and its first line:

```ts
export async function runRender(
  capture: CaptureResult,
  copy: StoreCopy,
  outputDir: string,
  onStep: OnStep = () => {},
  colorOverride?: string,
): Promise<{ kitDir: string; files: string[] }> {
  const brand = makeBrand(colorOverride ?? capture.brandColor);
  // rest of function unchanged
```

- [ ] **Step 5: Change FALLBACK in brandColor.ts**

In `worker/src/brandColor.ts`, change line 15:

```ts
const FALLBACK = "#64748b";
```

- [ ] **Step 6: Pass default color in processJob**

In `worker/src/server.ts`, add this constant just after the `JOBS_DIR` line:

```ts
const DEFAULT_COLOR = "#64748b";
```

Then in `processJob`, change the `runRender` call to:

```ts
const { kitDir, files } = await runRender(capture, copy, job.outputDir, (s) => (job.step = s), DEFAULT_COLOR);
```

And change the `generateIcons` call to use `DEFAULT_COLOR` instead of `capture.brandColor`:

```ts
const iconResult = await generateIcons(
  capture.extension.name,
  capture.extension.description,
  DEFAULT_COLOR,
  job.outputDir,
);
```

- [ ] **Step 7: Run tests**

Run from `worker/`:
```bash
npm test -- pipeline.test.ts
```
Expected: all `isValidHex` tests PASS alongside existing pipeline tests

- [ ] **Step 8: Typecheck**

Run from `worker/`:
```bash
npm run typecheck
```
Expected: no errors

- [ ] **Step 9: Commit**

```bash
git add worker/src/brandColor.ts worker/src/pipeline.ts worker/src/server.ts worker/src/pipeline.test.ts
git commit -m "Default render color to gray; add colorOverride to runRender"
```

---

### Task 2: Rerender endpoint

**Files:**
- Modify: `worker/src/server.ts`

**Interfaces:**
- Consumes: `runRender(..., colorOverride)` and `isValidHex` from Task 1
- Produces: `POST /api/jobs/:id/rerender` → `200 { images: string[], iconKit: { files: string[] } | null }` or `400/404/409/500`

- [ ] **Step 1: Extract packageKit helper**

In `worker/src/server.ts`, add this helper function just above `processJob`:

```ts
async function packageKit(job: Job, kitDir: string, iconsDir: string | undefined): Promise<void> {
  const zip = new AdmZip();
  zip.addLocalFolder(kitDir);
  if (iconsDir) zip.addLocalFolder(iconsDir, "icons");
  zip.addFile(
    "descriptions.txt",
    Buffer.from(descriptionsText(job.capture!.extension.name, job.copy!), "utf8"),
  );
  const zipPath = path.join(job.dir, "zipsnap-kit.zip");
  zip.writeZip(zipPath);
  job.kitZipPath = zipPath;
}
```

Then in `processJob`, replace the packaging block (the four lines starting with `const zip = new AdmZip()`) and the `job.status = "done"` assignment with:

```ts
job.status = "packaging";
job.step = "Packaging the kit";
await packageKit(job, kitDir, iconsDir);
job.status = "done";
job.step = "Done";
```

- [ ] **Step 2: Import isValidHex in server.ts**

Change the pipeline import at the top of `server.ts`:

```ts
import { runCapture, runRender, isValidHex } from "./pipeline";
```

- [ ] **Step 3: Add the rerender route**

Add this route to `server.ts` after the `GET /api/jobs/:id/icon/:name` route and before the `GET /api/jobs/:id/kit` route:

```ts
app.post("/api/jobs/:id/rerender", express.json(), async (req, res) => {
  const job = jobs.get(req.params.id);
  if (!job) {
    res.status(404).json({ error: "No such job." });
    return;
  }
  if (job.status !== "done") {
    res.status(409).json({ error: "Job is not done yet." });
    return;
  }
  const { color } = req.body as { color?: string };
  if (!color || !isValidHex(color)) {
    res.status(400).json({ error: "color must be a 6-digit hex string like #ff0000." });
    return;
  }
  if (!job.capture || !job.copy) {
    res.status(409).json({ error: "Job capture data unavailable." });
    return;
  }

  job.status = "rendering";
  job.step = "Re-rendering with new color";

  try {
    const { kitDir, files } = await runRender(
      job.capture,
      job.copy,
      job.outputDir,
      (s) => (job.step = s),
      color,
    );
    job.kitDir = kitDir;
    job.images = files.map((f) => path.basename(f));

    job.step = "Re-generating icons";
    let newIconsDir: string | undefined;
    try {
      const iconResult = await generateIcons(
        job.capture.extension.name,
        job.capture.extension.description,
        color,
        job.outputDir,
      );
      job.iconsDir = iconResult.iconsDir;
      job.iconFiles = iconResult.files;
      newIconsDir = iconResult.iconsDir;
    } catch {
      // icon generation is best-effort
    }

    await packageKit(job, kitDir, newIconsDir ?? job.iconsDir);
    job.status = "done";
    job.step = "Done";

    res.json({
      images: job.images,
      iconKit: job.iconFiles?.length ? { files: job.iconFiles } : null,
    });
  } catch (err) {
    job.status = "done";
    job.error = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: job.error });
  }
});
```

- [ ] **Step 4: Typecheck**

Run from `worker/`:
```bash
npm run typecheck
```
Expected: no errors

- [ ] **Step 5: Run all worker tests**

Run from `worker/`:
```bash
npm test
```
Expected: all tests pass

- [ ] **Step 6: Commit**

```bash
git add worker/src/server.ts
git commit -m "Add POST /api/jobs/:id/rerender endpoint"
```

---

### Task 3: Color picker UI

**Files:**
- Modify: `web/app/page.tsx`

**Interfaces:**
- Consumes: `POST /api/jobs/:id/rerender` — body `{ color: string }`, response `{ images: string[], iconKit: { files: string[] } | null }`
- `Results` gains new prop: `onRerender: (images: string[], iconKit: { files: string[] } | undefined) => void`

- [ ] **Step 1: Add SWATCHES constant and isHex helper**

In `web/app/page.tsx`, add these after the imports and before the `WORKER` constant:

```ts
const SWATCHES = [
  "#64748b","#6b7280","#78716c","#71717a","#374151","#1e1e2e",
  "#1e3a8a","#2563eb","#7c3aed","#9333ea","#4f46e5","#0d9488",
  "#166534","#059669","#d97706","#ea580c","#dc2626","#be123c",
  "#0284c7","#0891b2","#65a30d","#db2777","#e11d48","#92400e",
] as const;

function isHex(v: string): boolean {
  return /^#[0-9a-fA-F]{6}$/.test(v);
}
```

- [ ] **Step 2: Wire onRerender in the Home component**

In the `Home` component, change the `Results` render (currently `{job?.status === "done" && <Results job={job} onReset={reset} />}`) to:

```tsx
{job?.status === "done" && (
  <Results
    job={job}
    onReset={reset}
    onRerender={(images, iconKit) =>
      setJob((prev) =>
        prev ? { ...prev, images, ...(iconKit ? { iconKit } : {}) } : prev,
      )
    }
  />
)}
```

- [ ] **Step 3: Add new state and applyColor to Results**

Change the `Results` signature to:

```ts
function Results({
  job,
  onReset,
  onRerender,
}: {
  job: JobState;
  onReset: () => void;
  onRerender: (images: string[], iconKit: { files: string[] } | undefined) => void;
})
```

Add these state declarations after `const [copiedKey, setCopiedKey] = useState<string | null>(null);`:

```ts
const [accentColor, setAccentColor] = useState("#64748b");
const [pickerColor, setPickerColor] = useState("#64748b");
const [hexInput, setHexInput] = useState("#64748b");
const [rerendering, setRerendering] = useState(false);
const [renderKey, setRenderKey] = useState(0);
```

Add this function after the state declarations:

```ts
async function applyColor() {
  if (!isHex(pickerColor) || pickerColor === accentColor || rerendering) return;
  setRerendering(true);
  try {
    const res = await fetch(`${WORKER}/api/jobs/${job.id}/rerender`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ color: pickerColor }),
    });
    if (!res.ok) throw new Error("Re-render failed.");
    const data = await res.json() as { images: string[]; iconKit: { files: string[] } | null };
    onRerender(data.images, data.iconKit ?? undefined);
    setAccentColor(pickerColor);
    setRenderKey((k) => k + 1);
  } catch {
    // leave state as-is; user can retry
  } finally {
    setRerendering(false);
  }
}
```

- [ ] **Step 4: Replace panel-head with color picker + download button**

Replace the existing `<div className="panel-head">...</div>` in `Results` with:

```tsx
<div className="panel-head">
  <div className="panel-title">
    {job.brandColor && <span className="swatch" style={{ background: job.brandColor }} />}
    {job.extensionName ?? "Your kit"} — ready
  </div>
  <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
    <div style={{
      background: "var(--surface-2, #1e2030)",
      border: "1px solid var(--border, #2e3050)",
      borderRadius: 10,
      padding: 12,
      display: "flex",
      flexDirection: "column",
      gap: 8,
      width: 188,
    }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 4 }}>
        {SWATCHES.map((c) => (
          <button
            key={c}
            onClick={() => { setPickerColor(c); setHexInput(c); }}
            style={{
              width: 24,
              height: 24,
              borderRadius: 4,
              background: c,
              border: pickerColor === c ? "2px solid #fff" : "2px solid transparent",
              cursor: "pointer",
              padding: 0,
            }}
            aria-label={c}
            title={c}
          />
        ))}
      </div>
      <input
        type="text"
        value={hexInput}
        maxLength={7}
        onChange={(e) => {
          setHexInput(e.target.value);
          if (isHex(e.target.value)) setPickerColor(e.target.value);
        }}
        style={{
          fontFamily: "monospace",
          fontSize: 12,
          padding: "4px 8px",
          borderRadius: 6,
          border: "1px solid var(--border, #2e3050)",
          background: "var(--surface-1, #161720)",
          color: "var(--text, #e2e8f0)",
          width: "100%",
          boxSizing: "border-box",
        }}
        aria-label="Hex color code"
      />
      <button
        className="btn btn-primary"
        style={{ width: "100%", padding: "6px 0", fontSize: 13 }}
        disabled={!isHex(pickerColor) || pickerColor === accentColor || rerendering}
        onClick={applyColor}
      >
        {rerendering ? "Applying…" : "Apply"}
      </button>
    </div>
    <a
      className="btn btn-primary"
      href={`${WORKER}/api/jobs/${job.id}/kit`}
      target="_blank"
      rel="noreferrer"
    >
      Download kit (.zip)
    </a>
  </div>
</div>
```

- [ ] **Step 5: Add spinner overlay to result-grid**

Wrap the existing `<div className="result-grid">` block with a relative container and overlay. Replace the opening `<div className="result-grid">` and its closing tag (the whole images block) with:

```tsx
<div style={{ position: "relative" }}>
  <div
    className="result-grid"
    style={{ opacity: rerendering ? 0.4 : 1, transition: "opacity 0.2s" }}
  >
    {job.images.map((name) => (
      <div className="result-shot" key={name}>
        <div className="result-frame-bar">
          <span className="dot" />
          <span className="dot" />
          <span className="dot" />
        </div>
        <img
          src={`${WORKER}/api/jobs/${job.id}/image/${name}?v=${renderKey}`}
          alt={name}
          onError={(e) => {
            e.currentTarget.style.display = "none";
            e.currentTarget.parentElement?.classList.add("img-error");
          }}
        />
        <div className="img-error-note">Preview unavailable</div>
        <div className="cap">{name} · {sizeOf(name)}</div>
      </div>
    ))}
  </div>
  {rerendering && (
    <div style={{
      position: "absolute",
      inset: 0,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      pointerEvents: "none",
    }}>
      <span className="spinner" style={{ width: 32, height: 32 }} />
    </div>
  )}
</div>
```

Note: `?v=${renderKey}` cache-busts the image URL so the browser fetches the newly-rendered file instead of the cached old one. The same applies to icon images — update the icon `<img>` src to `${WORKER}/api/jobs/${job.id}/icon/${filename}?v=${renderKey}` in the icon preview row.

- [ ] **Step 6: Cache-bust icon images**

Find the icon `<img>` inside the `job.iconKit` block and add the cache-bust param:

```tsx
<img
  src={`${WORKER}/api/jobs/${job.id}/icon/${filename}?v=${renderKey}`}
  alt={`${size}px icon`}
  width={size ? Math.min(Number(size), 64) : 64}
  height={size ? Math.min(Number(size), 64) : 64}
  style={{ imageRendering: "pixelated" }}
/>
```

- [ ] **Step 7: Typecheck web**

Run from `web/`:
```bash
npm run typecheck
```
Expected: no errors

- [ ] **Step 8: Run web tests**

Run from `web/`:
```bash
npm test
```
Expected: all tests pass

- [ ] **Step 9: Commit**

```bash
git add web/app/page.tsx
git commit -m "Add color picker with rerender to results view"
```
