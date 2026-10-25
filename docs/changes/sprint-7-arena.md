# Sprint 7: Arena 1, Inferno Crater (branch `sprint-7-arena`)

Branched from `origin/main` (`524ad90`). Nothing pushed to `main`, nothing deployed, no new dependency, no migration. I did not touch
`src/game/relay.ts`, `src/app/api/rooms/**`, or the transport in `src/game/useGameRoom.ts` (three lines there: the `mode` parameter, the lobby
field and the `createMatch` option; plus `mode` in the result report, see decision 17).

**Two things in the request disagree, and I followed the chat message:** `docs/tasks/arena-1.md` says arena fights are *not recorded*; the
message that started this task says "arena results go through /api/battles like normal online fights". They are recorded (a draw is not:
the table needs a winner). One constant, `RECORD_ARENA` in `src/app/api/battles/route.ts`, turns it off. Also, the spec and storyboard are
at `docs/design/arena-1/spec.md` and `storyboard.png` on `main` (the task text names the older upload name).

## 1. What changed

A new mode next to the best-of-3: **one fight of 5:00 on a volcanic floor that escalates through five scenes**, vs the computer (`/play/cpu`)
and online (the room creator picks it). `createMatch(a, b, inputs, { arena: "inferno" })` is the only way in; without it nothing runs.
**A normal match is unchanged:** `check-sim` hashes every snapshot of three scripted fights against a value taken on `main` before the change,
and `npx tsx scripts/balance.ts 200` prints byte-for-byte what it printed on `main` (diff in section 3).

**Simulation (`src/game/arena.ts`, new; hooks in `src/game/sim.ts`, constants in new `src/game/space.ts`)**
- *Scenes on the match clock* (the existing `Match.timer`, which only runs in the fight phase): Arrival 0:00, Heatwave 0:30, Ground Fracture
  1:00, Volcanic Warning 1:45, Elevated Final Arena 2:30, end 5:00. A scene change emits an `arena` event and changes nothing else: no
  pause, no input lock.
- *State* is `Match.arena` (`ArenaState`: live cracks, meteors, the next spawn ticks, env damage totals, the 10-second damage buckets,
  weakness, timers). It goes into every `Snapshot` (about 230 bytes, asserted under 600). Platforms and lava are pure functions of the tick
  (`platformsAt(tick)`, `lavaY(tick)`), so they cost nothing on the wire and a relay snapshot that is skipped loses nothing. One-shot cues go
  through the sim's rolling event list (`GameEvent` `type: "arena"`; it keeps the last 16), as before.
- *Hazards* act in `arenaStep(m)`, called from `step()` after the fighters and only while `phase === "fight"`: a knockout earlier in the tick
  has already ended the fight, and `endRound` empties the hazard lists, so nothing lands after it.
- *Physics hooks:* the floor lookup (`arenaSurface`: floor or the highest platform top crossed this tick, swept from the previous feet so a fall of
  any speed can't tunnel), the scene-5 jump / air-control boost, the drop-through, the hit-lock pin staying on a platform (`pinned`), and the
  weakness and matchup trim on damage (`applyHit`). Rolls come from `roll(m, salt)`: no `Math.random`, no `Date`.
- *Match rules:* one round (`timer = 18000`), the health pool is ×`hpMul`, a knockout ends it at once, at 5:00 the higher health wins,
  equal health is a draw (`matchWinner: null`), then `roundEnd` (2.5 s) → `matchEnd`. `resumeMatch` restores the arena from the snapshot.

**CPU (`src/game/arenaNav.ts`, new; `src/game/cpu.ts`)**: `cpuThink` first lets `arenaNav` take over movement when it must: step out of a crack
zone once it glows (and the margin round it) and out of a meteor marker; in scene 5 climb. The climb is a breadth-first search over the platforms
that stand, where an edge A → B exists if a jump planned with the fighter's own `deriveDef` numbers (the plan replays the sim's jump physics:
standing takeoff, then a burst of air control) lands on B with 6 px to spare at ±4 px of takeoff error. Then the normal fight logic runs, and
`guardEdges` stops it walking off a platform. The weakest jumper (AGI 40 / SPD 40) climbs from every start x in `scripts/arena.ts`.

