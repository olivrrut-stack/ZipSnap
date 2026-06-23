import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import GrowthReport, { type GrowthReportData } from "./GrowthReport";

const pillar = (score: number) => ({
  score,
  summary: `Summary at ${score}.`,
  recommendations: [
    { priority: "high", action: "Tighten the listing keywords", rationale: "Because discoverability" },
    { priority: "medium", action: "Add an options page", rationale: "Retention surface" },
  ],
});

const report: GrowthReportData = {
  overallScore: 64,
  acquisitionTier: "emerging",
  tierRationale: "Solid product, no traction numbers provided.",
  pillars: {
    discoverability: pillar(58),
    acquisitionReadiness: pillar(50),
    productIdeas: pillar(70),
    compliance: pillar(80),
  },
  featureIdeas: [
    { title: "Sync settings", description: "Across devices", rationale: "Uses storage" },
    { title: "Keyboard shortcuts", description: "Power users", rationale: "Popup exists" },
    { title: "Export data", description: "CSV export", rationale: "Trust" },
  ],
};

describe("GrowthReport", () => {
  it("renders the overall score and acquisition tier", () => {
    render(<GrowthReport report={report} />);
    expect(screen.getByText("64")).toBeInTheDocument();
    expect(screen.getByText("Emerging")).toBeInTheDocument();
    expect(screen.getByText("Solid product, no traction numbers provided.")).toBeInTheDocument();
  });

  it("renders all four pillar headings", () => {
    render(<GrowthReport report={report} />);
    expect(screen.getByText("Discoverability & conversion")).toBeInTheDocument();
    expect(screen.getByText("Acquisition readiness")).toBeInTheDocument();
    expect(screen.getByText("Product ideas")).toBeInTheDocument();
    expect(screen.getByText("Compliance & rejection risk")).toBeInTheDocument();
  });

  it("renders recommendation actions and feature ideas", () => {
    render(<GrowthReport report={report} />);
    expect(screen.getAllByText("Tighten the listing keywords").length).toBeGreaterThan(0);
    expect(screen.getByText("Sync settings")).toBeInTheDocument();
  });
});
