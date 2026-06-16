import { describe, it, expect } from "vitest";
import path from "node:path";
import { readManifest, extractMeta, detectSurfaces } from "./manifest";

const FIXTURE = path.resolve(__dirname, "..", "fixtures", "sample-extension");

describe("readManifest", () => {
  it("reads and parses the sample extension's manifest.json", async () => {
    const manifest = await readManifest(FIXTURE);
    expect(manifest.name).toBe("FocusDash");
    expect(manifest.manifest_version).toBe(3);
  });

  it("throws a helpful error when manifest.json is missing", async () => {
    await expect(readManifest(path.resolve(__dirname, "..", "fixtures"))).rejects.toThrow(
      /No manifest\.json found/,
    );
  });
});

describe("extractMeta", () => {
  it("pulls name, version, description, and combined permissions", () => {
    const meta = extractMeta({
      name: "Example",
      version: "2.0",
      description: "Does things.",
      manifest_version: 3,
      permissions: ["storage"],
      host_permissions: ["*://*.example.com/*"],
    });
    expect(meta).toEqual({
      name: "Example",
      version: "2.0",
      description: "Does things.",
      manifestVersion: 3,
      permissions: ["storage", "*://*.example.com/*"],
    });
  });

  it("falls back to sensible defaults for a minimal manifest", () => {
    const meta = extractMeta({});
    expect(meta.name).toBe("(unnamed)");
    expect(meta.version).toBe("?");
    expect(meta.description).toBe("");
    expect(meta.manifestVersion).toBe(0);
    expect(meta.permissions).toEqual([]);
  });
});

describe("detectSurfaces", () => {
  it("detects popup, options page, content scripts, and icon for the sample extension", async () => {
    const manifest = await readManifest(FIXTURE);
    const surfaces = detectSurfaces(manifest, FIXTURE);
    expect(surfaces.popup).toBe("popup.html");
    expect(surfaces.optionsPage).toBe("options.html");
    expect(surfaces.hasContentScripts).toBe(true);
    expect(surfaces.iconPath).toBe(path.join(FIXTURE, "icon128.png"));
  });

  it("reads the options page from options_ui.page when options_page is absent", () => {
    const surfaces = detectSurfaces({ options_ui: { page: "settings.html" } }, "/ext");
    expect(surfaces.optionsPage).toBe("settings.html");
  });

  it("reports no surfaces for a bare manifest", () => {
    const surfaces = detectSurfaces({}, "/ext");
    expect(surfaces.popup).toBeNull();
    expect(surfaces.optionsPage).toBeNull();
    expect(surfaces.hasContentScripts).toBe(false);
    expect(surfaces.iconPath).toBeNull();
  });

  it("reads the icon from action.default_icon when icons is absent", () => {
    const surfaces = detectSurfaces({ action: { default_icon: { "128": "action-icon.png" } } }, "/ext");
    expect(surfaces.iconPath).toBe(path.join("/ext", "action-icon.png"));
  });
});
