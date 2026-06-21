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

  it("lands public-content sites on a rich page, never a login form", () => {
    // Regression: GitHub repo highlighters were being shot on github.com/login,
    // forcing an unnecessary sign-in and making the hero a third-party login
    // page instead of the extension. Public content should never route to login.
    const github = resolveContentTarget({
      content_scripts: [{ matches: ["https://github.com/*"] }],
    });
    expect(github).toEqual({
      kind: "site",
      url: "https://github.com/explore",
      matchUsed: "https://github.com/*",
    });

    const reddit = resolveContentTarget({
      content_scripts: [{ matches: ["https://www.reddit.com/*"] }],
    });
    expect(reddit).toEqual({
      kind: "site",
      url: "https://www.reddit.com/r/popular",
      matchUsed: "https://www.reddit.com/*",
    });
  });

  it("aims login-gated sites at their post-login content page", () => {
    // LinkedIn gates everything; we target the feed (the site bounces us to its
    // login on the way, which the login detector catches), so after sign-in the
    // screenshot is the real feed, not a login form.
    const linkedin = resolveContentTarget({
      content_scripts: [{ matches: ["https://www.linkedin.com/*"] }],
    });
    expect(linkedin).toEqual({
      kind: "site",
      url: "https://www.linkedin.com/feed",
      matchUsed: "https://www.linkedin.com/*",
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