**Look (`src/game/arenaRender.ts`, new; `src/game/render.ts`)**: all procedural, comic-ink (heavy outlines, charcoal rock, molten orange):
sky per scene, a big volcano whose glow, lava streaks, plume and (scene 5) fountain grow, far spires, a lava river, tall jagged cliffs both
sides, the floor slab with glowing seams, floating rocks on chains with parallax (live), crack zones (flat glowing patches on the floor strip,
hazard-hatched while harmless), meteors with a growing marker and a falling rock, dust ring and hopping pebbles where a boulder will rise,
the boulders (strata, lit top slab, seams that heat up), the rising lava (live wave edge, bubbles), embers and ash (capped at 36, 14 with
"Reduce flashes"), a heat shimmer from scene 2. The five backdrops are baked once to offscreen canvases (at most three kept; the next one is
baked 1.5 s into the current scene) and crossfaded over 2 s. Camera: both fighters in frame with room under the HUD, zooming out to 0.8 and
looking up when one is on a platform; a special's push-in and the KO keep priority. HUD: paper plates under the names and clock (the backdrop is
busy), a `m:ss` clock with the scene name, a stamped tag for 3 s at each scene change, red warning tags (`GROUND CRACKING`, `METEOR
INCOMING`, `THE GROUND SHAKES`, `LAVA ON THE FLOOR`), health as a percentage, `SCORCHED -n% DMG` while weakened, a drop-down tip at the
start of scene 5. Tremors: the last 5 s of scene 3, the last 8 s of scene 4, boulders warning and rising, the eruption.
"Reduce flashes" scales shake, embers and the shimmer. Sound (`src/game/sound.ts`): `rumble`, `crack`, `meteor`, `impact`, `grind`,
`eruption`, `hiss`.

**Modes and UI:** `/play/cpu` has a Mode step ("Normal fight" / "Arena: Inferno Crater (5 min)", also `?arena=inferno`); `RoomStart` (the Fight
page and home) has the same switch above "Create room"; the choice is kept per room code in this browser (`src/components/roomMode.ts`) so the
host can leave to scan a fighter and come back. The mode travels in the lobby (`Lobby.mode` in `src/game/protocol.ts`), so the guest sees it
too. `Versus` shows "Arena 1" / "5:00" and a banner; `ResultPanel` shows health left, hazard damage, "TIME!" and a **Draw** result.

**Tests:** `scripts/check-sim.ts` (arena block), `scripts/arena.ts` (new).

Files: `src/game/{space,arena,arenaNav,arenaRender}.ts` (new), `src/game/{sim,cpu,render,sound,protocol,useCpuMatch,useGameRoom}.ts`,
`src/app/api/battles/route.ts`, `src/app/play/cpu/{CpuClient,page}.tsx`, `src/app/play/[code]/RoomClient.tsx`,
`src/components/{ResultPanel,RoomStart,Versus,roomMode}.ts(x)`, `scripts/{arena,check-sim}.ts`, `docs/design/arena-1/` (from `main`).

## 2. Decisions (everything the spec left open, with the values chosen)

All of it is one table, `ARENA_TUNE` in `src/game/arena.ts`.

1. **2D side view stays.** The spec (section 5) recommends a depth axis, and the sheet says not to: the sim, the snapshots and the netcode are
   one horizontal axis plus a jump, and a depth axis would change every hitbox, the CPU, the renderer and the wire format for no gameplay the
   five scenes need. Verticality comes from platforms.
2. **Health pool ×18 (`hpMul`).** A normal fight is over in about 25-30 s (CPU, hard), which never reaches scene 3. With ×18 a CPU fight
   plays for about 5 minutes (12 of 220 end on the clock), so the scenes are seen. Every hit counts the same relative to the pool, so class
   balance is nearly unchanged (see 14). The HUD shows percent. The clock stops during hit-stop and the KO slow-motion, exactly as a normal round's
   does, so 5:00 of clock is slightly more than 5:00 on a wall clock.
3. **Platforms are one-way** (jump up through, land on top), for every platform, with **S + jump to drop** (hold block, press jump; on a phone:
   hold the BLOCK button and flick the stick up). Solid platforms would need side collision, push-out and ceiling rules; one-way can't trap
   or crush anyone. Platform support is the fighter's centre x in `[x, x+w]`. A rock that rises under a fighter lifts them (carried, never crushed).
4. **Staircase** (mirrored; every rise 66-67 px against 69 for the weakest jumper, whose apex is 106 px; gaps 10-15 px; steps 70-80 px wide):
   floor → step 1 (top 414, x 95-175) → step 2 (top 347, x 190-260) → final platform (top 280 = 200 px above the old floor, x 270-690, 420 wide;
   the longest melee reach is 120, so two fighting distances are 380). The mirror is x → 960 − x.
