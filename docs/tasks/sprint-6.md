# InkFight Sprint 6: every idea still open

For a coding agent (Claude Code cloud session on Sonnet, high effort, or agy). The Ground rules, the Gate and
the hand-off checklist in `docs/tasks/next-sprints.md` apply unchanged: a branch per part, docs in
`docs/changes/sprint-6-<part>.md` with the gate output pasted, never push to `main`, never deploy.

Sprints 2-5 are merged into `main`. The main session is working on online play (Supabase Realtime fallback in
`src/game/useGameRoom.ts`, `src/game/relay.ts`, `src/app/api/rooms/**`): stay out of those files. Branch each part
from the latest `main`. Parts 6a-6d can start now, in that order; 6e and 6f wait for the owner's designs.

## 6a. Sound (branch `sprint-6-sound`)

- Procedural Web Audio, no asset files: `src/game/sound.ts` with small synth recipes (noise bursts and
  pitched blips) for: jab/cross/kick hits (pitch by damage), blocked hit, whiff, special start, ultimate
  start, clash, KO, round start, skill, UI tap. Played from `Renderer.effect()` events (render.ts reads
  them already) and the controls.
- A sound on/off switch in the header and the fight settings (localStorage, default on; it's separate from
  "Reduce flashes"). Start the AudioContext on the first user gesture (browsers block autoplay).
- Phones: keep it light (one AudioContext, reuse nodes, cap simultaneous voices).

## 6b. Shareable result card (branch `sprint-6-share`)

- `src/app/share/[id]/opengraph-image.tsx` (or a route returning `ImageResponse`) that draws a 1080 × 1080
  card: both fighters' avatars (use their cut-out images), names, score, "Fought on InkFight", the link.
- Online results already go to `Battle` (`/api/battles`): add a `/battle/[id]` page that shows the result
  and uses the card as its OG image. CPU fights aren't stored: share those with the card built from query
  params (fighter ids + score), validated.
- "Share result" button on the result overlay (Web Share API with a copy-link fallback).

## 6c. Admin and small follow-ups (branch `sprint-6-followups`)

- `/admin` shows each design's ultimate (Sprint 3 left it out) and side skill.
- Admin "Re-cut" also re-cuts cut-outs stored white before Sprint 4, once (mark done rows, e.g. by the new
  file name, so it doesn't loop).
- The S + L ultimate press is lost during hit-stun while the side skill press is queued; queue it the same
  way (`skillQ` in sim.ts). (This one touches sim.ts: keep the change to that one spot, add an assert to
  `scripts/check-sim.ts`, run the balance gate, and say so in the docs.)
- The phone SKILL touch button and the new ULT gesture were never tried on a real phone: test with Chrome
  DevTools device mode + touch emulation (the repo has no harness; describe what you did).

## 6d. Scans that look like the player drew them (branch `sprint-6-scan`)

Players see messy heads and odd arms on scanned fighters, while built ones look clean.
- Ask the vision model for a `head_box` (centre + radius of the drawn head only) and an `item_box`
  (bounding box of the held item, or null) in `src/lib/vision.ts` (zod schema + prompt), store them with
  the pose (`Character.pose` JSON, no migration needed), and use them in `src/game/sprite.ts`: `cutHead`
  crops exactly the head box; the prop is cut from the item box when present (still requiring it to touch
  the hand).
- Clean the head crop: drop ink specks smaller than a few pixels and thin shading strokes inside it, so a
  scribbled face still reads as a face. Keep the player's own lines: this is cleanup, not redrawing.
- Offline (no AI key) must keep working exactly as now.
- Test with the photos in `./uploads` (local only) and the synthetic figures in `scripts/check-stats.ts`
  (add a scribbled-head case).

## 6e. Mobile polish from the redesign (branch `sprint-6-mobile`, when the owner brings the designs)

The owner is producing new screen designs from `docs/design/prompts.md`. Implement them screen by screen:
bottom tab bar on phones, sticky bottom actions, the builder with a pinned preview and tabs, a thinner fight
HUD, solid touch buttons, the redesigned lobby with share and QR, the result overlay. Keep every behaviour
and every test passing; it's a visual change.

## 6f. Arena art (branch `sprint-6-arena`, when the owner brings the art)

Layers from the arena prompt in `docs/design/prompts.md` land in `public/arena/`. Use them in
`src/game/render.ts` (`paperPage()` and the doodle layer) with parallax on the mid layer, the floor variant
per dungeon floor, and the hit/dust/KO sprite sheets in `effect()`. Keep 60 fps on a mid phone: draw the
static layers once to an offscreen canvas as the page is today.

## 6g. Deploy on push (owner action, then code)

The repo isn't linked to Vercel for auto-deploy. The owner links it (Vercel dashboard: Project → Settings →
Git → Connect GitHub `Pranav-422/InkFight`, production branch `main`). After that, preview deployments come
per branch, which makes reviewing these branches much easier. Nothing to code.
