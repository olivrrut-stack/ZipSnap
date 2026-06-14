import { describe, it, expect } from "vitest";
import { resolveContentTarget } from "./contentTarget";

describe("resolveContentTarget", () => {
  it("returns null when the manifest has no content scripts", () => {
    expect(resolveContentTarget({})).toBeNull();
    expect(resolveContentTarget({ content_scripts: [] })).toBeNull();
  });

  it("uses the demo page for <all_urls>", () => {
    const target = resolveContentTarget({
      content_scripts: [{ matches: ["<all_urls>"] }],
    });
    expect(target).toEqual({ kind: "demo" });
  });

  it("uses the demo page for a bare wildcard host", () => {
    const target = resolveContentTarget({
      content_scripts: [{ matches: ["*://*/*"] }],
    });
    expect(target).toEqual({ kind: "demo" });
  });

  it("visits a real site for a site-specific match pattern", () => {
    const target = resolveContentTarget({
      content_scripts: [{ matches: ["*://*.youtube.com/*"] }],
    });
    expect(target).toEqual({
      kind: "site",
      url: "https://www.youtube.com/results?search_query=technology",
      matchUsed: "*://*.youtube.com/*",
    });
  });

  it("keeps a bare host as-is when there's no wildcard subdomain", () => {
    const target = resolveContentTarget({
      content_scripts: [{ matches: ["https://example.com/*"] }],
    });
    expect(target).toEqual({
      kind: "site",
      url: "https://example.com/",
      matchUsed: "https://example.com/*",
    });
  });

  it("falls back to demo when no specific match yields a usable URL", () => {
    const target = resolveContentTarget({
      content_scripts: [{ matches: ["file:///*"] }],
    });
    expect(target).toEqual({ kind: "demo" });
  });

  it("collects matches across multiple content script entries", () => {
    const target = resolveContentTarget({
      content_scripts: [
        { matches: ["file:///*"] },
        { matches: ["*://*.youtube.com/*"] },
      ],
    });
    expect(target).toEqual({
      kind: "site",
      url: "https://www.youtube.com/results?search_query=technology",
      matchUsed: "*://*.youtube.com/*",
    });
  });
});
