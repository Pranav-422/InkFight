# Sprint 7: Arena 1, Inferno Crater (a 5-minute environment fight)

For a coding agent (Claude Code cloud session). Read this whole file, then `docs/design/arena-1/spec.md` (the owner's
arena spec: the source of truth for the look and the five scenes) and look at `docs/design/arena-1/storyboard.png`
(five panels of the same valley getting worse). Then `MEMORY.md`, `AGENTS.md`, and the Ground rules, Gate and hand-off
checklist in `docs/tasks/next-sprints.md`, which apply unchanged. Branch `sprint-7-arena` from the latest `main`; docs in
`docs/changes/sprint-7-arena.md` with the gate output pasted; never push to `main`, never deploy.

## What it is

A new match mode next to the normal best-of-3: **one 5:00 fight in Inferno Crater**, playable both online with a friend
(the room creator picks the mode) and vs the computer (a mode switch on `/play/cpu`). The arena gets worse in five scenes
on the match clock: Arrival 0:00-0:30, Heatwave 0:30-1:00, Ground Fracture 1:00-1:45, Volcanic Warning 1:45-2:30,
Elevated Final 2:30-5:00. The fight never pauses for a scene change. KO ends it; at 5:00 the higher HP wins (a draw on
equal HP). The normal mode, its balance and its gate must not change at all.

## Where things go (read the code first; these are the seams)

- `src/game/sim.ts` stays pure and deterministic (no `Math.random`, no `Date`; rolls from `roll(m, salt)`). Add an opt-in:
  `createMatch(a, b, inputs, { arena: "inferno" })` (the same way `boss` is passed). Arena state lives in `Match` and goes
  into `Snapshot` (JSON-safe, small: online snapshots are sent 60/s, and 15/s over the Supabase relay).
- New `src/game/arena.ts`: scene timeline, platform list, hazard schedule and the per-tick update, called from `step()`
  only when the match has an arena. Keep sim.ts changes to hooks (ground height lookup, hazard damage, timer/round rules).
- Rendering: new `src/game/arenaRender.ts`, used by `src/game/render.ts` when the snapshot has an arena. Draw it
  procedurally on the canvas in the comic-ink style (bold outlines, flat fills, a few hatch strokes); no image assets
  needed. The storyboard is a reference, never a background image (spec section 9).
- CPU: `src/game/cpu.ts` must play the arena (see "CPU" below), or vs-computer is unplayable.
- UI: a mode choice on `/play/cpu` and when creating a room; the Versus face-off and HUD show the arena and the clock.
  The room's mode travels with the lobby (`src/game/protocol.ts`). `src/game/useGameRoom.ts` belongs to the main session
  (online relay): change it only to pass the mode into `createMatch`, nothing else.

## Terrain: place every element carefully

The current arena is a flat strip: `ARENA = { w: 960, h: 540, ground: 480, wall: 30 }`, gravity 0.75 px/tick², jump
velocity 13 (AGI 40) to 19 (AGI 100), walk speed 3 to 7 px/tick. So the **weakest jumper rises ~112 px and stays ~35
ticks in the air, covering ~104 px sideways**. Every reachable step must be reachable by an AGI 40 / SPD 40 fighter
without the Scene 5 jump boost. Rules:

1. **Side view stays 2D.** Do not add the spec's depth axis now (section 5 calls it a recommendation; the sim and the
   netcode are 1D horizontal + jump). Say so in the docs as a decision.
2. **Platforms are real geometry**: `{ id, x, w, top, kind, state, riseT }`, one-way from below (jump up through, land on
   top, hold S + jump to drop down) unless the kind says solid. Landing uses the highest platform top under the feet at
   that x; walking off an edge falls. Hitboxes and attacks work the same on a platform as on the floor.
3. **Steps (the "stairs")**: each rise between consecutive steps ≤ 75 px, each horizontal gap ≤ 70 px, each step ≥ 70 px
   wide (two feet plus a stance). A fighter standing on a step must have head room (no platform less than 150 px above).
4. **The final shared platform** (Scene 5): at least 420 px wide, centred, top about 200-240 px above the old floor, with
   a staircase route of rising boulders from **both** sides so neither player starts closer. Mirror the layout around the
   centre: Scene 5 must be fair for P1 and P2.
