import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import Gallery from "./Gallery";

describe("Gallery", () => {
  it("renders a captioned tile for each output type", () => {
    render(<Gallery />);
    expect(screen.getByText("Toolbar popup")).toBeInTheDocument();
    expect(screen.getByText("On-page UI")).toBeInTheDocument();
    expect(screen.getByText("Small promo · 440×280")).toBeInTheDocument();
    expect(screen.getByText("Marquee · 1400×560")).toBeInTheDocument();
  });

  it("shows the fake URL pill only on the on-page tile", () => {
    render(<Gallery />);
    expect(screen.getByText("thedailyreader.com/article")).toBeInTheDocument();
  });

  it("opens a lightbox with the clicked image and closes on backdrop click", () => {
    const { container } = render(<Gallery />);
    expect(container.querySelector(".lightbox")).not.toBeInTheDocument();

    const popup = screen.getByAltText("Generated popup screenshot");
    fireEvent.click(popup.closest(".frame-body")!);

    const lightbox = container.querySelector(".lightbox");
    expect(lightbox).toBeInTheDocument();
    expect(lightbox?.querySelector("img")).toHaveAttribute("src", "/samples/popup.png");

    fireEvent.click(lightbox!);
    expect(container.querySelector(".lightbox")).not.toBeInTheDocument();
  });

  it("closes the lightbox on Escape", () => {
    const { container } = render(<Gallery />);
    const popup = screen.getByAltText("Generated popup screenshot");
    fireEvent.click(popup.closest(".frame-body")!);
    expect(container.querySelector(".lightbox")).toBeInTheDocument();

    fireEvent.keyDown(window, { key: "Escape" });
    expect(container.querySelector(".lightbox")).not.toBeInTheDocument();
  });
});
