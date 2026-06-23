"use client";

import { useRef, useState } from "react";
import TopNav from "./TopNav";
import Footer from "./Footer";
import GrowthReport, { type GrowthReportData } from "./GrowthReport";
import { readDrop, filterReal, zipFiles, type Picked } from "../lib/upload";
import { deriveName } from "../lib/utils";

const WORKER = process.env.NEXT_PUBLIC_WORKER_URL ?? "http://localhost:4000";

export default function Grader() {
  const [picked, setPicked] = useState<Picked | null>(null);
  const [preparing, setPreparing] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [users, setUsers] = useState("");
  const [rating, setRating] = useState("");
  const [revenue, setRevenue] = useState("");
  const [grading, setGrading] = useState(false);
  const [report, setReport] = useState<GrowthReportData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const zipInputRef = useRef<HTMLInputElement>(null);
  const dirInputRef = useRef<HTMLInputElement>(null);

  async function accept(opts: { zip?: File | null; entries?: { path: string; file: File }[] }) {
    if (opts.zip && /\.zip$/i.test(opts.zip.name)) {
      setPicked({ blob: opts.zip, name: opts.zip.name });
      return;
    }
    const real = filterReal(opts.entries ?? []);
    if (real.length === 0) return;
    setPreparing(true);
    try {
      setPicked({ blob: await zipFiles(real), name: deriveName(real) });
    } finally {
      setPreparing(false);
    }
  }

  async function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    const { zip, entries } = await readDrop(e);
    await accept({ zip, entries });
  }

  async function grade() {
    if (!picked) return;
    setGrading(true);
    setError(null);
    setReport(null);
    try {
      const form = new FormData();
      form.append("extension", picked.blob, picked.name);
      if (users.trim()) form.append("users", users.trim());
      if (rating.trim()) form.append("rating", rating.trim());
      if (revenue.trim()) form.append("revenue", revenue.trim());
      const res = await fetch(`${WORKER}/api/grade`, { method: "POST", body: form });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Grading failed.");
      const data = (await res.json()) as { report: GrowthReportData };
      setReport(data.report);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Grading failed.");
    } finally {
      setGrading(false);
    }
  }

  function reset() {
    setReport(null);
    setPicked(null);
    setUsers(""); setRating(""); setRevenue("");
    setError(null);
  }

  return (
    <main>
      <div className="wrap">
        <TopNav />
        <section className="hero">
          <span className="eyebrow"><span className="dot" />Grade your extension. Grow it. Sell it.</span>
          <h1 className="hero-title">
            How good is your extension? <span className="accent">Find out free.</span>
          </h1>
          <p className="subhead">
            Drop your extension and get an instant Growth &amp; Acquisition Report: a score plus specific
            steps to win more users and make it acquisition-ready. Add your numbers for a sharper grade.
          </p>

          {!report && (
            <>
              <div
                className={`dropzone ${dragging ? "drag" : ""} ${picked && !preparing ? "ready" : ""}`}
                onClick={() => zipInputRef.current?.click()}
                onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
                onDragLeave={() => setDragging(false)}
                onDrop={onDrop}
              >
                <div className="dz-icon">
                  {preparing ? <span className="spinner" /> : picked ? (
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>
                  ) : (
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 16V4M12 4l-5 5M12 4l5 5" /><path d="M4 16v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" /></svg>
                  )}
                </div>
                <div className="dz-title">{preparing ? "Preparing…" : picked ? picked.name : "Drag your extension here"}</div>
                <div className="dz-sub">
                  {picked && !preparing ? (
                    <>ready to grade · <span className="mono">{(picked.blob.size / 1024).toFixed(0)} KB</span></>
                  ) : (
                    <>drop a <span className="mono">.zip</span> or a folder, or click to browse, or{" "}
                      <button type="button" className="link-btn" onClick={(e) => { e.stopPropagation(); dirInputRef.current?.click(); }}>pick a folder</button>
                    </>
                  )}
                </div>
                <input ref={zipInputRef} type="file" accept=".zip" hidden tabIndex={-1} aria-hidden="true" onChange={(e) => accept({ zip: e.target.files?.[0] ?? null })} />
                <input ref={dirInputRef} type="file" multiple hidden tabIndex={-1} aria-hidden="true"
                  onChange={(e) => { const l = e.target.files; if (l) void accept({ entries: Array.from(l).map((f) => ({ path: (f as any).webkitRelativePath || f.name, file: f })) }); }}
                  {...({ webkitdirectory: "", directory: "" } as Record<string, string>)} />
              </div>

              {picked && (
                <div className="stats-row">
                  <p className="url-override-label">Optional: your numbers sharpen the acquisition score (kept private, used only for this grade).</p>
                  <div className="stats-inputs">
                    <input className="url-input" type="number" min="0" placeholder="Users (e.g. 5000)" value={users} onChange={(e) => setUsers(e.target.value)} />
                    <input className="url-input" type="number" min="0" max="5" step="0.1" placeholder="Rating (0-5)" value={rating} onChange={(e) => setRating(e.target.value)} />
                    <input className="url-input" type="number" min="0" placeholder="Monthly revenue ($)" value={revenue} onChange={(e) => setRevenue(e.target.value)} />
                  </div>
                </div>
              )}

              <div className="cta-row" style={{ marginTop: 24 }}>
                <button className="btn btn-primary" disabled={!picked || preparing || grading} onClick={grade}>
                  {grading ? "Grading…" : "Grade my extension →"}
                </button>
              </div>
              <p className="hint" style={{ marginTop: 28 }}>Free. No account. Your extension is graded in memory and never stored.</p>
              {error && <div className="error-box" style={{ marginTop: 16 }}>{error}</div>}
            </>
          )}

          {report && (
            <div className="panel">
              <div className="panel-head panel-head--kit">
                <div className="kit-ready-title">{picked?.name ?? "Your extension"} · graded</div>
                <button className="btn btn-ghost" onClick={reset}>Grade another</button>
              </div>
              <GrowthReport report={report} />
            </div>
          )}
        </section>
        <Footer />
      </div>
    </main>
  );
}
