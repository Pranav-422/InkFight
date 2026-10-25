# Sprint 5: the Dungeon (part 1 of 2: everything outside sim.ts)

Branch `sprint-5-dungeon`, built by the main session on 2026-10-25 while Sprint 3 (two specials, hit-lock)
runs in a cloud session. Sprint 3 rewrites much of `src/game/sim.ts`, so this part stays out of it; part 2
(boss passives, floor 10's phase 2, the new special kinds) lands after Sprint 3 is merged.

## 1. What changed

- **Bosses as data** (`src/game/dungeon.ts`): ten bosses from `docs/research/v2/bosses.json` (original
  titles), each with class, style, item, element, special, ink tint, stat line, CPU knobs, passive (rule and
  telegraph for the sim, a one-line `hint` for players), counterplay, taunt and reward move. `bossFighter(n)`
  turns one into a fighter.
- **Boss budgets without touching the sim** (`src/lib/stats.ts`): `clampStats` honours `budget`/`cap` on the
  stat line. Only `bossFighter` sets them; players never carry them (the server builds every fighter field by
  field in `publicFighter`), so a player is still clamped to 350 and the normal caps.
- **Boss AI** (`src/game/cpu.ts`, `src/game/useCpuMatch.ts`): `newBrain(level, knobs?)` takes a boss's own
  react/block/aggro/dodge/think over its level's.
- **Boss art** (`src/app/boss-art/[floor]/route.tsx`): a stick figure in the boss's ink with a head mark per
  boss (flames, bolt, hood, crowns, halo...), read by the normal sprite pipeline like a scanned drawing. Light
  tints (Whiteout, Asymptote) are darkened so they read as ink.
- **Progress**: migration `20261025030000_dungeon_floor` (`User.dungeonFloor Int @default(0)`);
  `POST /api/dungeon/clear` (logged in, rate-limited to one clear per 20 s, accepts only the next floor, the
  update is conditional on the old value so two tabs can't both advance).
- **Ladder** `/play/dungeon` (`page.tsx` + `DungeonClient.tsx`): cleared floors (rematch, the move you
  copied), the open floor (boss avatar, passive hint, taunt, Fight), locked floors (title only). A fight
  reuses `CpuFight` (new optional `knobs`, `label`, `onResult`); a win reports the clear; a loss shows the
  boss's counterplay tip. Links: header nav (desktop) and the "No friend around?" card on `/play`.
- **Difficulty curve** (`scripts/dungeon.ts`): clear rate per floor for a mid-skill stand-in (the normal CPU
  playing each class's usual line) vs the boss; `--tune` bisects each floor's budget onto the target. Also
  asserts a boss fight is deterministic and that a boss keeps its budget through `deriveDef`.

## 2. Decisions

- **Budgets are tuned, not taken from the research.** With the research budgets (350 to 485) floor 2 was
  already 15% (STR is worth a lot at `STR_EXP` ≈ 1.2, and the boss AI beats the normal CPU on its own). Tuned:
  `[369, 301, 332, 359, 322, 325, 334, 316, 334, 339]`. Most bosses have fewer points than a player: their
  edge is the AI (and, in part 2, the passive). So the ladder shows no "power" number. Re-tune after part 2:
  the passives will push budgets down further.
- **Specials that don't exist yet** (`shatter`, `counter`, `dash_slash`, `pull`) fall back to the class
  default through `specialOf` until part 2 builds them.
- **Client-reported clears**, like every CPU result: a cheater can claim a floor, but progress only unlocks
  moves that are balanced for PvP and never touches the leaderboard (noted as a `shortcut:` in the route).

## 3. Gate output

```
npx tsc --noEmit                 -> ok
npm run lint                     -> ok
npx tsx scripts/check-sim.ts     -> check-sim: all good
npx tsx scripts/check-stats.ts   -> check-gemini: all good Ink-ame-hameha
npx tsx scripts/check-stick.ts   -> check-stick: all good
npx tsx scripts/balance.ts 200   -> pairs (400 matches each, ±2.5%): Sword-Mace 49%, Sword-Tank 55%, Sword-Attacker 51%,
                                    Sword-Fighter 51%, Mace-Tank 44%, Mace-Attacker 45%, Mace-Fighter 50%, Tank-Attacker 53%,
                                    Tank-Fighter 54%, Attacker-Fighter 49%
                                    fair: every pair within 44-57%
                                    STR 54% · DUR 57% · SPD 49% · AGI 49% · IQ 49%   ok: every stat line within 45-62%
                                    (identical to main: players are unaffected)
npx next build                   -> Compiled successfully; routes /play/dungeon, /api/dungeon/clear, /boss-art/[floor]

npx tsx scripts/dungeon.ts 120
floor  boss                    clear   target
    1  Smudge                    84%     85%
    2  Cinder Knuckle            78%     78%
    3  Volt Nib                  70%     70%
    4  Whiteout                  59%     62%
    5  Prince Vellum             49%     54%
    6  Dawnstroke                44%     46%
    7  Ferrule                   38%     38%
    8  Hardcover Atlas           31%     30%
    9  Asymptote                 15%     22%
   10  The Redline Regent        15%     15%
curve: falls floor by floor
```

Browser (headless Edge, local dev server, logged in): the ladder renders (floor 1 open, others locked), the
boss art loads as a PNG and reads as a stickman, a floor-1 fight starts with the boss label, the boss's ink and
head, and no console errors.

## 4. Not done yet (part 2, after Sprint 3 merges)

- Boss passives: `createMatch(..., { boss })` sets `FighterDef.passive` (never from user data) with hooks in
  `applyHit`, `updateFighter`, `step`, implemented from each `passive.rule`; a `balance.ts` assert that no
  player kit has a passive. Until then the ladder shows passive hints for passives that don't act yet, so
  don't merge part 1 alone.
- Floor 10's phase 2 at 50% HP (`phase2` in the data: freeze 40, a `phase` event, a banner).
- Five new special kinds unlocked on floors 2, 4, 6, 8, 10 (sim + pose + FX + `SPECIAL_TUNE` + the specials
  pass); element-tinted variants on the other floors; the character APIs reject a locked kind; the builder
  lists unlocked ones.
- Re-run `scripts/dungeon.ts --tune` once passives exist.
- Not verified: a full climb (winning several floors in the browser and seeing the clear stored).

## 5. How to test by hand

1. Log in, open `/play/dungeon` (or "The Dungeon" on `/play`), pick a fighter, press Fight on floor 1.
2. Win: back on the ladder, a gold banner names the copied move and floor 2 opens. Lose: the counterplay tip
   shows under the arena.
3. `curl -X POST /api/dungeon/clear -d '{"floor":3}'` while on floor 0 answers 400 "Clear the floors in
   order"; two clears within 20 s answer 429.
