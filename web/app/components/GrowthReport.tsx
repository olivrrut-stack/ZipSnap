"use client";

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

const PILLARS: Array<{ key: keyof GrowthReportData["pillars"]; label: string }> = [
  { key: "discoverability", label: "Discoverability & conversion" },
  { key: "acquisitionReadiness", label: "Acquisition readiness" },
  { key: "productIdeas", label: "Product ideas" },
  { key: "compliance", label: "Compliance & rejection risk" },
];

const TIER_LABEL: Record<string, string> = {
  "not-ready": "Not ready",
  early: "Early",
  emerging: "Emerging",
  attractive: "Attractive",
  "acquisition-ready": "Acquisition ready",
};

/** A 0-100 score colored by band (red/amber/green). */
function scoreColor(n: number): string {
  if (n >= 80) return "var(--accent-2, #34a853)";
  if (n >= 55) return "var(--yellow, #f5a623)";
  return "var(--red, #e5484d)";
}

function Pill({ priority }: { priority: string }) {
  const p = priority.toLowerCase();
  return <span className={`gr-priority gr-priority--${p}`}>{p}</span>;
}

export default function GrowthReport({ report }: { report: GrowthReportData }) {
  return (
    <div className="gr">
      <div className="gr-headline">
        <div className="gr-score" style={{ color: scoreColor(report.overallScore) }}>
          {report.overallScore}
          <span className="gr-score-max">/100</span>
        </div>
        <div className="gr-tier-wrap">
          <span className="gr-tier-badge">{TIER_LABEL[report.acquisitionTier] ?? report.acquisitionTier}</span>
          <p className="gr-tier-rationale">{report.tierRationale}</p>
        </div>
      </div>

      {PILLARS.map(({ key, label }) => {
        const p = report.pillars[key];
        return (
          <div className="gr-pillar" key={key}>
            <div className="gr-pillar-head">
              <span className="gr-pillar-label">{label}</span>
              <span className="gr-pillar-score" style={{ color: scoreColor(p.score) }}>{p.score}/100</span>
            </div>
            <p className="gr-pillar-summary">{p.summary}</p>
            <div className="gr-recs">
              {p.recommendations.map((r, i) => (
                <div className="gr-rec" key={i}>
                  <div className="gr-rec-head">
                    <Pill priority={r.priority} />
                    <span className="gr-rec-action">{r.action}</span>
                  </div>
                  <div className="gr-rec-rationale">{r.rationale}</div>
                </div>
              ))}
            </div>
          </div>
        );
      })}

      <div className="gr-pillar">
        <div className="gr-pillar-head">
          <span className="gr-pillar-label">New feature ideas</span>
        </div>
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
    </div>
  );
}
