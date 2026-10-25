# InkFight: task sheet for Sprints 3, 4 and 5

For a coding agent working without supervision (a Claude Code cloud session on Sonnet, high effort, or the
Antigravity `agy` CLI). Read this whole file first, then `MEMORY.md` (project history, architecture, gotchas)
and `AGENTS.md` (this Next.js version differs from your training data: read `node_modules/next/dist/docs/`
before touching routes or pages).

## Ground rules (every sprint)

- **Branch.** Work only on the sprint's branch (below), created from the latest `main`. Never push to `main`,
  never merge, never deploy (no `vercel`). The owner reviews and merges.
- **Commits.** One commit per finished feature, message in plain English (what and why), ending with the
  co-author line your tool uses. Push the branch when the sprint's gate passes, and again at the end.
- **Docs are the deliverable.** Write `docs/changes/sprint-<N>.md` as you go:
  1. what changed, per feature, with the files touched;
  2. decisions you made and why (anything the spec left open);
  3. the full output of the gate commands (paste it, don't summarise);
  4. what you could NOT verify and why;
  5. a "how to test it by hand" list (keys to press, pages to open).
  The reviewer verifies from this file first, then re-runs the gate.
- **Code style.** Match the surrounding code: short comments that explain *why*, no new dependencies, no
  abstractions nobody asked for. `src/game/sim.ts` stays pure and deterministic (no `Math.random`, no
  `Date`): rolls come from `roll(m, salt)`. Anything in a `Snapshot` must survive JSON.
- **Database.** New columns only through a new folder in `prisma/migrations/` (`YYYYMMDDHHMMSS_name`),
  nullable or with a default. Never `prisma migrate reset`. Local DB: `npx prisma dev -n inkfight-local --detach`
  (port 51218). In a cloud session without it, write the migration by hand and say so in the docs.
- **Balance is part of done.** Any change to damage, timing, stats, skills or specials must end with:
  `npx tsx scripts/balance.ts --tune 160 <passes>` → copy the printed tune values into `src/game/moves.ts` /
  `src/game/sim.ts` → `npx tsx scripts/balance.ts 200` exits 0 (every class pair 40-60%, every stat line
  45-62%). If it won't pass, find the mechanic with `npx tsx scripts/matchup.ts A B` and fix the code, not
  the number. MEMORY.md "Balance lessons" lists the traps already hit (reactive CPU, refreshing statuses,
  shared seeds).

### Gate (run before every push; all must pass)

```bash
npx tsc --noEmit
npm run lint
npx tsx scripts/check-sim.ts
npx tsx scripts/check-stats.ts
npx tsx scripts/check-stick.ts
npx tsx scripts/balance.ts 200   # must print "fair" and "ok" and exit 0
npx tsx scripts/dungeon.ts       # once the dungeon exists: the clear rate falls floor by floor
npx next build
```

Add asserts to `scripts/check-sim.ts` for every new mechanic (it is the proof a mechanic is wired up).

---

## Sprint 3: two specials, hit-lock, impact (branch `sprint-3-ultimates`)

1. **Two special slots.** Migration `ultimate`: `Character.ultKind String?`, `ultName String @default("")`,
   `ultDesc String @default("")`. Existing `specialKind`/`specialMove` = slot 1.
   - `L` = slot 1, costs 50 energy, damage × `SLOT1_SCALE` (tuned, ≈0.55), a 6-tick freeze instead of 16.
   - **S + L** (block held + special) = the ultimate, costs 100. Same 12 building blocks.
   - Builder, upload "Correct the AI" panel, character page and inspect panel get an Ultimate picker / line.
     The offline name generator (`SPECIAL_NAMES`) gets ult names. The CPU uses slot 1 at 50 and the ult at 100.
   - `Input` needs no new key (S+L). Update `MovePreview` (demo the ult) and the on-screen controls hint.
2. **Cinematic hit-lock (ultimate only).** The ult's first hit sets `opp.locked = true` until the ult ends: no
   input, pinned 60 px in front, multi-hits continue, the end launches (launch 12). Renderer: zoom 1.35 on the
   midpoint, dim `rgba(5,5,12,0.62)` for the ult.
3. **Impact frames + crits.** On ult hits and on "Ink Flash" crits (chance `0.03 + max(0, IQ−60)·0.003`, chain
   finishers only, ×1.5, roll from `roll(m, …)`): 2-tick invert + 16 radial lines at the hit point. A
   "Reduce flashes" switch (localStorage; defaults on with `prefers-reduced-motion`) swaps it for a soft ring.
4. **Spine recoil.** `applyHit` sets `vic.hitHigh` (hit above 70% of body height); `poses.ts` "hit": head hit
   snaps the head back, body hit folds the torso forward and drops the arms.
5. **Class cosmetics** (procedural in `stickman.ts`, ink colour): Sword hip sheath, Fighter hand wraps, Attacker
   2-3 floating orbs, Tank shoulder pads, Mace headband. Same in avatar, preview and fight.
6. **Body proportions from stats** (render only, hitboxes unchanged): high DUR = broad shoulders, thicker
   limbs; high SPD = lean, longer legs.
7. **Tension level:** below 30% HP a tension meter rises; design the effect (small damage or energy edge),
   document it, and keep it inside the balance gate.

Then the full retune: `--tune 160 specials,styles,skills,lines,classes`, gate, docs.

## Sprint 4: online robustness and storage (branch `sprint-4-online`)

1. **Host reconnect.** When the host drops and returns, resume from the latest snapshot with
   `sim.resumeMatch`. The guest's copy is the newest (it ran on vs CPU), so the host takes it over and becomes
   host again; the CPU stops driving the host's seat. Such fights stay unrecorded. Files:
   `src/game/useGameRoom.ts`, `src/app/api/rooms/**`.
2. **TURN.** `NEXT_PUBLIC_ICE_SERVERS` (JSON array) is read already or must be: check `useGameRoom.ts`, make
   it the single source of ICE servers, document the env var and how to get free TURN creds (Metered or
   Cloudflare Calls) in `docs/changes/sprint-4.md`. Add a dev-only `?relay=1` that sets
   `iceTransportPolicy: "relay"` to test the fallback.
3. **Transparent cut-outs.** `cleanDrawing` (`src/game/sprite.ts`) stores a transparent PNG instead of white;
   the admin "Re-cut" tool re-cuts old rows. Check every place that draws the cut-out still looks right.
4. **Element from line thickness.** `suggestElement` (`src/lib/stats.ts`) also uses the measured pen width
   (`measureInk`): thick → GRAVITY, thin → ELECTRIC; ink hue still wins, thickness breaks ties and decides
   black-only drawings. Extend `scripts/check-stats.ts`.

No balance change expected; run the gate anyway.

## Sprint 5: the Dungeon (branch `sprint-5-dungeon`, after Sprint 3 is merged)

**Status:** part 1 is on the branch (boss data, budgets, boss AI knobs, boss art, progress migration and API,
the ladder page, `scripts/dungeon.ts` with a tuned curve): see `docs/changes/sprint-5.md`. Part 2 (below:
items 3 and 5, plus re-tuning the curve) needs Sprint 3 merged first, then this branch rebased on `main`.

Data for bosses: `docs/research/v2/bosses.json` (10 original-title bosses). No anime names reach game data.

1. **Bosses as code data** in `src/game/dungeon.ts` (`BOSSES[10]`: name, class, style, element, special,
   passive, AI knobs, reward move). Rendered as tinted stickmen (the `src/game/samples.ts` pattern).
2. **Difficulty curve.** `clampStats(s, budget, cap)` takes parameters; floor f has budget `350 + 15(f−1)`,
   the cap rises to 115 from floor 6. Boss AI knobs blend from `normal` (floor 1) to beyond `hard`
   (floor 10: react 4, block 0.8). Target clear rate for a mid-skill player: ~85% on floor 1 falling to ~15%
   on floor 10. Write `scripts/dungeon.ts` that measures it (a "mid-skill" stand-in: the `normal` CPU with the
   player's class line) and a determinism check.
3. **Boss passives.** `FighterDef.passive` is set only through `createMatch(..., { boss })`, never from user
   data. Hooks in `applyHit`, `updateFighter`, `step`. Floor 10 has a phase 2 at 50% HP: new def, `freeze 40`,
   a `phase` event and a banner. `balance.ts` asserts no player kit has a passive.
4. **Progress.** Migration `User.dungeonFloor Int @default(0)`. `POST /api/dungeon/clear` (auth, `rateLimit`,
   accepts only `floor = current + 1`). Ladder page `/play/dungeon`; a floor fight reuses
   `CpuClient`/`useCpuMatch` with a `boss` prop. Nav link for logged-in users.
5. **Boss move copy (decided).** Beating floors 2, 4, 6, 8, 10 unlocks 5 new special kinds (pick them from
   `docs/research/v2/specials.json`; each needs sim + pose + FX + a `SPECIAL_TUNE` entry and goes through the
   specials pass so PvP stays fair). Other floors unlock element-tinted named variants of existing kinds. The
   character APIs reject a locked kind; the builder lists only unlocked ones.

Then the full retune, `scripts/dungeon.ts`, gate, docs.

---

## Hand-off checklist (end of each sprint)

- [ ] Gate output pasted in `docs/changes/sprint-<N>.md`, every command passing
- [ ] `scripts/check-sim.ts` has asserts for the new mechanics
- [ ] Migrations added (never edited in place), described in the docs
- [ ] `MEMORY.md` gets a short "Sprint N" section (what, where, lessons)
- [ ] Branch pushed; nothing pushed to `main`; no deploy
