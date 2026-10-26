# Sprint 7b: Arena 1, pass 2 (story flow, constellations, ring, ending)

For a Claude Code cloud session. Read `docs/design/arena-1/spec.md`, `docs/changes/sprint-7-arena.md` (what pass 1 built and the decisions it made) and `docs/tasks/arena-1.md` (the physics limits) first.

**UI reference:** `docs/design/arena-1/ui-reference.png`. If it isn't in the repo yet, build everything else and leave G for last. Use the existing Graphic Arena look until the image lands.

The owner's decisions (2026-10-26): the depth/lane view is a later sprint, the plausibility buff is 10-50% random, a buffed fighter looks bigger and stronger.

Base branch `sprint-7-merge`, new branch `sprint-7b-arena`. Same rules as `docs/tasks/next-sprints.md`: gate, `docs/changes/sprint-7b.md`, no push to main, no deploy.

**A. Guided pauses.** Add a new sim phase `"cue"` (`Match.cue = {text, until, target?}`). While it's on, the clock and the fight are frozen and inputs only move fighters toward a marked spot. It ends when both fighters stand on their spots, or after a timeout. It's host-authoritative, so online works as is. Every "go here" instruction uses it.

**B. Opening ceremony (first 15 s, no fighting).**
- All constellations glow in the sky.
- Each fighter gets a black and grey pop-up and locks one constellation: keys/touch to cycle, punch to lock. The CPU picks at random.
- The chosen constellation grants a skill (see the table below).
- After that only the two chosen constellations stay in the sky, glowing dull.
- The pick goes in the snapshot and the lobby (`ConstellationId` in `protocol.ts`).

Five constellations, one skill each. Values live in `ARENA_TUNE`:

| Constellation | Skill |
|---|---|
| Phoenix | lava/cracks hurt 60% less (lava adaptation, from the spec) |
| Hare | jump ×1.15 and air control ×1.3 all match |
| Tortoise | env damage cap halved, weakness capped at 10% |
| Serpent | hits on a scorched opponent deal +10% |
| Comet | special meter fills 15% faster |

**C. Weather change in slow motion.** Scene moods crossfade over about 8-10 s, not 2 s, so the sky, light and ash build up gradually. Make the heatwave clearly visible: a stronger shimmer, an orange haze, warped background lines and sweat/steam puffs on the fighters. "Reduce flashes" still scales it.

**D. Scene 3 lava leak.** Crack zones spill flowing lava (animated streams, splashes, glow on the fighters' legs, bigger pools). Same fairness limits as now.

**E. Scene 4 to 5, the ring.**
- When the platforms appear, a cue says "Get up there!". The fight is paused (A), so nobody fights on the stairs.
- Make the final platform and the camera view bigger, and the fighters a bit smaller there (render scale, not hitboxes), so it reads as a real arena.
- Each fighter enters from opposite sides. Ring ropes/walls rise, and stand-here marks show where to go. They walk to the marks (cue).
- Then each fighter's constellation glows bright in the sky. A plausibility roll of **10-50%** (seeded `roll(m, salt)`, one roll per fighter) becomes a % buff to their stats (dealt/taken like the admin buff: `buff` multipliers in `sim.ts`).
- The buffed fighter **looks bigger/stronger**: scale ×1.1-1.2 by roll, a constellation aura, a "+N%" HUD tag.
- Then FIGHT. The ring walls are solid sides on the final platform, so nobody falls off mid-fight.

**F. Ending.**
- On a KO (and at time-out, the lower-health fighter), play a scripted animation: the winner kicks the loser off the ring into the lava.
- The loser's constellation turns into a shooting star and the weather clears to a calm sky.
- Then the result panel shows.

**G. UI to the reference photo.** Match `docs/design/arena-1/ui-reference.png` exactly: HUD, constellation pop-up, ring, colours.

**Balance:** the random 10-50% buff makes single fights swingy, which is accepted by the user. `scripts/arena.ts` must still pass the class pairs 35-65% over many fights, plus the reachability/determinism checks. Normal mode stays byte-identical (`balance.ts 200` diff empty).

**Out of scope:** the depth/lane view (next sprint), new art beyond procedural canvas, and recording changes.