5. **Cliffs**: the tall jagged cliffs are the left and right walls (the existing `wall`), drawn as rock. They are not
   climbable and not collision beyond the wall line. Decorative background rocks, chains and floating stones never
   collide (spec section 9).
6. **Rising boulders**: telegraph 2 s before they rise (cracks + dust where they will come up), rise over ~1 s, and never
   rise into a fighter (push the fighter up onto the top, never through or into a wall).
7. **Cracks and lava leaks** (Scene 3): only in marked zones, at most 2 active at once, never under a fighter that had no
   warning: a zone glows ≥ 1.5 s before it hurts. Leave a safe strip at least 200 px wide at all times.
8. **Meteorites** (Scene 4): a shadow / ground marker ≥ 1 s before impact, impact radius small, never two impacts on the
   same 200 px at once, and never on both fighters' positions at the same tick.
9. **Rising lava** (Scene 5): rises slowly over the old floor; reaches the floor level only after the boulder staircase
   has fully risen and stayed up ≥ 10 s. Below-floor lava touches only someone who stays down. It never kills by script
   at 5:00 (the HP rule decides).
10. **Falling off / lava contact**: decide one rule and document it. Suggested: contact deals small damage per 30 ticks,
    knocks the fighter up toward the nearest platform, and lowers STR damage by a capped amount that wears off.

Write `scripts/arena.ts`: build the platform layout at every scene and **assert** the rules above (rise, gap, width,
head room, the final platform reachable from both sides by an AGI 40 / SPD 40 fighter: simulate jumps with the real
`deriveDef` numbers and `step()`, don't just compare numbers by hand), and print the layout as ASCII so the reviewer can
see it.

## Hazards and fairness (spec section 7)

Telegraph first, damage second; always a viable route; capped, recoverable debuffs; knockouts beat scheduled events; no
new hazards after the match ends. Every number (heat, lava damage, debuff size, meteor rate, lava speed, jump boost) goes
in one tunable table in `arena.ts` with a comment, not scattered. The constellation / plausibility system in the spec does
not exist in the game: leave it out and list it under "not done" (don't invent it).

## CPU

The computer must: walk off a crack zone once it glows, step out of a meteor marker, climb the staircase in Scene 5
(pathfind over the platform list: it's a short list, a breadth-first search over "can jump from A to B" is enough), and
fight on the final platform. Measure with `scripts/arena.ts`: over 200 CPU vs CPU arena matches (`normal` level, mixed
classes), both fighters reach the final platform in ≥ 95%, hazards deal 10-30% of all damage, matches end by KO or
timeout (no stuck fighters), and the same seed gives the same result (determinism).

## Look (spec section 2 and the storyboard)

One valley, five moods, the same composition: towering jagged black cliffs at both edges, chains and floating rocks up
top, a huge volcano in the distance, lava glow below. Scene by scene: clean twilight → warmer heat shimmer (no full-screen
blur) → orange cracks glowing in the floor → red-black sky, ash, meteors with markers → eruption light, rising boulders,
lava below. The fighters stay the focus: darker, calmer background behind them, effects sparse. Pre-render static layers
to offscreen canvases once per scene (as `paperPage()` does today) and only animate the live bits, so a mid phone keeps
60 fps. Respect "Reduce flashes" (`src/game/flashes.ts`) for screen shake and flashes. HUD: the 5:00 clock and the scene
name (a small stamped tag when it changes).

## Balance and gate

- `npx tsx scripts/balance.ts 200` must print exactly what it prints on `main` before your change (normal mode untouched).
- `npx tsx scripts/arena.ts` passes all its asserts and prints the CPU numbers above.
- `scripts/check-sim.ts` gets asserts: arena off = identical snapshots to before; scene changes at the right ticks;
  a fighter lands on a platform; a hazard only hurts after its telegraph; KO ends the match; timeout picks higher HP.
- The full Gate from `docs/tasks/next-sprints.md`.

## Not in scope

Constellations / plausibility, the depth axis, new arenas, audio files (use the existing `src/game/sound.ts` recipes if
you want cues), recording arena fights on the leaderboard (keep them unrecorded and say so).

## Hand-off

`docs/changes/sprint-7-arena.md`: what changed (files), decisions (2D, platform rule, fall/lava rule, numbers), the gate
and `scripts/arena.ts` output pasted (including the ASCII layouts), what you could not verify (it's a visual feature:
describe what you checked and how), and how to test it by hand (which page, which keys, what to look for at each scene).
