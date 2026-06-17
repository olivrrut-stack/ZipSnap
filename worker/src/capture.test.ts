import { describe, it, expect } from "vitest";
import { looksLikeLoginPage } from "./capture";

describe("looksLikeLoginPage", () => {
  it("returns true when the page has a password field regardless of URL", () => {
    expect(looksLikeLoginPage("https://example.com/home", true)).toBe(true);
  });

  it("returns true for /login in URL", () => {
    expect(looksLikeLoginPage("https://twitter.com/login", false)).toBe(true);
  });

  it("returns true for /signin in URL", () => {
    expect(looksLikeLoginPage("https://accounts.google.com/signin/v2", false)).toBe(true);
  });

  it("returns true for /sign-in in URL", () => {
    expect(looksLikeLoginPage("https://example.com/sign-in", false)).toBe(true);
  });

  it("returns true for /auth in URL", () => {
    expect(looksLikeLoginPage("https://example.com/auth/session", false)).toBe(true);
  });

  it("returns true for /account/login in URL", () => {
    expect(looksLikeLoginPage("https://example.com/account/login", false)).toBe(true);
  });

  it("returns false for normal content pages without a password field", () => {
    expect(looksLikeLoginPage("https://youtube.com/results?search_query=tech", false)).toBe(false);
    expect(looksLikeLoginPage("https://twitter.com/home", false)).toBe(false);
    expect(looksLikeLoginPage("https://linkedin.com/feed", false)).toBe(false);
  });
});
