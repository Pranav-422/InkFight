# Sprint 5, part 2: boss passives, the Regent's second form, five new special kinds

Branch `sprint-5-part2`, built on 2026-10-25. It is `origin/sprint-5-dungeon` (part 1) with `origin/sprint-3-ultimates` and
`origin/sprint-4-online` merged in, plus part 2 of the Dungeon. Nothing was pushed to `main`, nothing was deployed.

## 1. What changed

### The merge (see "Merge notes" at the end for every conflict)
History in this order: part 1, the merge of Sprint 3, the merge of Sprint 4, then part 2 on top.
The full gate (including `scripts/dungeon.ts`) was run right after the merges: all green except the dungeon curve, which
Sprint 3's combat changes (ultimates, crits, tension) had bent (floors 1, 5 and 6 too hard; 7, 8 and 10 too easy); the re-tune below fixes that.

### Boss passives (`src/game/sim.ts`)
`createMatch(a, b, inputs, { boss })` is the only way a passive exists: `BossSpec { slot, passive, phase2? }` sets
`FighterDef.passive`. `deriveDef` never sets it, and `balance.ts` now asserts that 60 generated player kits and a plain
`createMatch` carry none. Each passive is implemented from `passive.rule` in `docs/research/v2/bosses.json`:

| Floor | Passive | Where in the sim | Telegraph in the renderer |
|---|---|---|---|
| 1 Smudge | **Afterimage**: the first hit on it while it walks misses, slide 60 px, 360-tick recharge | `applyHit` (before the dodge roll), `bossTick` | grey trail copy while ready |
| 2 Cinder Knuckle | **Heat Stacks**: 3 clean normal hits, the next sets FIRE; a blocked hit resets; fades in 90 ticks | `bossHits` (`applyHit`), `bossTick` | orange glow per stack, flames and embers at 3 |
| 3 Volt Nib | **Sheathed Draw**: still 20 ticks, the next chain opener lunges x3, hits x1.5, +12 recovery | `bossTick`, `updateFighter` (`Fighter.draw`) | blue sparks, white glow when lit |
| 4 Whiteout | **Whiteout Guard**: 3 blocked hits in 120 ticks burst the guard (attacker shoved 14 px/tick, FROST 60) | `bossHits` | cracks on the shield, mist and glow at 2 |
| 5 Prince Vellum | **Royal Pride**: below 40% HP energy x2 and every blast is followed by a second, 8 ticks later | `energyGain`, blast spawn, `Projectile.delay` | crown over the head, purple glow |
| 6 Dawnstroke | **Endless Dance**: a chain whose last blow lands clean restarts, no rest, twice at most; a block stalls it (+12) | move end in `updateFighter`, `bossHits` | gold floor trails |
| 7 Ferrule | **Pencil Case**: every 480 ticks a 50-tick weapon swap (mace, sword, shield) in which it can't act and takes x1.25; traits follow the weapon | `bossTick`, `traitCls`, `swapping` | "NEXT: weapon" label from tick 420, rummaging pose, the item in hand changes |
| 8 Hardcover Atlas | **Unbending Spine**: normal hits don't interrupt its wind-up (x0.8 damage); specials and launchers do | `applyHit` (`spine`) | thick dark outline during the wind-up |
| 9 Asymptote | **Infinite Margin**: projectiles x0.4 (blasts) or x0.6 (specials) unless it is reeling or mid-special; 90 ticks of crowding it (total) makes it blink 600 px after an 18-tick shimmer; a clean hit in the shimmer cancels | `applyHit`, `bossTick` | ruled grid, ink-blot ripple |
| 10 The Redline Regent | **Curse Marks**: each unblocked hit marks you (max 5, one fades per 120 ticks); five detonate: 16 flat damage + POISON 180 | `bossHits`, `bossTick` (`Fighter.marks`) | red tally strokes on the body, the fourth pulses |

