"use client";

import { useEffect, useRef, useState } from "react";
import JSZip from "jszip";
import Footer from "./components/Footer";
import Gallery from "./components/Gallery";
import { sizeOf, deriveName } from "./lib/utils";

const SWATCHES = [
  "#64748b","#6b7280","#78716c","#71717a","#374151","#1e1e2e",
  "#1e3a8a","#2563eb","#7c3aed","#9333ea","#4f46e5","#0d9488",
  "#166534","#059669","#d97706","#ea580c","#dc2626","#be123c",
  "#0284c7","#0891b2","#65a30d","#db2777","#e11d48","#92400e",
] as const;

function isHex(v: string): boolean {
  return /^#[0-9a-fA-F]{6}$/.test(v);
}

const WORKER = process.env.NEXT_PUBLIC_WORKER_URL ?? "http://localhost:4000";

type Status = "queued" | "capturing" | "awaiting-login" | "writing" | "rendering" | "packaging" | "done" | "error";

interface ManifestIssue {
  type: "error" | "warning";
  code: string;
  message: string;
  fix: string;
}

interface Copy {
  shortDescription: string;
  longDescription: string;
  suggestedCategory: string;
  slideHeadlines: string[];
  title?: string;
  keywords?: string[];
  permissionsAnalysis?: {
    safe: string[];
    flagged: Array<{ permission: string; reason: string; suggestion: string; listingJustification?: string }>;
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
  manifestHealth?: { issues: ManifestIssue[] };
  iconKit?: { files: string[] };
}

const PCT: Record<Status, number> = {
  queued: 8, capturing: 32, "awaiting-login": 35, writing: 60, rendering: 82, packaging: 93, done: 100, error: 100,
};
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
  const [frameUrl, setFrameUrl] = useState<string | null>(null);
  const prevFrameUrl = useRef<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const startedAtRef = useRef<number | null>(null);
  const zipInputRef = useRef<HTMLInputElement>(null);
  const dirInputRef = useRef<HTMLInputElement>(null);
  const loginPanelRef = useRef<HTMLDivElement>(null);

  const awaitingLogin = job?.status === "awaiting-login";

  useEffect(() => {
    if (!awaitingLogin || !job) return;
    loginPanelRef.current?.focus();
    const wsUrl = WORKER.replace(/^http/, "ws") + `/api/jobs/${job.id}/browser-stream`;
    const ws = new WebSocket(wsUrl);
    ws.binaryType = "blob";
    ws.onmessage = (e) => {
      const url = URL.createObjectURL(e.data as Blob);
      setFrameUrl(url);
      if (prevFrameUrl.current) URL.revokeObjectURL(prevFrameUrl.current);
      prevFrameUrl.current = url;
    };
    return () => {
      ws.close();
      if (prevFrameUrl.current) { URL.revokeObjectURL(prevFrameUrl.current); prevFrameUrl.current = null; }
      setFrameUrl(null);
    };
  }, [awaitingLogin, job?.id]);

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
          images: s.images ?? [], copy: s.copy, manifestHealth: s.manifestHealth, iconKit: s.iconKit,
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

  async function relayBack(jobId: string) {
    await fetch(`${WORKER}/api/jobs/${jobId}/browser-back`, { method: "POST" }).catch(() => {});
  }

  async function loginDone(jobId: string) {
    await fetch(`${WORKER}/api/jobs/${jobId}/login-done`, { method: "POST" }).catch(() => {});
  }

  const working = job && job.status !== "done" && job.status !== "error" && job.status !== "awaiting-login";

  useEffect(() => {
    if (!working) { startedAtRef.current = null; setElapsed(0); return; }
    if (startedAtRef.current === null) startedAtRef.current = Date.now();
    const id = setInterval(() => setElapsed(Math.floor((Date.now() - startedAtRef.current!) / 1000)), 1000);
    return () => clearInterval(id);
  }, [working]);

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
            Drag in your Chrome extension, a <span className="mono">.zip</span> or its folder.
            ZipSnap loads it in a real browser, captures every UI surface, writes an optimized
            store listing with title and keywords, checks your permissions for rejection risks,
            generates a paste-ready privacy policy, and designs branded icon files at every
            required size. All automatically, in about 30 seconds.
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
                      drop a <span className="mono">.zip</span> or a folder, or click to browse, or{" "}
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

