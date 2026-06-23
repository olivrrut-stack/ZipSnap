"use client";

import { useEffect, useState } from "react";

/** Mirrors the worker's GrowthReport shape (worker/src/growthReport.ts). */
export interface Recommendation {
  priority: string;
  action: string;
  rationale: string;
}
export interface PillarReport {
  score: number;
  summary: string;
  recommendations: Recommendation[];
}
export interface GrowthReportData {
  overallScore: number;
  acquisitionTier: string;
  tierRationale: string;
  pillars: {
    discoverability: PillarReport;
    acquisitionReadiness: PillarReport;
    productIdeas: PillarReport;
    compliance: PillarReport;
  };
  featureIdeas: Array<{ title: string; description: string; rationale: string }>;
}

const PILLARS: Array<{ key: keyof GrowthReportData["pillars"]; label: string; short: string }> = [
  { key: "discoverability", label: "Discoverability & conversion", short: "Discoverability" },
  { key: "acquisitionReadiness", label: "Acquisition readiness", short: "Acquisition" },
  { key: "productIdeas", label: "Product ideas", short: "Product" },
  { key: "compliance", label: "Compliance & rejection risk", short: "Compliance" },
];

const TIER_LABEL: Record<string, string> = {
  "not-ready": "Not ready",
  early: "Early",
  emerging: "Emerging",
  attractive: "Attractive",
  "acquisition-ready": "Acquisition ready",
};

// Score-band thresholds, labeled like the tiers, used for the "points to next" bar.
const BANDS = [
  { min: 0, label: "Not ready" },
  { min: 20, label: "Early" },
  { min: 40, label: "Emerging" },
  { min: 60, label: "Attractive" },
  { min: 80, label: "Acquisition ready" },
];

/** One consistent red/amber/green band, used for every score in the report. */
function scoreColor(n: number): string {
  if (n >= 80) return "var(--green)";
  if (n >= 50) return "var(--yellow)";
  return "var(--red)";
}

/** A circular progress ring with the score centered. Fills on mount. */
function ScoreRing({ score, size, stroke, big }: { score: number; size: number; stroke: number; big?: boolean }) {
  const clamped = Math.max(0, Math.min(100, score));
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const target = circ * (1 - clamped / 100);
  const [offset, setOffset] = useState(circ);
  useEffect(() => {
    setOffset(target);
  }, [target]);
  const color = scoreColor(clamped);
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={`Score ${Math.round(clamped)} of 100`}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--line)" strokeWidth={stroke} />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke={color}
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={circ}
        strokeDashoffset={offset}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
        style={{ transition: "stroke-dashoffset 1.1s cubic-bezier(.2,.7,.2,1)" }}
      />
      <text x="50%" y="50%" textAnchor="middle" dominantBaseline="central" fill={color} className={big ? "ring-num ring-num--big" : "ring-num"}>
        {Math.round(clamped)}
      </text>
    </svg>
  );
}

export default function GrowthReport({ report }: { report: GrowthReportData }) {
  const score = report.overallScore;
  const next = BANDS.find((b) => b.min > score);
  const pointsToNext = next ? next.min - score : 0;

  return (
    <div className="gr">
      {/* Hero: overall ring + tier + progress to next */}
      <div className="gr-hero">
        <div className="gr-hero-ring">
          <ScoreRing score={score} size={168} stroke={13} big />
        </div>
        <div className="gr-hero-meta">
          <span className="gr-tier-badge">{TIER_LABEL[report.acquisitionTier] ?? report.acquisitionTier}</span>
          <p className="gr-tier-rationale">{report.tierRationale}</p>
          <div className="gr-next">
            <div className="gr-next-label">
              {next ? (
                <>
                  <strong>{pointsToNext}</strong> points to <span style={{ color: "var(--text)" }}>{next.label}</span>
                </>
              ) : (
                <span style={{ color: "var(--green)" }}>Top tier reached</span>
              )}
            </div>
            <div className="gr-next-bar">
              <div className="gr-next-fill" style={{ width: `${Math.max(0, Math.min(100, score))}%`, background: scoreColor(score) }} />
              {[20, 40, 60, 80].map((t) => (
                <span key={t} className="gr-next-tick" style={{ left: `${t}%` }} />
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Four pillars at a glance — mini rings echo the hero */}
      <div className="gr-pillars-row">
        {PILLARS.map(({ key, short }) => (
          <div className="gr-mini" key={key}>
            <ScoreRing score={report.pillars[key].score} size={72} stroke={7} />
            <span className="gr-mini-label">{short}</span>
          </div>
        ))}
      </div>

      {/* Per-pillar detail with severity-coded fix cards */}
      {PILLARS.map(({ key, label }) => {
        const p = report.pillars[key];
        const high = p.recommendations.filter((r) => r.priority.toLowerCase() === "high").length;
        return (
          <div className="gr-pillar" key={key}>
            <div className="gr-pillar-head">
              <span className="gr-pillar-label">{label}</span>
              <span className="gr-pillar-meta">
                {high > 0 && <span className="gr-pillar-count gr-pillar-count--high">{high} priority</span>}
                <span className="gr-pillar-score" style={{ color: scoreColor(p.score) }}>{p.score}/100</span>
              </span>
            </div>
            <p className="gr-pillar-summary">{p.summary}</p>
            <div className="gr-recs">
              {p.recommendations.map((r, i) => {
                const pr = r.priority.toLowerCase();
                return (
                  <div className={`gr-rec gr-rec--${pr}`} key={i}>
                    <div className="gr-rec-head">
                      <span className={`gr-priority gr-priority--${pr}`}>{pr}</span>
                      <span className="gr-rec-action">{r.action}</span>
                    </div>
                    <div className="gr-rec-rationale">{r.rationale}</div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}

      {/* Feature ideas — framed as upside, visually distinct from fixes */}
      <div className="gr-deck-head">Opportunities to grow</div>
      <div className="gr-ideas">
        {report.featureIdeas.map((f, i) => (
          <div className="gr-idea" key={i}>
            <div className="gr-idea-title">{f.title}</div>
            <div className="gr-idea-desc">{f.description}</div>
            <div className="gr-idea-rationale">{f.rationale}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
