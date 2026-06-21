import { warn, info } from "./log";

/**
 * Generates an abstract, on-brand background image for the promo tiles using a
 * free image-generation service. This is decoration only (the promo tiles are
 * marketing art, not functional screenshots), so it's always best-effort: any
 * failure or timeout returns null and the renderer falls back to the plain
 * brand gradient.
 *
 * Provider is controlled by ZIPSNAP_TILE_BG:
 *   - unset / "pollinations" → use Pollinations (free, no API key)
 *   - "off"                  → skip entirely (always use the gradient)
 *
 * Pollinations needs no account or key, which is why it's the default. To swap
 * in a higher-quality provider later (e.g. Cloudflare Workers AI or Google
 * Gemini), add a branch here that returns a data URL the same way.
 */

const TIMEOUT_MS = 8_000;

/** Builds an abstract, text-free prompt that stays on-brand and tasteful. */
function buildPrompt(brandHex: string): string {
  return (
    `abstract soft gradient mesh background, smooth flowing blurred waves, ` +
    `dominant color ${brandHex}, minimal, elegant, premium, depth, ` +
    `no text, no logos, no objects, no people`
  );
}

async function fetchPollinations(brandHex: string): Promise<string | null> {
  const prompt = encodeURIComponent(buildPrompt(brandHex));
  // Square-ish source the renderer can cover-crop into either tile size.
  const seed = Math.abs(hashCode(brandHex)) % 100000;
  const url =
    `https://image.pollinations.ai/prompt/${prompt}` +
    `?width=1024&height=1024&nologo=true&seed=${seed}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) {
      warn(`Tile background: provider returned ${res.status}; using gradient.`);
      return null;
    }
    const type = res.headers.get("content-type") ?? "image/jpeg";
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length === 0) return null;
    info("Tile background generated.");
    return `data:${type};base64,${buf.toString("base64")}`;
  } catch (err) {
    warn(`Tile background generation failed (${(err as Error).message}); using gradient.`);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Stable per-color seed so the same brand color yields a consistent image. */
function hashCode(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return h;
}

/**
 * Returns a data URL for a promo-tile background image, or null to fall back to
 * the brand gradient. Never throws.
 */
export async function generateTileBackground(brandHex: string): Promise<string | null> {
  const provider = (process.env.ZIPSNAP_TILE_BG ?? "pollinations").toLowerCase();
  if (provider === "off" || provider === "none" || provider === "0") return null;
  // Only Pollinations is wired up today; unknown values fall through to it.
  return fetchPollinations(brandHex);
}
