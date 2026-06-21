/**
 * Subjective tier: an AI vision judge scores the homepage on aesthetics it can
 * actually see. It is forced to list concrete flaws BEFORE scoring, against a
 * strict rubric, with the model and temperature pinned, so it pushes back
 * instead of rubber-stamping. Skips without an API key.
 */
import { chromium } from "playwright";
import { checkMin, skip, THRESHOLDS, type CriterionResult } from "../criteria";

const CRITERIA: ReadonlyArray<readonly [string, string, string]> = [
  ["judge.hierarchy", "visual hierarchy & clarity", "visualHierarchy"],
  ["judge.firstImpression", "first-impression polish", "firstImpression"],
  ["judge.consistency", "visual design consistency", "designConsistency"],
  ["judge.trust", "trust signals (looks legit)", "trustSignals"],
  ["judge.onboarding", "onboarding clarity (gets it in 5s)", "onboardingClarity"],
];

const SYSTEM = `You are a ruthless senior product designer reviewing a startup landing page.
You are NOT here to be nice. Most pages deserve 60-75. Reserve 85+ only for genuinely
excellent, ship-to-Product-Hunt work. List concrete, specific flaws BEFORE you score.
A high score with no flaws listed is invalid. Judge what you can actually see in the
screenshots: layout, hierarchy, spacing, type, color, clarity, and whether a first-time
visitor instantly understands what to do.`;

const RUBRIC = `Score each 0-100 (10 = broken, 50 = mediocre, 75 = solid, 90 = excellent):
- visualHierarchy: is the eye guided to the one thing that matters?
- firstImpression: does it look polished and trustworthy at a glance?
- designConsistency: cohesive color, type, spacing, no mismatches?
- trustSignals: does it feel legitimate and safe to use?
- onboardingClarity: would a first-timer know exactly what to do within 5 seconds?
Respond with ONLY JSON, no prose:
{"flaws":["...","..."],"scores":{"visualHierarchy":n,"firstImpression":n,"designConsistency":n,"trustSignals":n,"onboardingClarity":n}}`;

export async function measureAiJudge(url: string): Promise<CriterionResult[]> {
  if (!process.env.ANTHROPIC_API_KEY) {
    return CRITERIA.map(([id, label]) => skip(id, label, "ai-judge", "ANTHROPIC_API_KEY not set; AI design judge skipped."));
  }
  const browser = await chromium.launch();
  try {
    const ctx = await browser.newContext();
    const d = await ctx.newPage();
    await d.setViewportSize({ width: 1280, height: 800 });
    await d.goto(url, { waitUntil: "networkidle", timeout: 30_000 });
    const desktop = (await d.screenshot()).toString("base64");

    const m = await ctx.newPage();
    await m.setViewportSize({ width: 390, height: 844 });
    await m.goto(url, { waitUntil: "networkidle", timeout: 30_000 });
    const mobile = (await m.screenshot()).toString("base64");

    const Anthropic = ((await import("@anthropic-ai/sdk")) as any).default;
    const client = new Anthropic();
    const res = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 1500,
      temperature: 0,
      system: SYSTEM,
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: "Desktop homepage:" },
            { type: "image", source: { type: "base64", media_type: "image/png", data: desktop } },
            { type: "text", text: "Mobile homepage:" },
            { type: "image", source: { type: "base64", media_type: "image/png", data: mobile } },
            { type: "text", text: RUBRIC },
          ],
        },
      ],
    });

    const text: string = res.content.find((c: any) => c.type === "text")?.text ?? "";
    const json = JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1));
    const scores = json.scores ?? {};
    const flaws = Array.isArray(json.flaws) ? json.flaws.slice(0, 3).join("; ") : "";

    return CRITERIA.map(([id, label, key]) => {
      const v = Number(scores[key]);
      if (Number.isNaN(v)) return skip(id, label, "ai-judge", "judge returned no score for this item");
      return checkMin(id, label, "ai-judge", v, THRESHOLDS.aiJudgeMin, (n) => `${n}/100`, `Judge flaws: ${flaws || "(none given)"}`);
    });
  } catch (err) {
    return CRITERIA.map(([id, label]) => skip(id, label, "ai-judge", `AI judge failed: ${(err as Error).message}`));
  } finally {
    await browser.close();
  }
}
