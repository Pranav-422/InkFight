# Sprint 7b: Arena 1, pass 2 (guided pauses, constellations, weather, the ring, the ending)

Branch `sprint-7b-arena`, based on `sprint-7-merge` (`16858fb`). Nothing pushed to `main`, nothing deployed, no new dependency, no migration. The
online transport (`src/game/relay.ts`, the WebRTC / relay code in `src/game/useGameRoom.ts`, `src/app/api/rooms/**`) is untouched. Normal fights are
unchanged: `check-sim` still hashes three scripted normal fights against the value taken on `main`, and `npx tsx scripts/balance.ts 200` prints
exactly what `main` prints (the diff is in section 3, part by part).

Work order, one commit per part, the gate after each (sections 1-3 grow part by part): **A** guided pauses, **B** opening ceremony and constellations,
**C** weather, **D** lava leak, **E** the ring and the buff roll, **F** the ending, **G** the UI to `docs/design/arena-1/ui-reference.png`.

## 1. What changed

### A. Guided pauses (the "cue" phase)

A new sim phase, `"cue"`, with `Match.cue = { id, text, until, hold, target?, done, fin? }`. While it runs the **match clock and the fight hold still**
(`m.timer` doesn't move, nothing is dealt, no meter fills, no cooldown matters), **nobody can attack, guard, cast or use a side skill**, and the
fighters may **walk and jump only when the cue has marks to go to** (`target`, one `{x, y, r}` per fighter: stand within `r` px of `x` on the surface at
height `y`). A fighter who has reached the mark is `done` and is held there (no input moves them) until the other arrives. The cue ends when both are `done`
and have lingered `hold` ticks (so the arrival reads), or `until` ticks after it began. Every instruction that says "go here" is a cue.
It lives in `Match` and therefore in every `Snapshot` (`cloneCue`, a few dozen bytes), so it is host-authoritative and works online as is (the guest just
draws it); `resumeMatch` restores it.

- `src/game/sim.ts`: `Phase` gets `"cue"`; `startCue`, `cueTick`, `calm` (a pause starts from a quiet fight: projectiles, timed hazards, moves in progress, a
  held victim and queued presses are cleared; health, meter and cooldowns stay). Presses are still *read* in a pause so none is left over when the fight
  resumes (a punch hammered during the pause doesn't fire on the first fight tick); only the jump counts. Every other phase reads input exactly as before
  (the normal-mode golden hash proves it).
- `src/game/arena.ts`: **the story**: `STORY`, a list of beats, each `{ id, at?, make, end? }`. A beat with `at` waits for that match tick, one without it
  follows the previous beat at once; `a.beat` counts the beats told. `arenaBeat` (checked after every counted fight tick), `arenaCueTick`, `arenaCueEnd`.
  This part's only beat is **`climb`**: at the 9000th fight tick (the start of scene 5) the fight stops with "GET UP THERE!", the staircase rises, and the
  pause ends when both fighters stand on the final platform (the mark is the whole top of the platform). After 25 s whoever is still below is lifted
  onto it (`warp` event); the computer never needs that (asserted).
- **The world clock** (`arenaWorld(m)` = match clock + ticks spent in pauses, `ArenaState.pause`): what moves by itself (the staircase, the lava) runs on it,
  so the stairs rise *during* the pause while the match clock holds. Platforms, `lavaY`, `standingOn`, `arenaSurface`, the rescue, the renderer and the
  CPU use it; scenes, hazards and the heat use the match clock. `lavaY` stops 35 px under the final platform however long the pauses were.
- The staircase is the same shape (asserted by `scripts/arena.ts`: rises, gaps, widths) but **faster**: step 1 warns at 8700 and rises at 9000, steps 2 warn
  at 9000 and rise at 9150, the final platform warns at 9150 and rises at 9300 (90 ticks); everything stands 6.5 s after scene 5 begins (it was 21 s).
  Every rock still warns at least 2 s ahead (dust, rumble, hopping pebbles).
- `src/game/arenaNav.ts` (computer): `cueNav` walks to the mark, climbing to it when it is up on a platform and waiting when the stairs aren't built far enough.
  `planHops` / `pickHop`: of the comfortable takeoffs it takes the one nearest to where it stands (before, everyone queued for the single best spot, and two
  fighters who both wanted the same spot pushed each other away from it for ever; found by the climb test). `nextHop` tries nodes nearest first, so of two
  equally short staircases a fighter takes the one on its own side.
- `src/game/arenaRender.ts`, `render.ts`: the headline plate ("GET UP THERE!", `P1 ✓ / P2 …` under it), the marks (stand-here pads for small marks; for the
  final platform a gold dashed line with arrows along its top), the camera keeps the mark in frame, a `cue` and a `warp` sound / puff.
- `scripts/check-sim.ts`, `scripts/arena.ts`: see the tests below. `scripts/shots-7b/` draws the screenshots (below).

**Tests:** `check-sim` asserts the pause starts at exactly 9000 played ticks and not before; the match clock holds while the world clock runs and the stairs rise;
no attack, guard, cast, skill or meter movement in a pause and nothing queued survives it; walking and jumping work; a fighter in place is held; the pause
ends after the linger and the clock resumes where it stopped; the timeout lifts stragglers; a snapshot in a pause survives JSON and a resumed match carries on
identically; what was in flight is cleared at the start. `scripts/arena.ts` plays the pause with two computer fighters from 10 start positions for the weakest
jumper (AGI 40 / SPD 40), a strong one (AGI 100) and a mixed one: all finish in 7.5-10.7 s, none needs the timeout lift.

![The pause begins: the headline, the dashed mark where the platform will rise](sprint-7b/a-climb-start.png)
![Steps up while the match clock holds](sprint-7b/a-climb-stairs.png)
![The final platform is up, fighters on their way](sprint-7b/a-climb-ring-up.png)
![The fight resumes: "FIGHT!"](sprint-7b/a-fight-resumes.png)

Phone (390 px canvas, device scale 3):

![](sprint-7b/a-climb-start-phone.png)
![](sprint-7b/a-climb-ring-up-phone.png)

### B. Opening ceremony and constellations (the first 15 s, no fighting)

An arena fight now opens with three guided pauses (the story's first beats, `open` → `pick` → `settle`; the intro title card before them is 1.5 s):

1. **`open`, "THE STARS WAKE" (2 s):** all five constellations light up in the sky; the camera looks up (zoom 0.85) with the sky above and the fighters below; no health bars
   or clock yet, a title card ("ARENA 1 / INFERNO CRATER") instead.
2. **`pick`, "CHOOSE YOUR CONSTELLATION" (9 s at the most):** each fighter gets a black-and-grey pop-up (P1 left, P2 right) listing the five, the cursor in their colour, the
   focused one's skill on a yellow plate. **Left / right move the cursor one place per press** (a held key doesn't repeat), **punch locks it**: keys, the on-screen D-pad and
   PUNCH button, or a gamepad. A constellation someone has locked can't be locked again and the cursor skips it. If both lock on the same tick P1 gets it and P2's press is
   consumed (it must not lock the next one by surprise). When both are locked the pause lingers 0.75 s so the stamp reads; a fighter who hasn't locked when the 9 s run out gets the one
   under the cursor. **The computer picks at random** (`Math.random` in its brain, like the rest of its play): it thinks 0.75-3.5 s, scrolls one place every 8 ticks and punches.
3. **`settle`, "THE STARS ARE SET" (2 s):** the three unchosen ones fade, the two chosen ones glide over their fighter's side of the sky and settle to a dull glow, and stay there for
   the whole fight. **The longest the ceremony can take is 15.25 s** (1.5 + 2 + 9 + 0.75 + 2); the computer takes 8.6 s on average (`scripts/arena.ts`).

The pick is `ArenaState.pick` (the locked constellation per fighter), `cur` (the cursor) and `dir` (the direction held last tick, so a press moves once): they ride in every snapshot,
so a guest sees the cursors move and the picks, and `resumeMatch` restores them. A lock is a `star` event (sound, ring and sparks in the sky). `ConstellationId` is in `src/game/protocol.ts`.

**What each constellation grants for the whole fight** (`ARENA_TUNE.stars`, the numbers from the sheet; the pop-up text is written from them):

| Constellation | Skill | Where it acts |
|---|---|---|
| Phoenix | lava and cracks deal 40% of their damage (60% less) | `arenaStep`, on the crack / lava damage |
| Hare | jump ×1.15, air control ×1.3, all match | `arenaBoost(m, slot)`: stacks with scene 5's boost; the computer plans its jumps with it |
| Tortoise | the environment-damage cap is halved (8% → 4% of the pool per 10 s), scorch weakness capped at 10% | `envHurt`, the weakness cap |
| Serpent | hits on a scorched opponent (weakened by lava or a crack) deal +10% | `arenaDamageFactor`, called from `applyHit` |
| Comet | the special meter fills 15% faster | `energyGain` (`arenaEnergyMul`) |

Environment damage still never knocks anyone out and the caps are per fighter; "scorched" is the HUD's `SCORCHED -n% DMG` state. Nothing here touches a normal fight: every hook is
behind `m.arena`.

- `src/game/arena.ts`: `CONSTELLATIONS`, `starInfo`, the three beats, `arenaCueInput` (read before the fighters consume the buttons), `arenaOpen`, the skill hooks above.
- `src/game/sim.ts`: the intro leads into the ceremony for an arena fight (`ARENA_TUNE.ceremony.intro`), `arenaCueInput` is called before the fighters update, the hooks.
- `src/game/arenaStars.ts` (new): the five constellations drawn procedurally (stars joined by lines, each its own colour), baked once to a small canvas and stamped with an alpha.
- `src/game/arenaRender.ts`, `render.ts`: the sky (all five in a row, rings and tags for who looks at / locked which, the glide at the settle, the dull pair afterwards), the sky
  dimmed while the stars are the point, the ceremony camera, the pop-ups (a compact one for a phone: only the player's own, larger), the title card, `★ Serpent` beside each name,
  `chime` (a lock), `shimmer` (the stars waking) and a tick when the local player's cursor moves (`src/game/sound.ts`).
- `src/game/arenaNav.ts`: `pickNav`.

**Tests:** `check-sim` asserts the intro leads into `open` → `pick` → `settle` → the fight and that the match clock doesn't move before it; presses do nothing in `open`; one press = one place, a held
key doesn't repeat, left goes back, the list wraps; a same-tick tie goes to P1 and P2's press is consumed; the cursor skips what the other fighter took; a timeout locks the cursor's constellation
for whoever hasn't locked and nobody ever shares one; both locking ends the pick after the linger, not the timeout; nobody loses health or meter in the ceremony; the pick survives JSON and
`resumeMatch`; the longest ceremony is at most 16 s; and **every skill**: Phoenix takes 0.4 of a crack's damage, Tortoise stays under half the cap in lava and under 10% scorch (others don't), the Hare's
jump apex rises by the squared factor and stacks with scene 5's boost, the Serpent's +10% needs a scorched foe, the Comet's meter fills 1.15x as fast. `scripts/arena.ts` prints the computer's picks
(spread 18-22% each over 440 picks, never the same constellation twice) and the ceremony length.

![The stars wake](sprint-7b/b-open.png)
![Choosing: the cursors in each fighter's colour, the skill on the yellow plate](sprint-7b/b-pick-choosing.png)
![P1 has locked (gold ring in the sky, LOCKED on the pop-up)](sprint-7b/b-pick-one-locked.png)
![Both locked](sprint-7b/b-pick-both-locked.png)
![The stars settle: the two chosen glide to their side, the others fade](sprint-7b/b-settle.png)
![The fight starts with the two chosen constellations glowing dull above](sprint-7b/b-fight.png)

Phone (390 px canvas, device scale 3; only the player's own pop-up, larger):

![](sprint-7b/b-open-phone.png)
![](sprint-7b/b-pick-choosing-phone.png)
![](sprint-7b/b-pick-both-locked-phone.png)
![](sprint-7b/b-settle-phone.png)
![](sprint-7b/b-fight-phone.png)

### C. Weather change in slow motion, and a heatwave you can see

- **The sky, light and ash build up over 9 s** (`ARENA_TUNE.weather.fade`, 540 ticks; it was a 2 s cut-fade). The five baked backdrops are crossfaded with a smooth curve, and the things that used
  to switch on at a scene's first tick follow the same curve: the embers and the ash (a continuous "mood" number 0..4 drives their rate and the share that is ash), the molten edge of the floating
  rocks, the heat. The fade is measured on the **world clock**, so scene 5's sky keeps coming in while the guided pauses hold the match clock. The next scene is baked only after the current one has
  fully come in, so the one fading out is never evicted mid-fade (three backdrops at most are kept, as before).
- **The heatwave** (`heatAt(world)`: 0 in scene 1, builds over the fade into scene 2, full through scene 2, then settles to 45% for the rest of the fight):
  - a **stronger shimmer**: 12 wavy lines of bent light (up to ~9 px swing) and eight soft plumes of hot air drifting over the floor, instead of six faint lines;
  - an **orange haze** over the far air, thickest at the floor, and a pool of warm light round the volcano's foot;
  - **warped background lines**: the band from the volcano's foot to the floor (y 300-470) is drawn in 5 px slices, each pushed sideways by a travelling wave (up to 3.4 px), so the spires, the lava river
    and the cliffs wobble like air over hot stone;
  - **sweat and steam on the fighters**: drops run off the head, pale puffs rise off the shoulders (`render.ts`, through the existing particle list, which now takes a per-particle gravity so steam rises).
  "Reduce flashes" scales all of it down (shimmer x0.3, warp x0.15, haze half, sweat and steam x0.35).
- `src/game/arenaRender.ts` (`backdrop`, `haze`, `mood`, `heatAt`), `src/game/render.ts`, `src/game/arena.ts` (`ARENA_TUNE.weather`). Nothing in the sim changed.

**Tests:** `check-sim` asserts the fade is 8-10 s and the heat curve (zero before scene 2, builds without a dip over the fade, 1.0 through scene 2, settles at 0.45 and stays). The look is from the screenshots.

Desktop (the fade from scene 1 to 2 is the second picture; the heatwave itself the third):

![Scene 1, Arrival: a clean twilight](sprint-7b/c-scene1-arrival.png)
![Scene 1 to 2 halfway, 4.5 s in: the sky is half way to orange, the haze rising](sprint-7b/c-fade-1to2.png)
![Scene 2, Heatwave: haze, bent light, plumes, steam and sweat on the fighters](sprint-7b/c-scene2-heatwave.png)
![Scene 3, Ground Fracture](sprint-7b/c-scene3-fracture.png)
![Scene 3 to 4 halfway](sprint-7b/c-fade-3to4.png)
![Scene 4, Volcanic Warning](sprint-7b/c-scene4-warning.png)

Phone:

![](sprint-7b/c-scene1-arrival-phone.png)
![](sprint-7b/c-fade-1to2-phone.png)
![](sprint-7b/c-scene2-heatwave-phone.png)
![](sprint-7b/c-scene3-fracture-phone.png)
![](sprint-7b/c-scene4-warning-phone.png)

## 2. Decisions (everything the sheet left open, with the values chosen)

All numbers are in `ARENA_TUNE` (`src/game/arena.ts`).

A1. **`Match.cue` has more than `{text, until, target?}`**: an `id` (the renderer, the CPU and the story key off it), `hold` (linger), `done` (who is in place) and
    `fin` (when both were). `until` is ticks into the cue. A mark is `{x, y, r}`, not just an x: the floor under the final platform has the same x.
A2. **The match clock holds, the world clock doesn't.** The stairs must rise while the fight is paused, but every scene, hazard and the 5:00 are on the match
    clock. One extra counter (`pause`) is the whole cost.
A3. **The final platform can't be landed on while it rises** (steps still can: a fighter on one is carried up, as in pass 1). It comes up through the middle of
    the floor, and carrying whoever stood there would have made "Get up there!" a free elevator ride (the first run of the test did exactly that).
A4. **Timeout lifts, never waits for ever.** 25 s; a fighter still below is placed on the platform (puff and sound). The computer never needs it (a failure
    in `scripts/arena.ts` if it does), a human who is lost or AFK doesn't hold the match.
A5. **The staircase rises in 6.5 s** instead of 21 s: the pause is the story beat, so there is no reason to spread the rocks over 20 s. Geometry unchanged.
A6. **Jump is allowed in a pause, drop-through isn't** (guard is off), nothing else is.
A7. **`scripts/arena.ts` runs 300 fights per class pair by default** (about 5 minutes in all). At 100 (±10%) a pair that is really 55% reads 65%+ often enough
    to fail a good build (it happened on the first run of this sprint: Sword-Tank 67% at 100 fights, 55% at 300).
B1. **The pick is in the snapshot, not the lobby.** `ConstellationId` lives in `protocol.ts` as asked, and `Snapshot.arena.pick` carries it to the guest and to `resumeMatch`. The sheet
    also says "and the lobby", but the pick is made inside the fight, after both players have readied, so the lobby has nothing to carry (an optional field nothing sets would be dead code).
B2. **Two fighters never share a constellation** ("only the two chosen constellations stay in the sky" reads as two different ones). A tie on the same tick goes to P1 (P2's press is consumed).
B3. **A fighter who doesn't choose gets the one under the cursor** after 9 s: nobody holds the match, and the CPU or an AFK player isn't a problem.
B4. **The ceremony is 1.5 s of title card + at most 13.75 s of beats = 15.25 s**; with two players locking quickly it is about 8 s.
B5. **Skills apply to the whole fight** ("all match" for the Hare), not only scene 5; they stack with the scene 5 boost. Phoenix means crack and lava damage only (not meteors or heat).
B6. **The HUD hides during the opening** (no health bars or clock yet), and the pop-ups sit at the screen's corners so the fighters (who start at 28% / 72% of the width) stay visible between them.
B7. **Wording of the skills in the pop-up is generated from `ARENA_TUNE.stars`** (`starInfo`), so retuning a number retunes the text.

C1. **The weather fade is on the world clock** (not the match clock), so it keeps running through a guided pause: scene 5's eruption sky comes in while "Get up there!" holds the fight.
C2. **9 s**, the middle of the sheet's "8-10 s". One curve (smoothstep) for the backdrops and everything that follows the mood.
C3. **The heat doesn't end at scene 3.** It settles to 45% (a hot arena stays hot); the sweat and steam stay. Only the *heatwave* (the peak) belongs to scene 2.
C4. **The warp redraws a band of the backdrop in slices** instead of distorting the whole screen: no blur, no offscreen buffers, about 35 `drawImage` calls a frame while it is on.


## 3. Gate output

Local Postgres as in `MEMORY.md`. The balance baseline is `npx tsx scripts/balance.ts 200` on `origin/main` (`0ec289a`), taken in a worktree.

### Part A

```
$ npx tsc --noEmit
exit 0

$ npm run lint

> inkfight@0.1.0 lint
> eslint

exit 0

$ npx tsx scripts/check-sim.ts
check-sim: all good
exit 0

$ npx tsx scripts/arena.ts
weakest fighter (AGI 40, SPD 40): jump apex 106.3 px, 34 ticks in the air, 102 px sideways at walking speed

scene 1-4: the floor (tick 0, 0 s, lava y 540)
200 |||                                                                                          |||
220 |||                                                                                          |||
240 |||                                                                                          |||
260 |||                                                                                          |||
280 |||                                                                                          |||
300 |||                                                                                          |||
320 |||                                                                                          |||
340 |||                                                                                          |||
360 |||                                                                                          |||
380 |||                                                                                          |||
400 |||                                                                                          |||
420 |||                                                                                          |||
440 |||                                                                                          |||
460 |||                                                                                          |||
480 |||##########################################################################################|||
500 |||                                                                                          |||
520 |||                                                                                          |||

scene 4, 5 s before the stairs: dust where they will rise (tick 8760, 146 s, lava y 540)
200 |||                                                                                          |||
220 |||                                                                                          |||
240 |||                                                                                          |||
260 |||                                                                                          |||
280 |||                                                                                          |||
300 |||                                                                                          |||
320 |||                                                                                          |||
340 |||                                                                                          |||
360 |||                                                                                          |||
380 |||                                                                                          |||
400 |||                                                                                          |||
420 |||                                                                                          |||
440 |||                                                                                          |||
460 |||                                                                                          |||
480 |||######::::::::#############################################################::::::::#######|||
500 |||          1                                                                    2          |||
520 |||                                                                                          |||

scene 5, step 1 rising (tick 9030, 151 s, lava y 539)
200 |||                                                                                          |||
220 |||                                                                                          |||
240 |||                                                                                          |||
260 |||                                                                                          |||
280 |||                                                                                          |||
300 |||                                                                                          |||
320 |||                                                                                          |||
340 |||                                                                                          |||
360 |||                                                                                          |||
380 |||                                                                                          |||
400 |||                                                                                          |||
420 |||                                                                                          |||
440 |||      ========                                                             ========       |||
460 |||          1                                                                    2          |||
480 |||################:::::::############################################:::::::################|||
500 |||                   3                                                  4                   |||
520 |||~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~|||

scene 5, steps 1 up, 2 and the final platform warn (tick 9200, 153 s, lava y 535)
200 |||                                                                                          |||
220 |||                                                                                          |||
240 |||                                                                                          |||
260 |||                                                                                          |||
280 |||                                                                                          |||
300 |||                                                                                          |||
320 |||                                                                                          |||
340 |||                =======                                            =======                |||
360 |||                   3                                                  4                   |||
380 |||                                                                                          |||
400 |||      ========                                                             ========       |||
420 |||          1                                                                    2          |||
440 |||                                                                                          |||
460 |||                                                                                          |||
480 |||########################::::::::::::::::::::::::::::::::::::::::::########################|||
500 |||                                             5                                            |||
520 |||~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~|||

scene 5, everything up (tick 9420, 157 s, lava y 530)
200 |||                                                                                          |||
220 |||                                                                                          |||
240 |||                                                                                          |||
260 |||                                                                                          |||
280 |||                        ==========================================                        |||
300 |||                                             5                                            |||
320 |||                                                                                          |||
340 |||                =======                                            =======                |||
360 |||                   3                                                  4                   |||
380 |||                                                                                          |||
400 |||      ========                                                             ========       |||
420 |||          1                                                                    2          |||
440 |||                                                                                          |||
460 |||                                                                                          |||
480 |||##########################################################################################|||
500 |||                                                                                          |||
520 |||~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~|||

5:00, lava at its highest (tick 18000, 300 s, lava y 315)
200 |||                                                                                          |||
220 |||                                                                                          |||
240 |||                                                                                          |||
260 |||                                                                                          |||
280 |||                        ==========================================                        |||
300 |||~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~5~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~|||
320 |||~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~|||
340 |||~~~~~~~~~~~~~~~~=======~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~=======~~~~~~~~~~~~~~~~|||
360 |||~~~~~~~~~~~~~~~~~~~3~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~4~~~~~~~~~~~~~~~~~~~|||
380 |||~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~|||
400 |||~~~~~~========~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~========~~~~~~~|||
420 |||~~~~~~~~~~1~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~2~~~~~~~~~~|||
440 |||~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~|||
460 |||~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~|||
480 |||##########################################################################################|||
500 |||~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~|||
520 |||~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~|||

layout asserts
  rises <= 69.1 (staircase: 66, 66, 133, 133), gaps <= 70.0, final platform 420 px wide (380 needed), 200 px up. ok

the climb pause with the real sim (nobody fights; both fighters are computer-driven):
  AGI 40 / SPD 40: 65:8.2s 100:8.1s 150:10.7s 230:7.6s 300:9.9s 480:9.3s 650:9.8s 740:7.5s 810:10.7s 895:8.2s
  AGI 100 / SPD 100: 65:7.8s 100:7.8s 150:7.9s 230:7.7s 300:7.7s 480:7.7s 650:7.7s 740:7.7s 810:7.9s 895:7.8s
  AGI 70 / SPD 40: 65:7.9s 100:7.8s 150:7.5s 230:7.5s 300:7.5s 480:7.5s 650:7.5s 740:7.7s 810:7.5s 895:7.9s

CPU vs CPU, normal level: 220 arena fights over 15 class pairs, both seats
  19 s. ended by KO 210, by the clock 10 (draws 0); average 310 s of play (the clock holds during hit-stop)
  fighters in scene 5: 430/440; still fighting 10 s after the stairs stood: 430; of those on the final platform at some point: 100.0% (both fighters of a fight: 100.0% of 215)
  fighters lifted onto the final platform by a pause timeout: 0
  hazards dealt 16.6% of all damage (237419 of 1433947)

CPU vs CPU, hard level: 300 fights per class pair (±6%)
  247 s. Sword-Mace 53%, Sword-Tank 55%, Sword-Attacker 51%, Sword-Fighter 56%, Mace-Tank 41%, Mace-Attacker 57%, Mace-Fighter 40%, Tank-Attacker 52%, Tank-Fighter 55%, Attacker-Fighter 44%
  fair: every pair within 40-57% (target 35-65%)

determinism: the first 6 fights replay identically

ok: all arena checks passed (scenes: ARRIVAL > HEATWAVE > GROUND FRACTURE > VOLCANIC WARNING > ELEVATED FINAL ARENA)
exit 0

$ npx tsx scripts/balance.ts 200
win rate of row vs column (hard CPU, default kits, 200 matches each) · avg round length
         Sword     | Mace      | Tank      | Attacker  | Fighter  
Sword     51% 23s |  55% 23s |  59% 29s |  39% 18s |  51% 25s
Mace      49% 22s |  55% 23s |  56% 28s |  44% 19s |  51% 24s
Tank      40% 29s |  44% 29s |  51% 40s |  56% 26s |  58% 30s
Attacker  58% 19s |  54% 19s |  45% 26s |  51% 16s |  43% 20s
Fighter   56% 24s |  55% 24s |  39% 30s |  59% 20s |  41% 25s
pairs (400 matches each, ±2.5%): Sword-Mace 53%, Sword-Tank 60%, Sword-Attacker 41%, Sword-Fighter 48%, Mace-Tank 56%, Mace-Attacker 45%, Mace-Fighter 48%, Tank-Attacker 56%, Tank-Fighter 60%, Attacker-Fighter 42%
fair: every pair within 41-60%

stat line vs all-70 (200 kits, 2 matches each): one stat at 100, the other four ~62
STR 53%  ·  DUR 52%  ·  SPD 55%  ·  AGI 50%  ·  IQ 50%
ok: every stat line within 45-62%
exit 0

balance diff vs main: empty (identical)
```

(`npx tsx scripts/arena.ts` with the default 300 fights per pair; the climb, layout, CPU and determinism sections are in the output.)

### Part B

```
$ npx tsc --noEmit
exit 0

$ npm run lint

> inkfight@0.1.0 lint
> eslint

exit 0

$ npx tsx scripts/check-sim.ts
check-sim: all good
exit 0

$ npx tsx scripts/arena.ts
weakest fighter (AGI 40, SPD 40): jump apex 106.3 px, 34 ticks in the air, 102 px sideways at walking speed

scene 1-4: the floor (tick 0, 0 s, lava y 540)
200 |||                                                                                          |||
220 |||                                                                                          |||
240 |||                                                                                          |||
260 |||                                                                                          |||
280 |||                                                                                          |||
300 |||                                                                                          |||
320 |||                                                                                          |||
340 |||                                                                                          |||
360 |||                                                                                          |||
380 |||                                                                                          |||
400 |||                                                                                          |||
420 |||                                                                                          |||
440 |||                                                                                          |||
460 |||                                                                                          |||
480 |||##########################################################################################|||
500 |||                                                                                          |||
520 |||                                                                                          |||

scene 4, 5 s before the stairs: dust where they will rise (tick 8760, 146 s, lava y 540)
200 |||                                                                                          |||
220 |||                                                                                          |||
240 |||                                                                                          |||
260 |||                                                                                          |||
280 |||                                                                                          |||
300 |||                                                                                          |||
320 |||                                                                                          |||
340 |||                                                                                          |||
360 |||                                                                                          |||
380 |||                                                                                          |||
400 |||                                                                                          |||
420 |||                                                                                          |||
440 |||                                                                                          |||
460 |||                                                                                          |||
480 |||######::::::::#############################################################::::::::#######|||
500 |||          1                                                                    2          |||
520 |||                                                                                          |||

scene 5, step 1 rising (tick 9030, 151 s, lava y 539)
200 |||                                                                                          |||
220 |||                                                                                          |||
240 |||                                                                                          |||
260 |||                                                                                          |||
280 |||                                                                                          |||
300 |||                                                                                          |||
320 |||                                                                                          |||
340 |||                                                                                          |||
360 |||                                                                                          |||
380 |||                                                                                          |||
400 |||                                                                                          |||
420 |||                                                                                          |||
440 |||      ========                                                             ========       |||
460 |||          1                                                                    2          |||
480 |||################:::::::############################################:::::::################|||
500 |||                   3                                                  4                   |||
520 |||~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~|||

scene 5, steps 1 up, 2 and the final platform warn (tick 9200, 153 s, lava y 535)
200 |||                                                                                          |||
220 |||                                                                                          |||
240 |||                                                                                          |||
260 |||                                                                                          |||
280 |||                                                                                          |||
300 |||                                                                                          |||
320 |||                                                                                          |||
340 |||                =======                                            =======                |||
360 |||                   3                                                  4                   |||
380 |||                                                                                          |||
400 |||      ========                                                             ========       |||
420 |||          1                                                                    2          |||
440 |||                                                                                          |||
460 |||                                                                                          |||
480 |||########################::::::::::::::::::::::::::::::::::::::::::########################|||
500 |||                                             5                                            |||
520 |||~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~|||

scene 5, everything up (tick 9420, 157 s, lava y 530)
200 |||                                                                                          |||
220 |||                                                                                          |||
240 |||                                                                                          |||
260 |||                                                                                          |||
280 |||                        ==========================================                        |||
300 |||                                             5                                            |||
320 |||                                                                                          |||
340 |||                =======                                            =======                |||
360 |||                   3                                                  4                   |||
380 |||                                                                                          |||
400 |||      ========                                                             ========       |||
420 |||          1                                                                    2          |||
440 |||                                                                                          |||
460 |||                                                                                          |||
480 |||##########################################################################################|||
500 |||                                                                                          |||
520 |||~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~|||

5:00, lava at its highest (tick 18000, 300 s, lava y 315)
200 |||                                                                                          |||
220 |||                                                                                          |||
240 |||                                                                                          |||
260 |||                                                                                          |||
280 |||                        ==========================================                        |||
300 |||~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~5~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~|||
320 |||~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~|||
340 |||~~~~~~~~~~~~~~~~=======~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~=======~~~~~~~~~~~~~~~~|||
360 |||~~~~~~~~~~~~~~~~~~~3~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~4~~~~~~~~~~~~~~~~~~~|||
380 |||~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~|||
400 |||~~~~~~========~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~========~~~~~~~|||
420 |||~~~~~~~~~~1~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~2~~~~~~~~~~|||
440 |||~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~|||
460 |||~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~|||
480 |||##########################################################################################|||
500 |||~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~|||
520 |||~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~|||

layout asserts
  rises <= 69.1 (staircase: 66, 66, 133, 133), gaps <= 70.0, final platform 420 px wide (380 needed), 200 px up. ok

the climb pause with the real sim (nobody fights; both fighters are computer-driven):
  AGI 40 / SPD 40: 65:8.2s 100:8.1s 150:10.7s 230:7.6s 300:9.9s 480:9.3s 650:9.8s 740:7.5s 810:10.7s 895:8.2s
  AGI 100 / SPD 100: 65:7.8s 100:7.8s 150:7.9s 230:7.7s 300:7.7s 480:7.7s 650:7.7s 740:7.7s 810:7.9s 895:7.8s
  AGI 70 / SPD 40: 65:7.9s 100:7.8s 150:7.5s 230:7.5s 300:7.5s 480:7.5s 650:7.5s 740:7.7s 810:7.5s 895:7.9s

CPU vs CPU, normal level: 220 arena fights over 15 class pairs, both seats
  22 s. ended by KO 204, by the clock 16 (draws 0); average 320 s of play (the clock holds during hit-stop)
  fighters in scene 5: 426/440; still fighting 10 s after the stairs stood: 422; of those on the final platform at some point: 100.0% (both fighters of a fight: 100.0% of 211)
  opening ceremony: 8.6 s on average, 9.6 s at the most (the sheet: first 15 s); the computer picked comet 20%, hare 20%, phoenix 22%, serpent 18%, tortoise 21%; two fighters on one constellation: 0
  fighters lifted onto the final platform by a pause timeout: 0
  hazards dealt 15.3% of all damage (219894 of 1434448)

CPU vs CPU, hard level: 300 fights per class pair (±6%)
  261 s. Sword-Mace 54%, Sword-Tank 48%, Sword-Attacker 50%, Sword-Fighter 54%, Mace-Tank 41%, Mace-Attacker 55%, Mace-Fighter 44%, Tank-Attacker 52%, Tank-Fighter 54%, Attacker-Fighter 47%
  fair: every pair within 41-55% (target 35-65%)

determinism: the first 6 fights replay identically

ok: all arena checks passed (scenes: ARRIVAL > HEATWAVE > GROUND FRACTURE > VOLCANIC WARNING > ELEVATED FINAL ARENA)
exit 0

$ npx tsx scripts/balance.ts 200
win rate of row vs column (hard CPU, default kits, 200 matches each) · avg round length
         Sword     | Mace      | Tank      | Attacker  | Fighter  
Sword     51% 23s |  55% 23s |  59% 29s |  39% 18s |  51% 25s
Mace      49% 22s |  55% 23s |  56% 28s |  44% 19s |  51% 24s
Tank      40% 29s |  44% 29s |  51% 40s |  56% 26s |  58% 30s
Attacker  58% 19s |  54% 19s |  45% 26s |  51% 16s |  43% 20s
Fighter   56% 24s |  55% 24s |  39% 30s |  59% 20s |  41% 25s
pairs (400 matches each, ±2.5%): Sword-Mace 53%, Sword-Tank 60%, Sword-Attacker 41%, Sword-Fighter 48%, Mace-Tank 56%, Mace-Attacker 45%, Mace-Fighter 48%, Tank-Attacker 56%, Tank-Fighter 60%, Attacker-Fighter 42%
fair: every pair within 41-60%

stat line vs all-70 (200 kits, 2 matches each): one stat at 100, the other four ~62
STR 53%  ·  DUR 52%  ·  SPD 55%  ·  AGI 50%  ·  IQ 50%
ok: every stat line within 45-62%
exit 0

balance diff vs main: empty (identical)
```

### Part C

```
$ npx tsc --noEmit
exit 0

$ npm run lint

> inkfight@0.1.0 lint
> eslint

exit 0

$ npx tsx scripts/check-sim.ts
check-sim: all good
exit 0

$ npx tsx scripts/arena.ts
weakest fighter (AGI 40, SPD 40): jump apex 106.3 px, 34 ticks in the air, 102 px sideways at walking speed

scene 1-4: the floor (tick 0, 0 s, lava y 540)
200 |||                                                                                          |||
220 |||                                                                                          |||
240 |||                                                                                          |||
260 |||                                                                                          |||
280 |||                                                                                          |||
300 |||                                                                                          |||
320 |||                                                                                          |||
340 |||                                                                                          |||
360 |||                                                                                          |||
380 |||                                                                                          |||
400 |||                                                                                          |||
420 |||                                                                                          |||
440 |||                                                                                          |||
460 |||                                                                                          |||
480 |||##########################################################################################|||
500 |||                                                                                          |||
520 |||                                                                                          |||

scene 4, 5 s before the stairs: dust where they will rise (tick 8760, 146 s, lava y 540)
200 |||                                                                                          |||
220 |||                                                                                          |||
240 |||                                                                                          |||
260 |||                                                                                          |||
280 |||                                                                                          |||
300 |||                                                                                          |||
320 |||                                                                                          |||
340 |||                                                                                          |||
360 |||                                                                                          |||
380 |||                                                                                          |||
400 |||                                                                                          |||
420 |||                                                                                          |||
440 |||                                                                                          |||
460 |||                                                                                          |||
480 |||######::::::::#############################################################::::::::#######|||
500 |||          1                                                                    2          |||
520 |||                                                                                          |||

scene 5, step 1 rising (tick 9030, 151 s, lava y 539)
200 |||                                                                                          |||
220 |||                                                                                          |||
240 |||                                                                                          |||
260 |||                                                                                          |||
280 |||                                                                                          |||
300 |||                                                                                          |||
320 |||                                                                                          |||
340 |||                                                                                          |||
360 |||                                                                                          |||
380 |||                                                                                          |||
400 |||                                                                                          |||
420 |||                                                                                          |||
440 |||      ========                                                             ========       |||
460 |||          1                                                                    2          |||
480 |||################:::::::############################################:::::::################|||
500 |||                   3                                                  4                   |||
520 |||~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~|||

scene 5, steps 1 up, 2 and the final platform warn (tick 9200, 153 s, lava y 535)
200 |||                                                                                          |||
220 |||                                                                                          |||
240 |||                                                                                          |||
260 |||                                                                                          |||
280 |||                                                                                          |||
300 |||                                                                                          |||
320 |||                                                                                          |||
340 |||                =======                                            =======                |||
360 |||                   3                                                  4                   |||
380 |||                                                                                          |||
400 |||      ========                                                             ========       |||
420 |||          1                                                                    2          |||
440 |||                                                                                          |||
460 |||                                                                                          |||
480 |||########################::::::::::::::::::::::::::::::::::::::::::########################|||
500 |||                                             5                                            |||
520 |||~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~|||

scene 5, everything up (tick 9420, 157 s, lava y 530)
200 |||                                                                                          |||
220 |||                                                                                          |||
240 |||                                                                                          |||
260 |||                                                                                          |||
280 |||                        ==========================================                        |||
300 |||                                             5                                            |||
320 |||                                                                                          |||
340 |||                =======                                            =======                |||
360 |||                   3                                                  4                   |||
380 |||                                                                                          |||
400 |||      ========                                                             ========       |||
420 |||          1                                                                    2          |||
440 |||                                                                                          |||
460 |||                                                                                          |||
480 |||##########################################################################################|||
500 |||                                                                                          |||
520 |||~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~|||

5:00, lava at its highest (tick 18000, 300 s, lava y 315)
200 |||                                                                                          |||
220 |||                                                                                          |||
240 |||                                                                                          |||
260 |||                                                                                          |||
280 |||                        ==========================================                        |||
300 |||~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~5~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~|||
320 |||~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~|||
340 |||~~~~~~~~~~~~~~~~=======~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~=======~~~~~~~~~~~~~~~~|||
360 |||~~~~~~~~~~~~~~~~~~~3~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~4~~~~~~~~~~~~~~~~~~~|||
380 |||~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~|||
400 |||~~~~~~========~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~========~~~~~~~|||
420 |||~~~~~~~~~~1~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~2~~~~~~~~~~|||
440 |||~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~|||
460 |||~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~|||
480 |||##########################################################################################|||
500 |||~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~|||
520 |||~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~|||

layout asserts
  rises <= 69.1 (staircase: 66, 66, 133, 133), gaps <= 70.0, final platform 420 px wide (380 needed), 200 px up. ok

the climb pause with the real sim (nobody fights; both fighters are computer-driven):
  AGI 40 / SPD 40: 65:8.2s 100:8.1s 150:10.7s 230:7.6s 300:9.9s 480:9.3s 650:9.8s 740:7.5s 810:10.7s 895:8.2s
  AGI 100 / SPD 100: 65:7.8s 100:7.8s 150:7.9s 230:7.7s 300:7.7s 480:7.7s 650:7.7s 740:7.7s 810:7.9s 895:7.8s
  AGI 70 / SPD 40: 65:7.9s 100:7.8s 150:7.5s 230:7.5s 300:7.5s 480:7.5s 650:7.5s 740:7.7s 810:7.5s 895:7.9s

CPU vs CPU, normal level: 220 arena fights over 15 class pairs, both seats
  22 s. ended by KO 204, by the clock 16 (draws 0); average 320 s of play (the clock holds during hit-stop)
  fighters in scene 5: 426/440; still fighting 10 s after the stairs stood: 422; of those on the final platform at some point: 100.0% (both fighters of a fight: 100.0% of 211)
  opening ceremony: 8.6 s on average, 9.6 s at the most (the sheet: first 15 s); the computer picked comet 20%, hare 20%, phoenix 22%, serpent 18%, tortoise 21%; two fighters on one constellation: 0
  fighters lifted onto the final platform by a pause timeout: 0
  hazards dealt 15.3% of all damage (219894 of 1434448)

CPU vs CPU, hard level: 300 fights per class pair (±6%)
  261 s. Sword-Mace 54%, Sword-Tank 48%, Sword-Attacker 50%, Sword-Fighter 54%, Mace-Tank 41%, Mace-Attacker 55%, Mace-Fighter 44%, Tank-Attacker 52%, Tank-Fighter 54%, Attacker-Fighter 47%
  fair: every pair within 41-55% (target 35-65%)

determinism: the first 6 fights replay identically

ok: all arena checks passed (scenes: ARRIVAL > HEATWAVE > GROUND FRACTURE > VOLCANIC WARNING > ELEVATED FINAL ARENA)
exit 0

$ npx tsx scripts/balance.ts 200
win rate of row vs column (hard CPU, default kits, 200 matches each) · avg round length
         Sword     | Mace      | Tank      | Attacker  | Fighter  
Sword     51% 23s |  55% 23s |  59% 29s |  39% 18s |  51% 25s
Mace      49% 22s |  55% 23s |  56% 28s |  44% 19s |  51% 24s
Tank      40% 29s |  44% 29s |  51% 40s |  56% 26s |  58% 30s
Attacker  58% 19s |  54% 19s |  45% 26s |  51% 16s |  43% 20s
Fighter   56% 24s |  55% 24s |  39% 30s |  59% 20s |  41% 25s
pairs (400 matches each, ±2.5%): Sword-Mace 53%, Sword-Tank 60%, Sword-Attacker 41%, Sword-Fighter 48%, Mace-Tank 56%, Mace-Attacker 45%, Mace-Fighter 48%, Tank-Attacker 56%, Tank-Fighter 60%, Attacker-Fighter 42%
fair: every pair within 41-60%

stat line vs all-70 (200 kits, 2 matches each): one stat at 100, the other four ~62
STR 53%  ·  DUR 52%  ·  SPD 55%  ·  AGI 50%  ·  IQ 50%
ok: every stat line within 45-62%
exit 0

balance diff vs main: empty (identical)
```

## 4. What I could NOT verify

- A real phone, a second real device over the relay, a gamepad, the sound by ear, 60 fps on a mid phone. The screenshots are real Renderer frames of
  computer-played fights in headless Chromium (desktop 960 x 540 and a 390 px phone canvas), not the app on a device.
- A human climbing under a pause (the computer does it from every start; a person has to find the stairs: the headline, the marks and the arrows say where).

## 5. How to test it by hand

1. `/play/cpu?arena=inferno` (or Fight a friend → Arena 1). At 2:30 on the clock (scene 5) the fight stops: "GET UP THERE!". Walk and jump (A / D / W, or the
   stick) up the stairs as they rise; the punch, kick, guard and special buttons do nothing now. Stand on the final platform: your tag turns ✓; when both are up
   the headline goes and "FIGHT!" shows. Stay on the floor for 25 s: you are lifted up.
2. Quick look without playing 2:30: `node scripts/shots-7b/run.mjs <out dir> <specs.json> [W H DPR]` draws the frames (see the header of that file).
