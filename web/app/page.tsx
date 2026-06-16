"use client";

import { useRef, useState } from "react";
import JSZip from "jszip";
import Footer from "./components/Footer";
import Gallery from "./components/Gallery";
import { sizeOf, deriveName } from "./lib/utils";

const WORKER = process.env.NEXT_PUBLIC_WORKER_URL ?? "http://localhost:4000";

type Status = "queued" | "capturing" | "writing" | "rendering" | "packaging" | "done" | "error";

interface Copy {
  shortDescription: string;
  longDescription: string;
  suggestedCategory: string;
  slideHeadlines: string[];
  title?: string;
  keywords?: string[];
  permissionsAnalysis?: {
    safe: string[];
    flagged: Array<{ permission: string; reason: string; suggestion: string }>;
  };
  privacyPolicy?: string;
}
interface JobState {
  id: string;
  status: Status;
  step: string;
  error?: string;
  extensionName?: string;
  brandColor?: string;
  images: string[];
  copy?: Copy;
  iconKit?: { files: string[] };
}

const PCT: Record<Status, number> = {
  queued: 8, capturing: 32, writing: 60, rendering: 82, packaging: 93, done: 100, error: 100,
};
const STEP_LABEL: Record<Status, string> = {
  queued: "Queued…",
  capturing: "Loading your extension & capturing its screens…",
  writing: "Writing your store listing with AI…",
  rendering: "Rendering the store images…",
  packaging: "Packaging your kit…",
  done: "Done!",
  error: "Something went wrong.",
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface Picked {
  blob: Blob;
  name: string;
}

/** Recursively reads a dropped directory/file entry into a flat list with paths. */
function walkEntry(entry: any, prefix: string, out: { path: string; file: File }[]): Promise<void> {
  return new Promise((resolve) => {
    if (entry.isFile) {
      entry.file((f: File) => {
        out.push({ path: prefix + entry.name, file: f });
        resolve();
      }, () => resolve());
    } else if (entry.isDirectory) {
      const reader = entry.createReader();
      const all: any[] = [];
      const readBatch = () =>
        reader.readEntries(async (ents: any[]) => {
          if (ents.length === 0) {
            for (const e of all) await walkEntry(e, prefix + entry.name + "/", out);
            resolve();
          } else {
            all.push(...ents);
            readBatch();
          }
        }, () => resolve());
      readBatch();
    } else resolve();
  });
}

/** Zips a list of {path, file} into a single Blob. */
async function zipFiles(files: { path: string; file: File }[]): Promise<Blob> {
  const zip = new JSZip();
  for (const { path, file } of files) zip.file(path, file);
  return zip.generateAsync({ type: "blob" });
}

export default function Home() {
  const [picked, setPicked] = useState<Picked | null>(null);
  const [dragging, setDragging] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const [job, setJob] = useState<JobState | null>(null);
  const [navOpen, setNavOpen] = useState(false);
  const zipInputRef = useRef<HTMLInputElement>(null);
  const dirInputRef = useRef<HTMLInputElement>(null);

  /** Accepts a single .zip, or a folder / set of files (which we zip in-browser). */
  async function accept(opts: { zip?: File | null; entries?: { path: string; file: File }[] }) {
    if (opts.zip && /\.zip$/i.test(opts.zip.name)) {
      setPicked({ blob: opts.zip, name: opts.zip.name });
      return;
    }
    const files = opts.entries ?? [];
    const real = files.filter((f) => !f.path.includes("__MACOSX") && !f.path.endsWith(".DS_Store"));
    if (real.length === 0) return;
    setPreparing(true);
    try {
      const blob = await zipFiles(real);
      setPicked({ blob, name: deriveName(real) });
    } finally {
      setPreparing(false);
    }
  }

  async function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    const dt = e.dataTransfer;
    // Single .zip dropped → use as-is.
    if (dt.files.length === 1 && /\.zip$/i.test(dt.files[0].name)) {
      await accept({ zip: dt.files[0] });
      return;
    }
    // Folder or loose files → read everything, then zip.
    const items = Array.from(dt.items).filter((i) => i.kind === "file");
    const entries = items.map((i) => (i as any).webkitGetAsEntry?.()).filter(Boolean);
    if (entries.length) {
      const out: { path: string; file: File }[] = [];
      for (const entry of entries) await walkEntry(entry, "", out);
      await accept({ entries: out });
    } else {
      await accept({ entries: Array.from(dt.files).map((f) => ({ path: f.name, file: f })) });
    }
  }

  function onDirPicked(list: FileList | null) {
    if (!list) return;
    const entries = Array.from(list).map((f) => ({
      path: (f as any).webkitRelativePath || f.name,
      file: f,
    }));
    void accept({ entries });
  }

  async function generate() {
    if (!picked) return;
    setJob({ id: "", status: "queued", step: STEP_LABEL.queued, images: [] });
    try {
      const form = new FormData();
      form.append("extension", picked.blob, picked.name);
      const res = await fetch(`${WORKER}/api/jobs`, { method: "POST", body: form });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Upload failed.");
      const { jobId } = await res.json();
      for (;;) {
        await sleep(2000);
        const s = await fetch(`${WORKER}/api/jobs/${jobId}`).then((r) => r.json());
        setJob({
          id: jobId, status: s.status, step: s.step ?? STEP_LABEL[s.status as Status] ?? "",
          error: s.error, extensionName: s.extensionName, brandColor: s.brandColor,
          images: s.images ?? [], copy: s.copy, iconKit: s.iconKit,
        });
        if (s.status === "done" || s.status === "error") break;
      }
    } catch (err) {
      setJob({ id: "", status: "error", step: "", error: err instanceof Error ? err.message : "Upload failed.", images: [] });
    }
  }

  function reset() {
    setJob(null);
    setPicked(null);
  }

  const working = job && job.status !== "done" && job.status !== "error";

  return (
    <main>
      <div className="wrap">
        <nav className="nav">
          <div className="brand">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/zip-icon.png" alt="" className="brand-mark" />
            ZipSnap
          </div>
          <div className={`nav-links ${navOpen ? "open" : ""}`}>
            <a href="#how" onClick={() => setNavOpen(false)}>How it works</a>
            <a href="#output" onClick={() => setNavOpen(false)}>What you get</a>
            <a href="#upload" onClick={() => setNavOpen(false)}>Start</a>
          </div>
          <button
            className="nav-toggle"
            aria-label={navOpen ? "Close menu" : "Open menu"}
            aria-expanded={navOpen}
            onClick={() => setNavOpen((v) => !v)}
          >
            {navOpen ? (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
            ) : (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M3 6h18M3 12h18M3 18h18" /></svg>
            )}
          </button>
        </nav>

        <section className="hero" id="upload">
          <span className="eyebrow">
            <span className="dot" />
            Zip in. Snap out. We do the rest.
          </span>
          <h1 className="hero-title">
            Zip in your extension. <span className="accent">Snap out a store kit.</span>
          </h1>
          <p className="subhead">
            Drag in your Chrome extension — a <span className="mono">.zip</span> or its folder.
            ZipSnap loads it in a real browser, captures every UI surface, writes an optimized
            store listing with title and keywords, checks your permissions for rejection risks,
            generates a paste-ready privacy policy, and designs branded icon files at every
            required size — all automatically, in about 30 seconds.
          </p>

          {!job && (
            <>
              <div
                className={`dropzone ${dragging ? "drag" : ""}`}
                onClick={() => zipInputRef.current?.click()}
                onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
                onDragLeave={() => setDragging(false)}
                onDrop={onDrop}
              >
                <div className="dz-icon">
                  {preparing ? (
                    <span className="spinner" />
                  ) : (
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M12 16V4M12 4l-5 5M12 4l5 5" />
                      <path d="M4 16v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
                    </svg>
                  )}
                </div>
                <div className="dz-title">
                  {preparing ? "Preparing…" : picked ? picked.name : "Drag your extension here"}
                </div>
                <div className="dz-sub">
                  {picked && !preparing ? (
                    <>ready to generate · <span className="mono">{(picked.blob.size / 1024).toFixed(0)} KB</span></>
                  ) : (
                    <>
                      drop a <span className="mono">.zip</span> or a folder — or click to browse, or{" "}
                      <button
                        type="button"
                        className="link-btn"
                        onClick={(e) => { e.stopPropagation(); dirInputRef.current?.click(); }}
                      >
                        pick a folder
                      </button>
                    </>
                  )}
                </div>
                <input ref={zipInputRef} type="file" accept=".zip" hidden tabIndex={-1} aria-hidden="true" onChange={(e) => accept({ zip: e.target.files?.[0] ?? null })} />
                <input
                  ref={dirInputRef}
                  type="file"
                  multiple
                  hidden
                  tabIndex={-1}
                  aria-hidden="true"
                  onChange={(e) => onDirPicked(e.target.files)}
                  {...({ webkitdirectory: "", directory: "" } as Record<string, string>)}
                />
              </div>

              {!picked && !preparing && (
                <p className="hint" style={{ marginTop: 6 }}>
                  No extension handy?{" "}
                  <a href="/sample-extension.zip" download className="link-btn">
                    Download our sample →
                  </a>
                </p>
              )}

              <div className="cta-row">
                <button className="btn btn-primary" disabled={!picked || preparing} onClick={generate}>
                  Generate my kit →
                </button>
              </div>
              <p className="hint">No screenshots to take. No design tools. Free during beta.</p>
            </>
          )}

          {working && (
            <div className="panel">
              <div className="panel-head">
                <div className="panel-title">
                  <span className="spinner" />
                  {job!.extensionName ?? picked?.name ?? "Your extension"}
                </div>
                <span className="mono" style={{ color: "var(--text-faint)", fontSize: 12.5 }}>
                  {Math.round(PCT[job!.status])}%
                </span>
              </div>
              <div className="progress">
                <div className="progress-step">{job!.step || STEP_LABEL[job!.status]}</div>
                <div className="bar">
                  <div className="bar-fill" style={{ width: `${PCT[job!.status]}%` }} />
                </div>
                <p className="muted-note">
                  We&apos;re running a real browser to photograph your extension&apos;s actual UI — usually about half a minute.
                </p>
              </div>
            </div>
          )}

          {job?.status === "error" && (
            <div className="panel">
              <div className="error-box">{job.error ?? "Something went wrong."}</div>
              <div className="cta-row" style={{ marginTop: 16 }}>
                <button className="btn btn-ghost" onClick={reset}>Try another extension</button>
              </div>
            </div>
          )}

          {job?.status === "done" && <Results job={job} onReset={reset} />}
        </section>

        {!job && (
          <>
            <Gallery />

            <section className="section" id="how">
              <div className="section-label">How it works</div>
              <h2 className="section-title">Three steps. Zero screenshots.</h2>
              <div className="steps">
                <div className="step"><div className="step-num">1</div><h3>Drop your extension</h3><p>Drag in a .zip or your unpacked folder. ZipSnap reads its manifest to find every screen it has — popup, options, and on-page UI.</p></div>
                <div className="step"><div className="step-num">2</div><h3>We capture it live</h3><p>It loads your extension in a real browser and photographs its actual screens — even site-specific ones, on the site they belong to.</p></div>
                <div className="step"><div className="step-num">3</div><h3>Download the kit</h3><p>Screenshots, promo tiles, an optimized listing with title and keywords, a permissions report, a privacy policy, and branded icons — everything the Chrome Web Store needs.</p></div>
              </div>
            </section>

            <section className="section" id="output" style={{ paddingTop: 0 }}>
              <div className="section-label">What you get</div>
              <h2 className="section-title">Exactly What The Store Demands.</h2>
              <div className="specs">
                <span className="spec"><b>5×</b> screenshots · 1280×800</span>
                <span className="spec"><b>1×</b> small promo · 440×280</span>
                <span className="spec"><b>1×</b> marquee · 1400×560</span>
                <span className="spec"><b>Listing</b> · title, short + long desc, category</span>
                <span className="spec"><b>7×</b> keywords</span>
                <span className="spec"><b>5×</b> slide headlines</span>
                <span className="spec"><b>Permissions</b> · rejection risk report</span>
                <span className="spec"><b>Privacy policy</b> · paste-ready</span>
                <span className="spec"><b>Icons</b> · 128 / 48 / 32 / 16 px</span>
              </div>
            </section>
          </>
        )}

        <Footer />
      </div>
    </main>
  );
}