5. **Rising boulders:** warning (dust ring, hairline cracks, hopping pebbles, rumble) 5 s ahead for the first steps, 3 s for the rest, rise in
   1 s (the final platform 1.5 s): steps 1 at 2:30, steps 2 at 2:38, the final platform at 2:47; everything stands by 2:48.
6. **Lava** starts under the floor at scene 5 and rises 0.025 px per tick (1.5 px/s): it reaches the floor at 3:10 (the stairs have stood
   22 s), step 1 at 3:54, step 2 at 4:38, and ends at 5:00 35 px *below* the final platform top, which it never reaches.
7. **Falling into lava / lava on the floor:** damage every 0.5 s (1.2% of the pool) and weakness; after 1.25 s in lava in a row the fighter is
   set on the nearest platform whose top is 30+ px above the lava and has 2 s of immunity to lava and cracks (event `rescue`, "BACK UP!").
   No instant knockout and nothing at 5:00 beyond the health rule.
8. **Environment damage never knocks anyone out** (it stops at 1 HP) and is capped at 8% of the pool per fighter in any 10 seconds
   (11 one-second buckets, so any 600-tick window is covered). A launch near an edge can't loop someone in lava.
9. **Weakness (lava and crack contact):** each damage tick makes the fighter's hits 4% weaker, capped at 25%; it wears off at 25%/4 s after
   1.5 s out of contact. Nobody is ever more than 25% down and it always fades.
10. **Heat (scene 2):** both fighters lose 0.4% of the pool every 2.5 s (about 5% over the scene), the same for both. Small, symmetrical, capped.
11. **Cracks (scene 3):** at most **2** zones at once (the sheet's number; the message said 2-3); a zone glows 1.67 s (harmless, hatched) then leaks
    7 s; never within 90 px + body of a fighter or 60 px of another zone; a safe strip of 200 px always remains (the zones are at most 70 px
    wide, so 84% of the floor is clear, and the weakest jumper clears 70 px in the air); a new one every 9 s down to every 4 s through the scene, wider
    (50 → 70 px) and hotter (0.6% → 1.0% per 0.5 s).
12. **Meteors (scene 4):** marker 1.4 s ahead (message: 1.2 s, sheet: 1 s), radius 44 px (+20 px for the body), 2.5% of the pool, a small knock, at
    most 2 at once, impacts at least 220 px and 0.5 s apart (so never two on the same 200 px), none in the last 5 s of the scene (the staircase warns
    then), and a blast that would hit both fighters hurts only the nearer one. A fighter 90+ px up in the air is not hit.
13. **Scene-5 boost:** jump ×1.12 and air control ×1.5, for the whole scene. The staircase is built without it (asserted).
14. **Matchup trims.** The long fight pushes some matchups off (Tank over Fighter, Sword over Tank, both 15 points further than in the normal
    mode) and class factors alone can't fix a circle, so `ARENA_TUNE.matchup` trims damage per matchup (the largest are 0.928 Tank vs Fighter and
    0.96 Sword vs Tank, 1.069 Sword vs Attacker). Found with `npx tsx scripts/arena.ts --tune`. Normal fights have none.
15. **Draw on equal health** at 5:00 (`matchWinner: null`): the result panel says Draw, nothing is recorded. A knockout always wins.
16. **Constellations / plausibility are not in the game:** not built, no UI. The hook is `FighterDef.lavaResist` (optional, unused, unset).
17. **Recording:** online arena fights go through `/api/battles` like any online fight (see the top). The host's report carries `mode`; the
    battle's log says `arena-inferno` and its `wins` are 1-0. The share card (`/battle/[id]`) draws a result with no best-of-3 score as 2-0, so an
    arena win shows "2-0" there; the result overlays don't offer a share button for arena fights. CPU fights are never recorded.
18. **Hit-lock on a platform:** the pin in front of the attacker is kept on the platform (`arenaClampX`), so an ultimate can't pull the victim off.

## 3. Gate output

Local Postgres as in `MEMORY.md` (system PostgreSQL 16, dummy `AUTH_SECRET`); `npm ci`, `prisma generate`, `prisma migrate deploy` and `next typegen` first.

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

$ npx tsx scripts/check-stats.ts
check-stats: all good {
  bare: {
    fill: 0.1364685908319185,
    aspect: 0.3064516129032258,
    stance: 0.23870967741935484,
    armSpread: 0.3032258064516129,
    colors: [ 'black' ],
    item: 'nothing',
    penWidth: 5.653679653679653
  },
  shield: 'shield',
  thickW: 10.338589981447123,
  thinW: 3.2944120100083403
}
check-gemini: all good Ink-ame-hameha
exit 0