              <div className="cta-row">
                <button className="btn btn-primary" disabled={!picked || preparing} onClick={generate}>
                  Generate my kit →
                </button>
              </div>
              <p className="hint">No screenshots to take. No design tools. Free during beta.</p>
              <p className="hint" style={{ marginTop: 4 }}>Your extension is processed in a private session and deleted after 24 hours.</p>
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
                  {Math.round(PCT[job!.status] ?? 0)}% · {elapsed}s
                </span>
              </div>
              <div className="progress">
                <div className="progress-step">{job!.step || STEP_LABEL[job!.status]}</div>
                <div className="bar">
                  <div className="bar-fill" style={{ width: `${PCT[job!.status]}%` }} />
                </div>
                <p className="muted-note">
                  We&apos;re running a real browser to photograph your extension&apos;s actual UI. Usually about half a minute.
                </p>
              </div>
            </div>
          )}

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
                  src={frameUrl ?? `${WORKER}/api/jobs/${job.id}/browser-snapshot`}
                  alt="Live browser view, click to interact"
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
                  title="Go back to the previous page"
                  onClick={() => void relayBack(job.id)}
                  style={{ flexShrink: 0 }}
                >
                  ← Back
                </button>
                <button
                  className="btn btn-ghost"
                  title="Reloads the page if the extension did not inject after login"
                  onClick={() => void relayReload(job.id)}
                  style={{ flexShrink: 0 }}
                >
                  ↺ Reload
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

          {job?.status === "error" && (
            <div className="panel">
              <div className="error-box">{job.error ?? "Something went wrong."}</div>
              <div className="cta-row" style={{ marginTop: 16 }}>
                <button className="btn btn-ghost" onClick={reset}>Try another extension</button>
              </div>
            </div>
          )}

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
        </section>

        {!job && (
          <>
            <Gallery />

            <section className="section" id="how">
              <div className="section-label">How it works</div>
              <h2 className="section-title">Three steps. Zero screenshots.</h2>
              <div className="steps">
                <div className="step"><div className="step-num">1</div><h3>Drop your extension</h3><p>Drag in a .zip or your unpacked folder. ZipSnap reads its manifest to find every screen it has: popup, options, and on-page UI.</p></div>
                <div className="step"><div className="step-num">2</div><h3>We capture it live</h3><p>It loads your extension in a real browser and photographs its actual screens, even site-specific ones, on the site they belong to.</p></div>
                <div className="step"><div className="step-num">3</div><h3>Download the kit</h3><p>Screenshots, promo tiles, an optimized listing with title and keywords, a permissions report, a privacy policy, and branded icons. Everything the Chrome Web Store needs.</p></div>
              </div>
            </section>

            <section className="section" id="output" style={{ paddingTop: 0 }}>
              <div className="section-label">What you get</div>
              <h2 className="section-title">Exactly what the store demands.</h2>
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

            <section className="section" id="faq">
              <div className="section-label">FAQ</div>
              <h2 className="section-title">Common questions.</h2>
              <div className="faq-list">
                <div className="faq-item">
                  <div className="faq-q">What if my extension requires login to a site?</div>
                  <div className="faq-a">ZipSnap pauses and shows you a live browser view so you can sign in. Once you&apos;re logged in, click &ldquo;Done&rdquo; and it continues automatically.</div>
                </div>
                <div className="faq-item">
                  <div className="faq-q">What file formats work?</div>
                  <div className="faq-a">A <span className="mono">.zip</span> or an unpacked extension folder. Either works. Drop it straight in.</div>
                </div>
                <div className="faq-item">
                  <div className="faq-q">How long does it take?</div>
                  <div className="faq-a">About 30 seconds. A real browser loads your extension, photographs every screen, then AI writes the listing and renders the images.</div>
                </div>
                <div className="faq-item">
                  <div className="faq-q">What happens to my extension files?</div>
                  <div className="faq-a">Your extension is processed in a temporary private session and deleted after 24 hours. Nothing is stored beyond that or shared with anyone.</div>
                </div>
                <div className="faq-item">
                  <div className="faq-q">Is it really free?</div>
                  <div className="faq-a">Yes, free during beta. No account needed. Drop your extension and go.</div>
                </div>
              </div>
            </section>
          </>
        )}

        <Footer />
      </div>
    </main>
  );
}