function Results({ job, onReset }: { job: JobState; onReset: () => void }) {
  const copy = job.copy;
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  function doCopy(text: string, key: string) {
    navigator.clipboard?.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 1500);
  }

  return (
    <div className="panel">
      <div className="panel-head">
        <div className="panel-title">
          {job.brandColor && <span className="swatch" style={{ background: job.brandColor }} />}
          {job.extensionName ?? "Your kit"} — ready
        </div>
        <a className="btn btn-primary" href={`${WORKER}/api/jobs/${job.id}/kit`} target="_blank" rel="noreferrer">
          Download kit (.zip)
        </a>
      </div>

      <div className="result-grid">
        {job.images.map((name) => (
          <div className="result-shot" key={name}>
            <div className="result-frame-bar">
              <span className="dot" />
              <span className="dot" />
              <span className="dot" />
            </div>
            <img
              src={`${WORKER}/api/jobs/${job.id}/image/${name}`}
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

      {copy && (
        <>
          {copy.title && (
            <div className="copy-block">
              <div className="cb-head">
                <span className="cb-label">Store title <span className="cb-meta">(45 chars max)</span></span>
                <button className="btn-mini" onClick={() => doCopy(copy.title!, "title")}>
                  {copiedKey === "title" ? "Copied!" : "Copy"}
                </button>
              </div>
              <div className="cb-text">{copy.title}</div>
              <div className="title-charcount" style={{ color: copy.title.length > 45 ? "var(--red)" : "var(--text-faint)" }}>
                {copy.title.length}/45
              </div>
            </div>
          )}

          <div className="copy-block">
            <div className="cb-head"><span className="cb-label">Suggested category</span></div>
            <span className="chip">{copy.suggestedCategory}</span>
          </div>
          <div className="copy-block">
            <div className="cb-head">
              <span className="cb-label">Short description</span>
              <button className="btn-mini" onClick={() => doCopy(copy.shortDescription, "short")}>
                {copiedKey === "short" ? "Copied!" : "Copy"}
              </button>
            </div>
            <div className="cb-text">{copy.shortDescription}</div>
          </div>
          <div className="copy-block">
            <div className="cb-head">
              <span className="cb-label">Long description</span>
              <button className="btn-mini" onClick={() => doCopy(copy.longDescription, "long")}>
                {copiedKey === "long" ? "Copied!" : "Copy"}
              </button>
            </div>
            <div className="cb-text">{copy.longDescription}</div>
          </div>
          <div className="copy-block">
            <div className="cb-head">
              <span className="cb-label">Slide headlines</span>
              <button className="btn-mini" onClick={() => doCopy(copy.slideHeadlines.join("\n"), "headlines")}>
                {copiedKey === "headlines" ? "Copied!" : "Copy all"}
              </button>
            </div>
            <div className="cb-text">{copy.slideHeadlines.map((h, i) => `${i + 1}. ${h}`).join("\n")}</div>
          </div>

          {copy.keywords?.length ? (
            <div className="copy-block">
              <div className="cb-head">
                <span className="cb-label">Keywords</span>
                <button className="btn-mini" onClick={() => doCopy(copy.keywords!.join(", "), "keywords")}>
                  {copiedKey === "keywords" ? "Copied!" : "Copy all"}
                </button>
              </div>
              <div className="keyword-chips">
                {copy.keywords.map((kw, i) => (
                  <span key={i} className="keyword-chip">{kw}</span>
                ))}
              </div>
            </div>
          ) : null}

          {copy.permissionsAnalysis && (
            <div className="copy-block">
              <div className="cb-head">
                <span className="cb-label">Permissions</span>
              </div>
              {copy.permissionsAnalysis.safe.length > 0 && (
                <div className="perm-safe-list">
                  {copy.permissionsAnalysis.safe.map((p) => (
                    <span key={p} className="perm-safe-item">✓ {p}</span>
                  ))}
                </div>
              )}
              {copy.permissionsAnalysis.flagged.length > 0 && (
                <div className="perm-flagged-list">
                  {copy.permissionsAnalysis.flagged.map((f) => (
                    <div key={f.permission} className="perm-flagged-item">
                      <div className="perm-flag-header">⚠ {f.permission}</div>
                      <div className="perm-flag-reason">{f.reason}</div>
                      <div className="perm-flag-fix">→ {f.suggestion}</div>
                    </div>
                  ))}
                </div>
              )}
              {copy.permissionsAnalysis.flagged.length === 0 && copy.permissionsAnalysis.safe.length > 0 && (
                <div className="perm-all-clear">All permissions look good ✓</div>
              )}
            </div>
          )}

          {copy.privacyPolicy && (
            <div className="copy-block">
              <div className="cb-head">
                <span className="cb-label">Privacy policy</span>
                <button className="btn-mini" onClick={() => doCopy(copy.privacyPolicy!, "privacy")}>
                  {copiedKey === "privacy" ? "Copied!" : "Copy"}
                </button>
              </div>
              <div className="cb-text cb-text--privacy">{copy.privacyPolicy}</div>
            </div>
          )}
        </>
      )}

      {job.iconKit?.files?.length ? (
        <div className="copy-block">
          <div className="cb-head">
            <span className="cb-label">Generated icons</span>
            <span className="cb-meta">All sizes included in your kit</span>
          </div>
          <div className="icon-preview-row">
            {job.iconKit.files.map((filename) => {
              const size = filename.match(/icon-(\d+)\.png/)?.[1];
              return (
                <div key={filename} className="icon-preview-item">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={`${WORKER}/api/jobs/${job.id}/icon/${filename}`}
                    alt={`${size}px icon`}
                    width={size ? Math.min(Number(size), 64) : 64}
                    height={size ? Math.min(Number(size), 64) : 64}
                    style={{ imageRendering: "pixelated" }}
                  />
                  <span className="icon-size-label">{size}px</span>
                </div>
              );
            })}
          </div>
        </div>
      ) : null}

      <div className="cta-row" style={{ marginTop: 16, justifyContent: "flex-start" }}>
        <button className="btn btn-ghost" onClick={onReset}>Generate another</button>
      </div>
    </div>
  );
}