$ npx tsx scripts/check-stick.ts
check-stick: all good
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

$ npx tsx scripts/dungeon.ts
floor  boss                    clear   target   (100 matches each, normal CPU as the player, 5 classes)
    1  Smudge                    80%     85%
    2  Cinder Knuckle            74%     78%
    3  Volt Nib                  64%     70%
    4  Whiteout                  62%     62%
    5  Prince Vellum             49%     54%
    6  Dawnstroke                37%     46%
    7  Ferrule                   38%     38%
    8  Hardcover Atlas           29%     30%
    9  Asymptote                 15%     22%
   10  The Redline Regent        20%     15%
curve: falls floor by floor
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
480 |||##########################################################################################|||
500 |||                                                                                          |||
520 |||~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~|||

scene 5, steps up, final platform warning (tick 9900, 165 s, lava y 518)
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
500 |||~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~5~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~|||
520 |||~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~|||

scene 5, everything up (tick 10140, 169 s, lava y 512)
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
500 |||~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~|||
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

climbing with the real sim (AGI 40 / SPD 40, nobody to fight):
  AGI 40 / SPD 40: 65:1.9s 100:1.7s 150:1.4s 230:1.1s 300:1.6s 480:2.8s 650:3.7s 740:4.2s 810:4.6s 895:5.1s
  AGI 100 / SPD 100: 65:1.7s 100:1.6s 150:1.5s 230:1.3s 300:1.1s 480:0.7s 650:1.1s 740:1.3s 810:1.5s 895:1.7s
  AGI 70 / SPD 40: 65:2.4s 100:2.3s 150:2.0s 230:1.6s 300:1.3s 480:0.5s 650:1.3s 740:1.7s 810:2.0s 895:2.4s

CPU vs CPU, normal level: 220 arena fights over 15 class pairs, both seats
  51 s. ended by KO 208, by the clock 12 (draws 0); average 300 s of play (the clock holds during hit-stop)
  fighters in scene 5: 428/440; still fighting 10 s after the stairs stood: 400; of those on the final platform at some point: 100.0% (both fighters of a fight: 100.0% of 200)
  hazards dealt 17.9% of all damage (257387 of 1434510)

CPU vs CPU, hard level: 100 fights per class pair (±10%)
  210 s. Sword-Mace 38%, Sword-Tank 48%, Sword-Attacker 50%, Sword-Fighter 51%, Mace-Tank 57%, Mace-Attacker 47%, Mace-Fighter 41%, Tank-Attacker 56%, Tank-Fighter 46%, Attacker-Fighter 52%
  fair: every pair within 38-57% (target 35-65%)

determinism: the first 6 fights replay identically

ok: all arena checks passed (scenes: ARRIVAL > HEATWAVE > GROUND FRACTURE > VOLCANIC WARNING > ELEVATED FINAL ARENA)
exit 0

$ npx next build
▲ Next.js 16.3.8 (Turbopack)
✓ Running next.config.ts took 34ms

  Creating an optimized production build ...
✓ Compiled successfully in 31.0s
  Running TypeScript ...
  Finished TypeScript in 11.6s ...
  Collecting page data using 3 workers ...
  Generating static pages using 3 workers (0/22) ...
  Generating static pages using 3 workers (5/22) 
  Generating static pages using 3 workers (10/22) 
  Generating static pages using 3 workers (16/22) 
✓ Generating static pages using 3 workers (22/22) in 568ms
  Finalizing page optimization ...

Route (app)
┌ ƒ /
├ ƒ /_not-found
├ ƒ /admin
├ ƒ /api/admin/buff
├ ƒ /api/battles
├ ƒ /api/battles/lookup
├ ƒ /api/characters
├ ƒ /api/characters/[id]
├ ƒ /api/characters/[id]/image
├ ƒ /api/dungeon/clear
├ ƒ /api/leaderboard
├ ƒ /api/rooms/[code]
├ ƒ /api/rooms/[code]/answer
├ ƒ /api/server-info
├ ƒ /api/turn
├ ƒ /api/uploads/[file]
├ ƒ /battle/[id]
├ ƒ /battle/[id]/opengraph-image
├ ƒ /boss-art/[floor]
├ ƒ /build
├ ƒ /card
├ ƒ /character/[id]
├ ƒ /create
├ ƒ /demo
├ ƒ /forgot
├ ƒ /gallery
├ ƒ /home
├ ƒ /leaderboard
├ ƒ /login
├ ○ /manifest.webmanifest
├ ƒ /play
├ ƒ /play/[code]
├ ƒ /play/cpu
├ ƒ /play/dungeon
├ ƒ /player/[id]
├ ƒ /pwa-icon/[size]
├ ƒ /security
├ ƒ /share
└ ƒ /signup