function Results({
  job,
  onReset,
  onRerender,
}: {
  job: JobState;
  onReset: () => void;
  onRerender: (images: string[], iconKit: { files: string[] } | undefined) => void;
}) {
  const health = job.manifestHealth;
  const [copy, setCopy] = useState<Copy | undefined>(job.copy);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const initial = job.brandColor && /^#[0-9a-fA-F]{6}$/.test(job.brandColor) ? job.brandColor : "#64748b";
  const [accentColor, setAccentColor] = useState(initial);
  const [pickerColor, setPickerColor] = useState(initial);
  const [hexInput, setHexInput] = useState(initial);
  const [rerendering, setRerendering] = useState(false);
  const [renderKey, setRenderKey] = useState(0);
  const [rerenderError, setRerenderError] = useState<string | null>(null);
  const [recopying, setRecopying] = useState(false);
  const [recopyError, setRecopyError] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [emailSent, setEmailSent] = useState(false);
  const [emailError, setEmailError] = useState<string | null>(null);

  async function applyColor() {
    setRerenderError(null);
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
      setRerenderError("Re-render failed. Please try again.");
    } finally {
      setRerendering(false);
    }
  }

  function doCopy(text: string, key: string) {
    navigator.clipboard?.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 1500);
  }

  async function regenerateCopy() {
    setRecopying(true);
    setRecopyError(null);
    try {
      const res = await fetch(`${WORKER}/api/jobs/${job.id}/recopy`, { method: "POST" });
      if (!res.ok) throw new Error("Regeneration failed.");
      const data = await res.json() as { copy: Copy };
      setCopy(data.copy);
    } catch {
      setRecopyError("Regeneration failed. Please try again.");
    } finally {
      setRecopying(false);
    }
  }

  async function submitEmail(e: React.FormEvent) {
    e.preventDefault();
    setEmailError(null);
    try {
      const res = await fetch(`${WORKER}/api/subscribe`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      if (!res.ok) throw new Error("Failed to subscribe.");
      setEmailSent(true);
    } catch {
      setEmailError("Something went wrong. Please try again.");
    }
  }

  return (
    <div className="panel">
      <div className="panel-head" style={{ flexDirection: "column", alignItems: "stretch", gap: 14, flexWrap: "nowrap" }}>
        <div style={{
          background: "var(--chrome-sweep)",
          WebkitBackgroundClip: "text",
          WebkitTextFillColor: "transparent",
          backgroundClip: "text",
          fontSize: 22,
          fontWeight: 680,
          letterSpacing: "-0.02em",
          lineHeight: 1.2,
        }}>
          {job.extensionName ?? "Your kit"} · ready
        </div>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
          <a
            className="btn btn-primary"
            href={`${WORKER}/api/jobs/${job.id}/kit`}
            target="_blank"
            rel="noreferrer"
            style={{ flex: 1, textAlign: "center", boxSizing: "border-box" }}
          >
            Download kit (.zip)
          </a>
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
            {rerenderError && (
              <div style={{ fontSize: 11, color: "#f87171", textAlign: "center" }}>
                {rerenderError}
              </div>
            )}
          </div>
        </div>
      </div>

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
              {/* eslint-disable-next-line @next/next/no-img-element */}
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

      {copy && (
        <>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
            <span style={{ fontSize: 11, color: "var(--text-faint)", fontFamily: "var(--font-mono), monospace", letterSpacing: "0.06em", textTransform: "uppercase" }}>AI copy</span>
            <button className="btn-mini" onClick={regenerateCopy} disabled={recopying}>
              {recopying ? "Regenerating…" : "Regenerate copy"}
            </button>
          </div>
          {recopyError && <div style={{ fontSize: 11, color: "#f87171", marginBottom: 8 }}>{recopyError}</div>}
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

          {health?.issues && health.issues.length > 0 && (
            <div className="copy-block">
              <div className="cb-head">
                <span className="cb-label">Manifest health</span>
              </div>
              <div className="health-list">
                {health.issues.map((issue) => (
                  <div key={issue.code} className={`health-item health-item--${issue.type}`}>
                    <div className="health-header">{issue.type === "error" ? "✕" : "⚠"} {issue.message}</div>
                    <div className="health-fix">Fix: {issue.fix}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

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
                      {f.listingJustification && (
                        <div className="perm-flag-justification">
                          <span className="perm-flag-justification-label">Paste into listing:</span>
                          <span className="perm-flag-justification-text">&ldquo;{f.listingJustification}&rdquo;</span>
                          <button className="btn-mini" style={{ marginTop: 6 }} onClick={() => doCopy(f.listingJustification!, `just-${f.permission}`)}>
                            {copiedKey === `just-${f.permission}` ? "Copied!" : "Copy"}
                          </button>
                        </div>
                      )}
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
                    src={`${WORKER}/api/jobs/${job.id}/icon/${filename}?v=${renderKey}`}
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

      <div className="email-capture">
        {emailSent ? (
          <p className="email-sent">You&apos;re in. We&apos;ll let you know when paid tiers launch.</p>
        ) : (
          <form className="email-form" onSubmit={submitEmail}>
            <p className="email-label">Stay in the loop. Get notified when we launch.</p>
            <div className="email-row">
              <input
                type="email"
                className="email-input"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
              <button type="submit" className="btn btn-primary" style={{ flexShrink: 0 }}>Notify me</button>
            </div>
            {emailError && <p style={{ fontSize: 11, color: "#f87171", margin: "4px 0 0" }}>{emailError}</p>}
          </form>
        )}
      </div>

      <div className="cta-row" style={{ marginTop: 16, justifyContent: "flex-start" }}>
        <button className="btn btn-ghost" onClick={onReset}>Generate another</button>
      </div>
    </div>
  );
}
