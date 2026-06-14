import { describe, it, expect } from "vitest";
import { sizeOf, deriveName } from "./utils";

describe("sizeOf", () => {
  it("labels screenshot files as 1280 x 800", () => {
    expect(sizeOf("screenshot-1.png")).toBe("1280 × 800");
  });

  it("labels small promo tiles as 440 x 280", () => {
    expect(sizeOf("small-promo-440x280.png")).toBe("440 × 280");
  });

  it("labels marquee tiles as 1400 x 560", () => {
    expect(sizeOf("marquee-1400x560.png")).toBe("1400 × 560");
  });

  it("returns an empty string for unrecognized names", () => {
    expect(sizeOf("descriptions.txt")).toBe("");
  });
});

describe("deriveName", () => {
  const entry = (path: string) => ({ path, file: new File(["x"], path.split("/").pop()!) });

  it("uses the dropped folder's name when every file is nested under it", () => {
    const files = [entry("my-extension/manifest.json"), entry("my-extension/popup.html")];
    expect(deriveName(files)).toBe("my-extension.zip");
  });

  it("falls back to 'extension.zip' when files aren't all nested under one folder", () => {
    const files = [entry("manifest.json"), entry("popup.html")];
    expect(deriveName(files)).toBe("extension.zip");
  });

  it("falls back to 'extension.zip' for an empty list", () => {
    expect(deriveName([])).toBe("extension.zip");
  });
});
