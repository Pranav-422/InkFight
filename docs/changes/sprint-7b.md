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

## 4. What I could NOT verify

- A real phone, a second real device over the relay, a gamepad, the sound by ear, 60 fps on a mid phone. The screenshots are real Renderer frames of
  computer-played fights in headless Chromium (desktop 960 x 540 and a 390 px phone canvas), not the app on a device.
- A human climbing under a pause (the computer does it from every start; a person has to find the stairs: the headline, the marks and the arrows say where).

## 5. How to test it by hand

1. `/play/cpu?arena=inferno` (or Fight a friend → Arena 1). At 2:30 on the clock (scene 5) the fight stops: "GET UP THERE!". Walk and jump (A / D / W, or the
   stick) up the stairs as they rise; the punch, kick, guard and special buttons do nothing now. Stand on the final platform: your tag turns ✓; when both are up
   the headline goes and "FIGHT!" shows. Stay on the floor for 25 s: you are lifted up.
2. Quick look without playing 2:30: `node scripts/shots-7b/run.mjs <out dir> <specs.json> [W H DPR]` draws the frames (see the header of that file).
