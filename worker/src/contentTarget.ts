/**
 * Works out WHERE to photograph an extension's on-page UI.
 *
 * Content scripts declare `matches` patterns saying which sites they run on.
 * - If a script runs on essentially every site (`<all_urls>` or a `*` host),
 *   our safe self-made demo page will trigger it — so we use that.
 * - If a script only runs on specific sites (e.g. `*://*.youtube.com/*`), the
 *   demo page shows nothing, so we must visit one of those real sites. That's
 *   legitimate: it's the extension working where it's designed to.
 */

export type ContentTarget =
  | { kind: "demo" } // use our local demo page
  | { kind: "site"; url: string; matchUsed: string }; // visit a real target site

/** Gathers every `matches` entry across all content scripts. */
function collectMatches(manifest: any): string[] {
  const scripts = Array.isArray(manifest?.content_scripts) ? manifest.content_scripts : [];
  const all: string[] = [];
  for (const s of scripts) {
    if (Array.isArray(s?.matches)) all.push(...s.matches);
  }
  return all;
}

/** True for patterns that match basically everything — the demo page covers these. */
function isBroad(pattern: string): boolean {
  if (pattern === "<all_urls>") return true;
  const host = hostOf(pattern);
  return host === "*" || host === "*.*";
}

/** Pulls the host portion out of a match pattern, or "" if it can't. */
function hostOf(pattern: string): string {
  const m = pattern.match(/^[^:]+:\/\/([^/]+)/);
  return m ? m[1] : "";
}

/**
 * For well-known sites, the bare homepage is often empty (e.g. logged-out
 * YouTube), giving the extension nothing to act on. These hints point us at a
 * content-rich page where the extension's on-page UI is most likely to appear,
 * so the screenshot shows the extension doing its job in a believable setting.
 *
 * Two kinds of site:
 * - Public-content sites (GitHub, Reddit, YouTube): land on a real, public page
 *   full of the things the extension acts on. No sign-in is needed, so the shot
 *   is the extension working on real content, not a login form.
 * - Login-gated sites (LinkedIn, Instagram, X, Claude): every useful page sits
 *   behind an account. We point at the content page the user would land on after
 *   signing in; the site redirects us to its login screen on the way, which the
 *   login detector (detectAuthSignals) catches so we can pause for sign-in. After
 *   login the browser is already on that content page, ready to photograph.
 */
const LANDING_HINTS: Record<string, string> = {
  // Public content — rich public pages, no sign-in required.
  "www.youtube.com": "results?search_query=technology",
  "youtube.com": "results?search_query=technology",
  "github.com": "explore",
  "www.github.com": "explore",
  "reddit.com": "r/popular",
  "www.reddit.com": "r/popular",
  // Login-gated — aim at the post-login content page; the site bounces us to its
  // own login first, which the detector picks up.
  "x.com": "home",
  "twitter.com": "home",
  "www.twitter.com": "home",
  "linkedin.com": "feed",
  "www.linkedin.com": "feed",
  "instagram.com": "",
  "www.instagram.com": "",
  "claude.ai": "new",
  "www.claude.ai": "new",
};

/** Turns a specific match pattern into a concrete, visitable URL. */
function patternToUrl(pattern: string): string | null {
  const schemeMatch = pattern.match(/^([^:]+):\/\//);
  if (!schemeMatch) return null;
  const scheme = schemeMatch[1] === "*" ? "https" : schemeMatch[1];
  if (scheme !== "http" && scheme !== "https") return null;

  let host = hostOf(pattern);
  if (!host) return null;
  // "*.youtube.com" -> "www.youtube.com"; a bare host stays as-is.
  if (host.startsWith("*.")) host = "www." + host.slice(2);
  // Any remaining wildcard in the host means we can't form a real address.
  if (host.includes("*")) return null;

  const hint = LANDING_HINTS[host] ?? "";
  return `${scheme}://${host}/${hint}`;
}

/** Decides where to capture the content overlay. */
export function resolveContentTarget(manifest: any): ContentTarget | null {
  const matches = collectMatches(manifest);
  if (matches.length === 0) return null; // no content scripts at all

  // If anything matches broadly, the safe demo page is enough.
  if (matches.some(isBroad)) return { kind: "demo" };

  // Otherwise visit the first specific site we can turn into a real URL.
  for (const pattern of matches) {
    const url = patternToUrl(pattern);
    if (url) return { kind: "site", url, matchUsed: pattern };
  }

  // Specific matches existed but none was usable (e.g. file://) — fall back.
  return { kind: "demo" };
}
