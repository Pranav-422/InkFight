# Sprint 8: Dungeon bosses, pass 2 (one identity per boss)

For a Claude Code cloud session. Read `MEMORY.md` (Sprint 5 / 5 part 2 and the dungeon facts), `docs/changes/sprint-5-part2.md`, `src/game/dungeon.ts`, `src/app/boss-art/[floor]/route.tsx` and the research first.

Base branch `main`, new branch `sprint-8-bosses`. Same rules as `docs/tasks/next-sprints.md`: gate, `docs/changes/sprint-8-bosses.md`, no push to main, no deploy.

## The owner's complaint (2026-10-26)

- The ten bosses are random: there's no class or standard behind who is on which floor.
- Their look is weak: a plain stick figure with a small mark over the head.
- Their fighting doesn't feel different. If a boss is a Zenitsu parody, it should fight with nothing but Thunderclap and Flash: a sheathed stance, a lightning iai dash, then the sheath again. It shouldn't use random punches.

## Research to use

- `docs/research/new research` (JSON, no extension, fields partly in Hinglish): expanded martial arts with frame data and keyframes (Boxing, Kyokushin, JKD/CQC). It also has anime signature moves: Lookism (Gun, Goo, Vasco), DBZ (Goku, Vegeta), One Piece (Luffy, Zoro, Sanji), Naruto/Sasuke, JoJo/DIO and Killua. Each move has `visual_sequence`, `colors`, `sound_feel`, `maps_to_block` (an existing special kind, or `NEW` with a `new_block` spec), `keyframes` and `vfx`, plus `parody_name_ideas`.
- `docs/research/anime-*.json` (Zenitsu is in `anime-02.json`), `docs/research/v2/bosses.json`, `v2/specials.json`, `v2/animation.json`.

## What to build

**A. A standard for the roster (write it first, in `docs/changes/sprint-8-bosses.md`).**
- The ten floors climb a clear ladder: street fighters, then trained martial artists, then elite swordsmen, then power users, then the final boss.
- Each boss is a **parody** of one recognisable anime fighter from the research. Use a parody name in the game, never the official name, logo or exact art (follow the `parody_name_ideas` style). The inspiration may be named in the docs only.
- Each boss gets one table row with: floor, tier, inspiration, parody name, class (one of the 5), style, item, element, colours (from the research), signature moves, passive, CPU personality, and what the floor teaches.
- **One identity rule:** every move, the passive, the idle, the aura and the CPU behaviour come from the same source.
  - A Zenitsu boss stays sheathed, dashes Thunderclap and Flash in yellow lightning, and almost never throws a plain punch.
  - A Goku boss fights in turtle-school style and charges the beam.
  - A Zoro boss uses three-sword slashes plus a teleport cut.
- Keep the passive idea (`FighterDef.passive`, hooks in `sim.ts`), but each passive must fit its boss.

**B. Boss move sets.**
- Bosses may have their own punch/kick chains and specials that players can't pick, built from the research keyframes and frame data (`moves.ts` / `poses.ts` patterns).
- A `NEW` block from the research (for example `time_stop_barrage`) may become a new special kind, but only for bosses, following how `shatter` / `counter` / `dash_slash` / `pull` / `remote_detonation` were added. `BASE_KINDS` stays what players' AI/offline picks use.
- The CPU (`cpu.ts` / boss knobs) must fight in character.
  - The Zenitsu boss waits sheathed, then dashes.
  - A brawler presses forward.
  - A counter fighter waits for your swing.

**C. Boss look (the main visual ask).**
- In a fight, a fighter is the stickman renderer plus the head cut from its drawing, the ink colour, the item and cosmetics (`drawStick`, `sprite.ts` `cutHead`). So a boss's look is:
  - a real head drawing in `boss-art` with its own silhouette: hair shape, eyes, scars, a mask, or a hood;
  - outfit cosmetics on the body (a haori/coat, a scarf, a belt or wraps), drawn from boss data, never baked into the art PNG (a filled shape near the hand fools the joint finder);
  - the research colours;
  - a signature aura and per-move VFX (`bossGlow` / `bossFx` in `render.ts`).
- Each boss must be recognisable at a glance next to the other nine. Check it with real Renderer frames (the `scripts/shots-7b/` approach): one idle frame and one signature-move frame per boss, desktop and phone. Put them in the docs.

**D. Rewards and progress.** Each floor's reward (`VARIANTS`, `UNLOCK_FLOOR`) should be that boss's signature move in a player-safe form, balanced for PvP. Players keep their `User.dungeonFloor`. Existing characters keep their stored special names and kinds.

## Gate

- `npx tsc --noEmit`, `npx eslint`, `npx next build`.
- `scripts/check-sim.ts` passes, and its normal-fight hashes are unchanged.
- `npx tsx scripts/balance.ts 200` prints what main prints. Normal PvP must not move.
- `scripts/dungeon.ts --tune` re-fits budgets so the clear curve still runs from about 84% on floor 1 to about 14% on floor 10, and every floor is beatable by the CPU stand-in.
- `balance.ts` still asserts that no player kit has a passive or a boss-only kind.
- Frames per boss in the docs. Write down what you couldn't verify (sound, a human climb, phones).

## Out of scope

Arena changes, new player classes, leaderboard or recording changes, and painted art (keep it procedural / SVG).