○  (Static)   prerendered as static content
ƒ  (Dynamic)  server-rendered on demand

exit 0
```

`balance.ts 200` against `main` before the change: `diff` of the two outputs is empty (the baseline run is `arena-base-balance.txt`, taken on
`524ad90` before any edit): empty (`BALANCE-IDENTICAL`), pairs 41-60%, lines 47-55%, as on `main`.

## 4. What I could NOT verify

- **A real phone, a real second device, a gamepad, and the sound by ear.** What I did instead: the Renderer drew the arena at 960 x 540 and at a
  390-px canvas (device scale 3) in headless Chromium for scenes 1-5 (the screenshots informed the look; I fixed a backdrop that covered the sky, HUD text that
  was unreadable on the dark scenes, a crack drawn as a floating shield, heads under the HUD); the real app ran in two Chromium contexts (host + guest, two
  accounts, a room created in arena mode, the guest saw "Arena 1 · Inferno Crater" from the lobby, both readied and played the first seconds with no
  console error); `/play/cpu?arena=inferno` set the radio, the face-off and the label. Not seen: a whole 5-minute fight in the real UI
  (the offline harness drew snapshots of CPU fights at chosen ticks), the scene-change crossfade as motion, 60 fps on a mid phone (the live layers
  are a few dozen paths and one or two `drawImage` calls per frame; it was not measured), meteors falling and boulders rising as animation, any sound.
- Two real devices over the relay: the arena state is in the snapshot and replays identically after `resumeMatch` (asserted), but a relayed arena fight
  (15 snapshots/s) was not run.
- The climb with a *human* (the CPU reaches the final platform in all the runs; a person has to find the stairs: the warning tags and dust say where).
- Class balance is CPU vs CPU only, and the hard CPU is the one the trims were fitted on.
- A draw, a timeout and a KO result were exercised in the sim, not in the result overlay in a browser.

## 5. How to test by hand

1. **vs computer:** `/play/cpu` (or `/play/cpu?arena=inferno`) → pick a fighter, "Arena: Inferno Crater (5 min)", an opponent → Fight. Keys as
   usual (A/D, W, S, J, K, L, S+L, U). To see a scene without waiting, use Hard (the CPU fights harder) or just stand back: the scenes run on the
   clock, so 0:30, 1:00, 1:45, 2:30 are the changes.
2. **What to look for, scene by scene:** 1 (clean twilight, calm) → 2 (warmer sky, heat shimmer rising off the floor, a tick of damage on both
   every 2.5 s) → 3 (orange fissures glow on the floor; a patch glows *hatched* for 1.7 s, then leaks: stand in it and you lose health and your hits
   weaken; it can't open under you) → 4 (red-black sky, ash, the volcano glows; a pulsing marker grows on the floor for 1.4 s, then a rock lands;
   in the last seconds the ground shakes and dust rings appear where boulders will rise) → 5 (eruption, the boulders come up one pair at a time,
   one side or the other is as near as the other; a rock rising under you lifts you; the jump is a bit easier; climb the stairs to the wide
   platform; lava rises below, floor first, then the steps).
3. **Drop down:** on a step, hold S and press W (phone: hold BLOCK, flick the stick up). You land on whatever is below.
4. **Lava rescue:** in scene 5 stay on the floor after 3:10: you take damage, then are put back on a platform with "BACK UP!".
5. **Online:** `/play` → pick "Arena 1" under Fight a friend → Create room → send the link. The friend's lobby shows the mode. Both press ready.
   (One browser + an incognito window works.) The same room with "Normal" is the old best-of-3.
6. **Timeout / draw:** the CPU fights run long; to see the clock end it, play Easy against a Tank and stall, or run
   `npx tsx scripts/arena.ts` and read the "by the clock" count. A draw needs exactly equal health, so it is only asserted in `check-sim`.
7. **Sound:** a rumble at 1:00 and 1:45, a crack when a zone appears, a whistle on a marker, a thud on impact, grinding stone when a boulder rises,
   a boom at 2:30. "Reduce flashes" (below the controls) tones the shake, embers and shimmer down.