### Floor 10's phase 2
The blow that would take the Regent under half health is clamped to leave it at exactly 100 HP (a big combo can't skip it).
Then: `m.defs[boss]` becomes the `phase2` kit (Sword, Street, BLEED, `remote_detonation`, DUR 80, same budget and cap), statuses
cleared, energy 50, the player's marks cleared, both pushed to 300 px apart, projectiles and hazards removed, `freeze` 40 and a
`phase` event (class and item, so the renderer changes the look; the banner reads THE MARGIN TEARS, the page tints red). Its
passive becomes **Red Margin Lines** (a 40 px ruled line is drawn at your feet every 240 ticks and cuts 45 ticks later for 12
and BLEED if you are still on it and grounded: `Match.hazards`, `step`); the Curse Marks keep counting. Every round starts in
the first form again (`resetRound`). A burn that carries the boss under half health triggers it too (`tickStatus`). The CPU
switches to the form's knobs (`bossKnobs(run, m.boss.phase)`).

### Five new special kinds
Sim, pose, FX, `SPECIAL_TUNE` entry and a place in the specials pass for each (they are in `SPECIAL_KINDS`, so every kit
generator and tuner uses them; `BASE_KINDS` are the twelve the AI and the offline generator may pick):
- **shatter** (floor 2): a grab, reach 60 px, startup 12 / active 4 / recovery 30; ignores a guard (`opts.unblock`), misses anyone airborne.
- **counter** (floor 4): a 24-tick stance; a melee hit that lands in it does nothing and is answered at once for 1.5x; projectiles go through; a whiff recovers for 30 ticks (54 total). The CPU only takes the stance when a swing is coming.
- **dash_slash** (floor 6): 220 px straight through the opponent in 8 ticks (they don't push each other apart), one hit, and it turns round on the far side.
- **pull** (floor 8): a slow hook (range 300 px); an unblocked hit drags the target to 80 px in front and steals 25 energy. Blockable.
- **remote_detonation** (floor 10): marks the opponent's x; 40 ticks later a 40 px column cuts there (`Hazard`, kind `cut`); blockable; moving away dodges it.
All five also work as ultimates (shatter, dash_slash locks as melee; pull and the detonation lock like projectile ultimates; a counter ultimate locks on its answer).

### Unlocks (the other half of the rewards)
- Floors 2, 4, 6, 8, 10 unlock shatter, counter, dash_slash, pull, remote_detonation (`UNLOCK_FLOOR` in `moves.ts`).
- The odd floors unlock a named, element-tinted variant of an existing kind (`VARIANTS` in `dungeon.ts`, from the data's `element_variant` rewards): Smudge Step (teleport, BLEED), Static Crescent (slash, ELECTRIC), Crown Pressure Beam (beam, GRAVITY), Compass Needle Volley (arrow, POISON), Stillwater Orb (orb, FROST). A variant is its kind plus its element and its own name.
- `POST /api/characters` refuses a locked `pick_special`, `pick_ult` or `pick_variant` with 403 (`lockedReason`, `clearedFloors` in `src/lib/dungeonProgress.ts`; admins have every floor). `/build` and the upload panel list only what the player has cleared, with a link to the Dungeon.

### Re-tune
Full tune (`balance.ts --tune 160 specials,styles,skills,ult,lines,classes`), then `specials,ult,lines,classes` again after the pull change,
then `scripts/dungeon.ts --tune 120`. The dungeon script plays the boss with its passive, per-form knobs and second form.
Budgets in `src/game/dungeon.ts`: `[350, 311, 327, 354, 297, 320, 331, 304, 328, 330]`.

## 2. Decisions the spec left open
- **Passives are data on the def, state in `Fighter.pv`** (a plain record named by passive), so a snapshot stays JSON and the renderer can read it; marks live on the *player* (`Fighter.marks`), where the tally is drawn.
- **Iron Reel's damage.** The data says "light damage"; at 0.8x it needed more than the tuner's maximum factor (the drag and the steal are rarely worth a hit against the CPU), so its base is 3.0x and the tuned factor is 1.2. The grab and the 25-energy steal are as specified.
- **`cpu.special` (0.95) in the phase-2 data has no matching knob** and is ignored; the other knobs (react 4, block 0.8, aggro 0.9, dodge 0.88, think 3) apply.
- **A pencil-case swap changes traits, not the move set**: Mace trait (armor break, +6 stun), Sword reach (+20 px on the punch chain) or Tank block (0.7); the chains, stats and `CLASS_TUNE` stay the Mace's, as the data says.
- **Endless Dance** restarts the chain with the same button type that ended it, and counts only clean last blows.
- **The Regent's budget.** Sprint 3 changed combat enough that most budgets moved a little (part 1's `[369, 301, 332, ...]` became the list above; floor 1 is now the plain 350). The Regent (330) is the one whose edge is almost entirely the passive and its second form.
- **A stale cache bug found by the tuner:** `bossRun` caches the second form's stats, so its budget was frozen at the first call while the tuner changed the floor's; floor 10 tuned to a budget of 245 and played at 88% afterwards. It now refreshes the budget on each call.
- **The AI never picks locked kinds**: `BASE_KINDS` feed the vision schema and prompt, so only a player (with the floors cleared) can choose the five new ones.
- **Client-reported clears** are unchanged from part 1 (`shortcut:` in the route), so the unlocks are only as honest as the client; they only add PvP-balanced moves.

## 3. Gate output (final commit before this file)

Local Postgres: the system PostgreSQL 16 (`pg_ctlcluster 16 main start`), both `DATABASE_URL*` pointed at it, a dummy `AUTH_SECRET`;
all 13 migrations (including `dungeon_floor` and `ultimate`) applied to the database with `prisma migrate deploy`.

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
Sword     56% 22s |  54% 23s |  59% 28s |  45% 19s |  41% 24s
Mace      40% 22s |  50% 24s |  52% 29s |  45% 19s |  44% 24s
Tank      42% 28s |  52% 28s |  47% 38s |  56% 26s |  57% 29s
Attacker  58% 19s |  55% 19s |  47% 26s |  51% 16s |  44% 20s
Fighter   55% 24s |  56% 24s |  39% 29s |  55% 20s |  49% 25s
pairs (400 matches each, ±2.5%): Sword-Mace 57%, Sword-Tank 59%, Sword-Attacker 44%, Sword-Fighter 43%, Mace-Tank 50%, Mace-Attacker 45%, Mace-Fighter 44%, Tank-Attacker 55%, Tank-Fighter 59%, Attacker-Fighter 45%
fair: every pair within 41-59%

stat line vs all-70 (200 kits, 2 matches each): one stat at 100, the other four ~62
STR 48%  ·  DUR 51%  ·  SPD 52%  ·  AGI 47%  ·  IQ 55%
ok: every stat line within 45-62%
exit 0

$ npx tsx scripts/dungeon.ts 120
floor  boss                    clear   target   (120 matches each, normal CPU as the player, 5 classes)
    1  Smudge                    84%     85%
    2  Cinder Knuckle            75%     78%
    3  Volt Nib                  67%     70%
    4  Whiteout                  59%     62%
    5  Prince Vellum             53%     54%
    6  Dawnstroke                43%     46%
    7  Ferrule                   36%     38%
    8  Hardcover Atlas           34%     30%
    9  Asymptote                 19%     22%
   10  The Redline Regent        14%     15%
curve: falls floor by floor
exit 0

$ npx next build
▲ Next.js 16.3.8 (Turbopack)
✓ Running next.config.ts took 29ms

  Creating an optimized production build ...
✓ Compiled successfully in 4.0s
  Running TypeScript ...
  Finished TypeScript in 7.8s ...
  Collecting page data using 3 workers ...
  Generating static pages using 3 workers (0/17) ...
  Generating static pages using 3 workers (4/17) 
  Generating static pages using 3 workers (8/17) 
  Generating static pages using 3 workers (12/17) 
✓ Generating static pages using 3 workers (17/17) in 324ms
  Finalizing page optimization ...

Route (app)
┌ ƒ /
├ ƒ /_not-found
├ ƒ /admin
├ ƒ /api/admin/buff
├ ƒ /api/battles
├ ƒ /api/characters
├ ƒ /api/characters/[id]
├ ƒ /api/characters/[id]/image
├ ƒ /api/dungeon/clear
├ ƒ /api/leaderboard
├ ƒ /api/rooms/[code]
├ ƒ /api/rooms/[code]/answer
├ ƒ /api/server-info
├ ƒ /api/uploads/[file]
├ ƒ /boss-art/[floor]
├ ƒ /build
├ ƒ /character/[id]
├ ƒ /create
├ ƒ /demo
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
└ ƒ /signup


○  (Static)   prerendered as static content
ƒ  (Dynamic)  server-rendered on demand

exit 0
```

### Dungeon tune (`npx tsx scripts/dungeon.ts --tune 120`)
```
floor 1: budget 350
floor 2: budget 311
floor 3: budget 327
floor 4: budget 354
floor 5: budget 297
floor 6: budget 320
floor 7: budget 331
floor 8: budget 300
floor 9: budget 328
floor 10: budget 330
BUDGETS [350,311,327,354,297,320,331,300,328,330]
floor  boss                    clear   target   (120 matches each, normal CPU as the player, 5 classes)
    1  Smudge                    84%     85%
    2  Cinder Knuckle            75%     78%
    3  Volt Nib                  67%     70%
    4  Whiteout                  59%     62%
    5  Prince Vellum             53%     54%
    6  Dawnstroke                43%     46%
    7  Ferrule                   36%     38%
    8  Hardcover Atlas           40%     30%
    9  Asymptote                 19%     22%
   10  The Redline Regent        14%     15%
curve: falls floor by floor

real	2m6.250s
user	2m7.128s
sys	0m0.617s
```
(then floor 8's budget was set to 304, a point where the rate was smooth: 292 gives 60%, 296 48%, 300 40%, 304 34%, 308 19%.)

### Balance tune logs (excerpts)
First full tune (25 min), the ult pass and the pull pass; pull sat at the tuner's maximum factor (2.989) before the damage change:
```
pass 1 special pull: 2.989
pass 1 ult: ULT_SCALE 0.838 (the ultimate-saver wins 53%)
pass 2 special pull: 2.989
pass 2 ult: ULT_SCALE 0.728 (the ultimate-saver wins 49%)
real	25m9.265s
```
Second tune after the change (`specials,ult,lines,classes`):
```
pass 1 special pull: 1.175
pass 1 ult: ULT_SCALE 0.82 (the ultimate-saver wins 51%)
pass 2 special pull: 1.196
pass 2 ult: ULT_SCALE 0.728 (the ultimate-saver wins 49%)
pass 2.6 lines: STR 49%, DUR 47%, SPD 56%, AGI 51%, IQ 46% -> STR_EXP 1.1264, DUR_EXP 0.7997, TEMPO_GAIN 0.0048, DODGE_SPAN 0.485, IQ_EXP 1.377
pass 2.6 classes: Sword 49% -> 1.027, Mace 54% -> 1.099, Tank 47% -> 1.168, Attacker 51% -> 1.203, Fighter 50% -> 1.208
real	15m40.088s
```

## 4. What I could NOT verify, and why
- **A full climb.** I played floors 1, 4 and 10 in a headless browser (a scripted player that mashes J), saw the passives' tells, Whiteout's counter banner and the Regent's whole phase 2 (banner, red page, new look, next round in the first form), with no console errors, but I did not win several floors in a row and watch the clear being stored and the unlocks appear. The unlocks were checked through the API and the builder with `User.dungeonFloor` set by hand (0: 12 specials and every locked pick refused; 4: shatter, counter and two variants offered, dash_slash and a locked variant refused).
- **Most passive tells by eye.** Rendered and seen: Whiteout's pale ink and counter, the Regent's crown and phase 2. The glows, crack lines, pencil-case label, grid and ripple, embers and sparks are written from the spec and type-check, but I did not screenshot each; the passives themselves are asserted in `check-sim.ts`.
- **Human difficulty.** Everything is the normal CPU as the "player" against the boss, as in part 1. A real player (and the passives' counterplay) will differ.
- **Online play with a boss** doesn't exist (dungeon fights are vs-computer only), and I did not touch Sprint 4's reconnect code beyond the merge.
- **Sprint 4 review fixes.** `MEMORY.md` (from part 1's branch) says Sprint 4 needed two fixes (transparent PNGs read as black ink; every normal join auto-started the fight). I merged `origin/sprint-4-online` as pushed; if those fixes were never committed to that branch, they are not in this one.
- The `/admin` page still doesn't show the ultimate (from Sprint 3).

## 5. How to test by hand
1. Log in (`demo1@inkfight.app` / `inkfight123`), open `/play/dungeon`, pick a fighter, Fight floor 1: a grey trail follows Smudge while its Afterimage is ready; hit it while it walks and the hit slips.
2. Set `dungeonFloor` (psql: `update "User" set "dungeonFloor"=9 where email='demo1@inkfight.app'`) to open the higher floors. Floor 4 (Whiteout): block-pound its shield three times and the guard bursts; its special is the counter stance (a gold arc, "Whiteout Parry!"). Floor 7: the pencil case label appears before each swap, and during the swap it rummages (hit it then for x1.25). Floor 10: knock it under half health: the fight freezes, THE MARGIN TEARS, the page goes red, ruled lines appear at your feet every 4 s and the Regent cuts with remote detonations.
3. `/build` at 0 floors lists 12 specials; at floor 4 it adds shatter, counter, Smudge Step and Static Crescent (and the ultimate list gains shatter and counter). In the training room, pick each new kind to see its move.
4. Refusals: while on floor 0, `POST /api/characters` with `pick_special=shatter` answers 403 "shatter is locked: beat floor 2 of the Dungeon (Cinder Knuckle) to copy it."
5. `npx tsx scripts/check-sim.ts` asserts every passive, the phase change and each kind; `npx tsx scripts/dungeon.ts 120` prints the curve (it should fall floor by floor).

## Merge notes

Branch `sprint-5-part2` was created from `origin/sprint-5-dungeon` (`9a320d9`); `origin/sprint-3-ultimates` (`c35f5cc`) and `origin/sprint-4-online` (`abf6632`) were merged into it with `--no-ff`, in that order. Both have the task sheet's commit `8008dd6` as their common base with part 1.

**Merge of `sprint-3-ultimates`: 2 conflicts**
- `src/game/cpu.ts` (both sides rewrote the knob table and `newBrain`). Part 1: `Knobs` type, `LEVELS: Record<Level, Knobs>`, `newBrain(level, knobs?)` with `knobs` on the brain and `skillUse: knobs?.skill ?? level's`. Sprint 3: an `ult` knob in each level, `ultUse` and `saving` on the brain, `specialRange`. Resolved by keeping both: `Knobs` gained `ult`; `LEVELS` keep Sprint 3's `ult` values; `newBrain` takes the boss's knobs and rolls `saving` from `knobs?.ult ?? LEVELS[level].ult`; `cpuThink`'s `const L = brain.knobs ? { ...LEVELS[...], ...brain.knobs } : LEVELS[...]` (part 1) is untouched.
- `MEMORY.md` (both appended sections). Kept part 1's "Delegation" and "Dungeon facts" bullets and Sprint 3's whole section; dropped Sprint 3's stale "Next: Sprint 3, 4, 5" line (part 1's bullets replaced it).
- Auto-merged and checked: `prisma/schema.prisma` (part 1's `dungeonFloor` and Sprint 3's `ultKind/ultName/ultDesc` are separate lines in different models/places: `prisma generate` and all migrations apply).

**Merge of `sprint-4-online`: 2 conflicts**
- `scripts/check-sim.ts`: the import lines (Sprint 3 added moves/poses/stickman/`deriveDef`/`snapshot`; Sprint 4 added `resumeMatch`) were unioned into one set of imports; both bodies were kept: Sprint 3's whole block of asserts, then Sprint 4's `resumeMatch` test (its closing brace came from the shared context below the conflict, so my resolution closes Sprint 3's block and leaves Sprint 4's test its own).
- `src/lib/vision.ts`: Sprint 3 refactored the two `suggestElement` call sites (it computes `special`, `ult`, `items` first); Sprint 4 added `facts?.penWidth` to the same two lines. Kept Sprint 3's code and added `facts?.penWidth` to both `suggestElement` calls.
- Auto-merged and read through: `scripts/check-stats.ts` (Sprint 4's pen-width asserts and Sprint 3's ultimate asserts are in different places), `src/app/api/characters/route.ts` (`penWidth` in the facts schema vs the picks), `src/components/UploadDropzone.tsx`, `src/game/protocol.ts` (Sprint 4's `reqsync`/`sync` messages vs Sprint 3's `ultMove/ultKind`), `src/game/useGameRoom.ts` (Sprint 4's reconnect and `iceConfig` vs Sprint 3's ultimate fields in the host's `PublicFighter`), `src/lib/stats.ts` (Sprint 4's `suggestElement(penWidth)` vs part 1's `clampStats(budget, cap)`), `src/game/sprite.ts` (only Sprint 4 touched it).
- The files the task named as likely conflicts, `src/app/play/cpu/CpuClient.tsx` and `src/game/sprite.ts`, did **not** conflict: only part 1 changed `CpuClient.tsx` and only Sprint 4 changed `sprite.ts`. (This part then changed `CpuClient`'s `knobs` prop to `boss`.)

**After the merges** the generated types had to be rebuilt (`prisma generate`, `next typegen`); then tsc, lint, the three check scripts, `balance.ts 200` (identical to Sprint 3's numbers: pairs 43-58%, lines 46-59%) and `next build` were green. `scripts/dungeon.ts` was not: floor 1 74% (target 85), 5 33% (54), 6 30% (46), 7 47% (38), 8 49% (30), 10 28% (15): "3 floor(s) easier than the one below". That is the Sprint 3 combat change meeting part 1's budgets, fixed by the tune in part 2.
