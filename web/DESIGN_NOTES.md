# ZipSnap design notes

Design-lead review of the landing page (`web/app/page.tsx` + `globals.css`).
Ordered by impact. Status tag on each.

## Diagnosis

The page lands on a templated "AI-default" look: near-black background + a single bright
accent. The accent is the Chrome 4-colour sweep (blue→green→yellow→red) — a strong signature
idea, but it was being used on ~7 elements at once (hero word, every section title, primary
button, progress bar, results header). When the signature is on everything, it stops reading
as a signature and becomes a theme. That dilution is the biggest thing holding the page back.

## Changes

### 1. Spend the Chrome gradient in one place, not seven. — [done]
Reserve the gradient for the hero accent word (the thesis) and the Download kit button (the
payoff). Section titles go solid `--text`, the primary button goes solid blue with the
gradient as a hover reward, the progress bar and "ready" header go solid. The eye needs an
anchor; four rainbow sections at once give it none.

### 2. Give it a real display typeface. — [done]
Headlines and body were both Geist. Added Space Grotesk as a display face for the top-tier
headings (hero title, section titles, legal h1). Body stays Geist; machine/developer data
(specs, file sizes, `.zip`, labels) stays Geist Mono. That mono-for-machine / sans-for-prose
split is the brand.

### 5. Tame the four-colour background glow. — [done]
The `body` background stacked four radial glows (blue/green/yellow/red) at the top of the
page. Reduced to two soft glows (blue + subtle green) so the concentrated gradient accents
read as deliberate against a calmer field.

### 3. Make the hero show, not tell. — [done]
Cut the 5-line feature-dump subhead to one sharp line ("Drop your extension. ZipSnap loads it
in a real browser, shoots its actual screens, and writes your whole store listing. About 30
seconds."). Added a before→after `.flow` strip under it: a blue-tinted `your .zip` chip → the
kit it becomes (screenshots, promo tiles, store listing, icons). The exhaustive feature list
lives in the "What you get" section, so the hero no longer duplicates it.

### 4. Emphasise step 2 (the live capture). — [done]
Kept the 1/2/3 numbering (real sequence). Gave step 2 a `.step--live` treatment: a red-tinted
card plus a pulsing "● live" badge, so the headline auto-capture feature stands out from the
two flat siblings. Pulse respects `prefers-reduced-motion`.

### 6. Promote inline styles to classes. — [done]
Moved the structural Results inline styles onto named classes: `.panel-head--kit`,
`.kit-ready-title`, `.kit-download`, `.copy-section-head/-label`, `.cb-error` (shared by the
recopy + email errors), plus the earlier `.url-*` / `.dropzone.ready` classes. Remaining
inline styles in Results are genuinely dynamic (charcount colour by length, icon size by px)
and stay inline on purpose.

### 7. Small copy wins. — [done]
- Override label rewritten to "By default ZipSnap picks the page to shoot. Prefer a specific
  one? Paste its URL (optional)." with an example placeholder.
- Unified the timing copy: the progress note now says "about 30 seconds" to match the subhead
  and FAQ (was "about half a minute").
