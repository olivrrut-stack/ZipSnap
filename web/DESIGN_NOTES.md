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

## Backlog (not yet implemented)

### 3. Make the hero show, not tell. — [todo]
The subhead is a 5-line paragraph listing every feature — that's the feature list doing the
hero's job. Cut it to one sharp line and let a before→after visual carry the proof: a
puzzle-piece `.zip` on the left, the finished store tiles on the right. Pulling one frame of
the existing Gallery ticker up into the hero would land harder than the paragraph.

### 4. Emphasise step 2 (the live capture). — [todo]
The "01 / 02 / 03" steps are an honest sequence, so keep the numbering. But the three cards
are visually identical flat panels. Auto-capture is the headline feature (per CLAUDE.md), so
step 2 ("we capture it live") deserves a visual motif the other two don't get — e.g. a small
live-camera/recording cue.

### 6. Promote inline styles to classes. — [todo]
The Results panel and the URL-override input are built with large inline `style={{...}}`
blocks while the rest of the page uses CSS classes. That's why spacing/radii drift between
sections (`borderRadius: 8/10/999` all appear inline). Promoting them to classes would make
the results view feel like one system instead of hand-placed pieces.

### 7. Small copy wins. — [todo]
- Override label reads "Or override which page gets automatically photographed. Choose your
  own" — two sentences fighting. Try: "Prefer a specific page? Paste its URL."
- The subhead says "about 30 seconds" and the progress note says "about half a minute" — pick
  one phrasing and reuse it everywhere (vocabulary consistency).
