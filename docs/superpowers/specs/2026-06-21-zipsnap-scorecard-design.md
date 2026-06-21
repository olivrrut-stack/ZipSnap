# ZipSnap Quality Scorecard — Design

Date: 2026-06-21
Status: approved (build in progress)

## Purpose

A reusable command, `npm run score` (in `worker/`), that measures ZipSnap
against a fixed finish line and prints a PASS/FAIL scorecard with an overall
readiness percentage. It is the objective finish line made real: run it anytime,
see exactly what is failing and by how much, fix, re-run until green. A future
autonomous agent loop sits on top by calling this and dispatching fixers.

## Where it lives

`worker/src/scorecard/`, exposed as `npm run score`. The asset/output checks must
run the real pipeline, and `worker/` already has Playwright and the Anthropic SDK,
so the scorecard imports `pipeline.ts` directly. Only Lighthouse is a new dep.

## Tiers and measurement

1. **Assets / output (deterministic).** Default: inspect the most recent kit in
   `worker/output`. With `--full`: run a real pipeline job on the bundled fixture
   extension, time it (target < 45s), then inspect the fresh result. Checks: every
   PNG's exact dimensions from its header (icon 128/48/32/16, screenshots 1280x800,
   promo 440x280, marquee 1400x560), all promised files present and named right,
   and `copy.json` has title, short/long description, 7 keywords, permissions
   report, privacy policy. (`copy.json` and icons need the `--full` run or a prior
   server-generated job.)
2. **Web vitals (Lighthouse).** Build + serve the production web app, run Lighthouse
   mobile + 3G-throttled. Map audits to targets: LCP < 2.5s, CLS < 0.1, TBT (the
   synthetic stand-in for INP) < 200ms, performance score, accessibility >= 90,
   plus `tap-targets` (48px), `font-size`, `content-width` (no horizontal scroll).
   Requires a production build for meaningful numbers.
3. **Structural + keyboard.** Playwright loads the served site: exactly one primary
   CTA, visible drop zone, privacy statement present, footer with contact/about,
   hero above the fold; zero console errors; and a real keyboard test that tabs to
   the drop zone and CTA with a visible focus ring.
4. **AI judge (subjective).** Screenshot homepage desktop + mobile, Claude vision
   scores visual hierarchy, first impression, design consistency, trust signals,
   onboarding clarity 0-100. The judge is forced to list concrete flaws BEFORE
   scoring, against a strict rubric with explicit deductions, model + temperature
   pinned, conservative pass bar. Needs `ANTHROPIC_API_KEY`; skips without it.
5. **Code quality.** `typecheck` + `test` + `build` pass for both projects.

## Manual checklist (printed, not auto-scored)

Micro-interactions (hover, loading, drag preview) and full keyboard operability
cannot be honestly judged from a static screenshot, so they are printed as a
manual checklist routed to `/design-review`, not given a fake score.

## Output

Console table + `worker/scorecard-report/latest.json` + `latest.md`. Each row:
criterion, measured value, threshold, PASS/FAIL/SKIP, fix hint. Overall readiness
%. Every run appends a summary line to `scorecard-report/history.jsonl` so the
trend is visible. Non-zero exit code if any objective criterion fails (for CI / a
future loop).

## Units

`criteria.ts` (finish line as data + types, single source of truth),
`measure/assets.ts`, `measure/lighthouse.ts`, `measure/structural.ts`,
`measure/aiJudge.ts`, `measure/code.ts`, `webserver.ts` (build + serve helper),
`report.ts`, `score.ts` (entrypoint, flag parsing, per-tier graceful degradation).
Vitest tests cover dimension parsing, threshold comparisons, and report assembly.

## Honesty caveats

- Tier 1 `--full` and Tier 4 need Chromium and `ANTHROPIC_API_KEY`; without the key
  those tiers skip with a clear message.
- Processing time measured locally is a proxy for the Railway production server.

## Scope cuts (not in v1)

No autonomous multi-agent loop; INP approximated by TBT; micro-interactions manual;
"no unnecessary dependencies" reduced to build/typecheck/test passing.
