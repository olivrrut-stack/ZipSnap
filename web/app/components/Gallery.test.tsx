import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import Gallery from "./Gallery";

describe("Gallery", () => {
  it("renders a captioned tile for each output type", () => {
    render(<Gallery />);
    expect(screen.getAllByText("Screenshot · 1280×800").length).toBeGreaterThan(0);
    expect(screen.getAllByText("On-page · 1280×800").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Small promo · 440×280").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Marquee · 1400×560").length).toBeGreaterThan(0);
  });

  it("renders the correct images", () => {
    render(<Gallery />);
    const imgs = screen.getAllByRole("img");
    const srcs = imgs.map((img) => img.getAttribute("src"));
    expect(srcs).toContain("/samples/screenshot-1.png");
    expect(srcs).toContain("/samples/screenshot-3.png");
    expect(srcs).toContain("/samples/small-promo-440x280.png");
    expect(srcs).toContain("/samples/marquee-1400x560.png");
  });

  it("renders the ticker track with doubled tiles for seamless loop", () => {
    const { container } = render(<Gallery />);
    const items = container.querySelectorAll(".ticker-item");
    expect(items.length).toBe(18); // 9 tiles × 2 for infinite scroll
  });

  it("marks the duplicate set aria-hidden", () => {
    const { container } = render(<Gallery />);
    const hidden = container.querySelectorAll('[aria-hidden="true"]');
    expect(hidden.length).toBe(9);
  });

  it("applies silver class to all tiles", () => {
    const { container } = render(<Gallery />);
    const silver = container.querySelectorAll(".ticker-card.silver");
    expect(silver.length).toBe(18); // 9 tiles × 2 duplicates
  });
});
