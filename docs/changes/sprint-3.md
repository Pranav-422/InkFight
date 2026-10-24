# Sprint 3: two specials, hit-lock, impact (branch `sprint-3-ultimates`)

Seven features, one commit each (features 5 and 6 share `drawStick` and are one commit), then a retune commit.
Nothing is pushed to `main`, nothing deployed.

## 1. What changed, per feature

### 1. Two special slots
- `L` = slot 1: costs 50 energy, damage x `TRAIT.SLOT1_SCALE` (0.55), 6-tick freeze (`SLOT1_FREEZE`).
- `S + L` (guard held + special) = the ultimate: costs 100, same twelve building blocks, 16-tick super-freeze.
  Under a full meter `S + L` fires slot 1 instead (the guard was only a modifier); in the air there is no guard, so it is slot 1 too.
- Data: `Character.ultKind String?`, `ultName String @default("")`, `ultDesc String @default("")`
  (migration `20261025090000_ultimate`). Existing `specialKind`/`specialMove` stay slot 1. A fighter with no stored
  ultimate gets its class's (`CLASS_ULT`: Sword meteor, Mace uppercut, Tank meteor, Attacker spiral, Fighter beam).
- Picker / line for the ultimate: builder (`BuildClient`), upload "Correct the AI" panel (`UploadDropzone`, `pick_ult`),
  character page + card, inspect panel, lobby card, HUD banner (`HudInfo.ultNames`), training room (`MovePreview`, demo kind `ult`).
- AI (`vision.ts`): schema gets an optional `ultimate {kind,name,description}` and the prompt asks for a kind different from slot 1;
  `pickUlt` makes sure the two slots differ unless the player chose so. Offline names come from the new `ULT_NAMES` (a sibling
  of `SPECIAL_NAMES`, not folded into it, so slot-1 names don't collide).
- CPU: slot 1 from 50 energy unless it is "saving" (`brain.saving`, rolled after every special with chance `LEVELS[..].ult`:
  easy 0.2, normal 0.4, hard 0.5); ultimate at 100 (grounded, in range).
- Controls: console and touch hints. The touch SPECIAL button turns into **ULT** at a full meter and presses BLOCK with it, so one thumb is enough. The HUD meter has a notch at 50.
- Files: `src/game/{moves,sim,cpu,render,samples,protocol,useGameRoom}.ts`, `src/lib/{vision,rooms}.ts`,
  `src/app/api/characters/route.ts`, `prisma/{schema.prisma,seed.ts,migrations/20261025090000_ultimate}`,
  `src/components/{Controller,TouchControls,GameCanvas,InspectPanel,CharacterCard,MovePreview,UploadDropzone}.tsx`,
  `src/app/{build/BuildClient,character/[id]/page,play/[code]/RoomClient}.tsx`.

### 2. Cinematic hit-lock (ultimate only)
- The ultimate's first unblocked hit sets `opp.locked`: no input (a mashing victim does nothing), pinned 60 px in front
  (`LOCK.gap`), hit again every 7 ticks for 42 ticks (`LOCK`, echo = `TRAIT.ECHO_MULT` 0.35 of the move's damage), and the end is a
  finishing blow (`TRAIT.FINALE_MULT`) with launch 12. Beam and barrage already hit several times, so they hold for their own length.
- A projectile ultimate (bolt, arrow, orb, wave) locks on contact: the attacker is pulled back into the move (unless they were hit meanwhile).
- A guard stops the lock (the blocked blow still chips). Knocking the attacker out of the move releases the victim without the finale.
- Renderer: zoom 1.35 on the pair while held, the `rgba(5,5,12,0.62)` blackout of the page for the whole ultimate (eased), a pounding pose
  and ghost fists once the move's own animation has played out.
- Files: `sim.ts` (`lockOn`, `releaseLock`, `Fighter.locked/ultEnd`), `poses.ts`, `render.ts`.

### 3. Impact frames + crits
- Ink Flash: a chain finisher that lands clean crits with chance `0.03 + max(0, IQ-60) * 0.003` (`FighterDef.crit`), x1.5, rolled from `roll(m, 10 + slot)`.
- Ultimate hits and crits: 2-tick invert + 16 wedges fanning from the hit point (`Renderer.impactFrame`). "Reduce flashes"
  (`src/game/flashes.ts`, `ReduceFlashes.tsx`: console and the phone settings panel; localStorage, defaults to `prefers-reduced-motion`)
  swaps it, and the white screen flashes, for a soft ring.

### 4. Spine recoil
`applyHit` sets `vic.hitHigh` (blow above 70% of body height: hooks, headbutts, axe kicks... jabs and most others are body hits).
`poses.ts` "hit": a head hit snaps the head back and arches the spine; a body hit folds the torso forward and drops the arms.

### 5 + 6. Class cosmetics and body proportions (one commit)
- Cosmetics (`stickman.ts`, ink colour, procedural): Sword hip sheath on a belt, Fighter hand wraps, Attacker three floating orbs,
  Tank shoulder pads, Mace headband with fluttering tails. Skipped for afterimages and for the builder's drawing (`plain`).
  Same code in the avatar, the training room and the fight.
- Proportions (render only, hitboxes unchanged): `buildFor(dur, spd)`: high DUR = a shoulder yoke and thicker limbs (x1.4 max),
  high SPD = lean (thinner) with longer legs (+8%). An average fighter (70/70) is drawn exactly as before.

### 7. Tension
Design (not specified, so mine): below 30% of max health a fighter's `tension` rises 1/240 per tick (4 s to full) and by 0.1 for every
blow taken; it multiplies **every energy gain** (passive, landing, taking hits, clashes) by `1 + 0.8 * tension`. An energy edge only, no
damage bonus: a fighter on the ropes reaches slot 1 or the ultimate sooner. Resets each round. HUD: thin red bar under the health bar;
fighter: pulsing red aura and embers. Constants: `TRAIT.TENSION_*`. It is symmetric, so it compresses win rates toward 50%.

### Retune
- New `balance.ts` pass `ult`: sets `TRAIT.ULT_SCALE` so an always-saves-for-the-ultimate CPU and an always-spends-on-slot-1 CPU of the same
  class come out even (result 0.783, 53%). The specials/styles passes price a kind in both slots at once; the kit generator varies the ultimate.
  `SLOT1_SCALE` is a fixed 0.55: it is collinear with `SPECIAL_TUNE` (a per-kind factor that already absorbs it), so tuning it would be circular.
- Mechanic found along the way (not a number): with the first retune the Sword's default ultimate (teleport) left Sword-Tank at 65%.
  `matchup.ts` showed why: 225 Sword ultimates did 7 damage each against the Tank's guard (the teleport whiffs and is blocked) while the Tank's
  meteor did 21. Sword's class default is now `meteor` and the class pass was rerun. (The starter Sir Scribbles keeps the stored teleport.)
- Applied values: `STYLE_TUNE`, `SPECIAL_TUNE`, `CLASS_TUNE`, `SKILL_TUNE` in `moves.ts`, `TUNE` and `TRAIT.ULT_SCALE` in `sim.ts`.

## 2. Decisions the spec left open
- `S + L` below a full meter, or in the air, fires slot 1 (never "nothing").
- A blocked ultimate does not lock; a poised (iron poise) victim does get locked (poise stops flinching, not grabs); an ink bubble soaks the opener.
- Echo hits on a locked victim have a 3-tick hit-stop instead of 6 (otherwise one ultimate froze the game for ~35 ticks more).
- ULT_NAMES is a separate table. `ultTitle()` gives old fighters (empty `ultName`) a stock name.
- Impact frames fire on every ultimate hit (opener, echoes, finale), not only the opener.
- Reduce flashes also covers the white screen flash (KO, special, clash), since it is the same hazard.
- Crit rolls only for finishers that are not blocked/special; the roll uses salt `10 + slot` so it never shares a roll with the dodge (salts 0/1).

## 3. Gate output (pasted, run on the final commit of this branch before the docs commit)

Local Postgres: the system PostgreSQL 16 (not `prisma dev`), `DATABASE_URL`/`DATABASE_URL_UNPOOLED` pointed at it, `AUTH_SECRET` set to a dummy.
All 14 migrations, including the new one, applied to an empty database with `npx prisma migrate deploy`, and `prisma/seed.ts` ran against it.

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
    item: 'nothing'
  },
  shield: 'shield'
}
check-gemini: all good Ink-ame-hameha
exit 0

$ npx tsx scripts/check-stick.ts
check-stick: all good
exit 0

$ npx tsx scripts/balance.ts 200
win rate of row vs column (hard CPU, default kits, 200 matches each) · avg round length
         Sword     | Mace      | Tank      | Attacker  | Fighter  
Sword     53% 23s |  55% 22s |  57% 29s |  43% 20s |  49% 25s
Mace      52% 23s |  50% 23s |  56% 28s |  46% 20s |  55% 25s
Tank      44% 28s |  48% 28s |  51% 38s |  56% 26s |  55% 30s
Attacker  56% 20s |  50% 20s |  44% 27s |  51% 17s |  42% 21s
Fighter   47% 25s |  53% 24s |  40% 29s |  54% 22s |  50% 27s
pairs (400 matches each, ±2.5%): Sword-Mace 52%, Sword-Tank 57%, Sword-Attacker 44%, Sword-Fighter 51%, Mace-Tank 54%, Mace-Attacker 48%, Mace-Fighter 51%, Tank-Attacker 56%, Tank-Fighter 58%, Attacker-Fighter 44%
fair: every pair within 43-58%

stat line vs all-70 (200 kits, 2 matches each): one stat at 100, the other four ~62
STR 54%  ·  DUR 46%  ·  SPD 52%  ·  AGI 59%  ·  IQ 55%
ok: every stat line within 45-62%
exit 0

$ npx next build
▲ Next.js 16.3.8 (Turbopack)
✓ Running next.config.ts took 25ms

  Creating an optimized production build ...
✓ Compiled successfully in 9.1s
  Running TypeScript ...
  Finished TypeScript in 5.7s ...
  Collecting page data using 3 workers ...
  Generating static pages using 3 workers (0/16) ...
  Generating static pages using 3 workers (4/16) 
  Generating static pages using 3 workers (8/16) 
  Generating static pages using 3 workers (12/16) 
✓ Generating static pages using 3 workers (16/16) in 271ms
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
├ ƒ /api/leaderboard
├ ƒ /api/rooms/[code]
├ ƒ /api/rooms/[code]/answer
├ ƒ /api/server-info
├ ƒ /api/uploads/[file]
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
├ ƒ /player/[id]
├ ƒ /pwa-icon/[size]
└ ƒ /signup


○  (Static)   prerendered as static content
ƒ  (Dynamic)  server-rendered on demand

exit 0
```

### Retune log

Full tune, `npx tsx scripts/balance.ts --tune 160 specials,styles,skills,ult,lines,classes` (13 min). Its class passes and ult passes:

```
pass 1 style Boxing: 0.732
pass 1 style Taekwondo: 0.817
pass 1 style Muay Thai: 0.838
pass 1 style Karate: 0.838
pass 1 style Street: 0.859
pass 1 style Systema: 0.732
pass 1 special bolt: 1.492
pass 1 special arrow: 1.365
pass 1 special orb: 1.154
pass 1 special slash: 0.543
pass 1 special charge: 0.311
pass 1 special uppercut: 0.922
pass 1 special beam: 1.956
pass 1 special spiral: 1.597
pass 1 special wave: 2.019
pass 1 special teleport: 0.564
pass 1 special barrage: 0.775
pass 1 special meteor: 1.302
pass 1 skill blade (Sword): 1.924
pass 1 skill poise (Mace): 0.474
pass 1 skill reflect (Tank): 1.312
pass 1 skill bubble (Attacker): 0.338
pass 1 skill weave (Fighter): 0.587
pass 1 ult: ULT_SCALE 0.783 (the ultimate-saver wins 54%)
pass 1.1 lines: STR 52%, DUR 59%, SPD 48%, AGI 36%, IQ 57% -> STR_EXP 1.1619, DUR_EXP 0.7742, TEMPO_GAIN 0.0049, DODGE_SPAN 0.615, IQ_EXP 1.5699
pass 1.2 lines: STR 51%, DUR 47%, SPD 51%, AGI 55%, IQ 51% -> STR_EXP 1.1389, DUR_EXP 0.7978, TEMPO_GAIN 0.0049, DODGE_SPAN 0.585, IQ_EXP 1.5388
pass 1.3 lines: STR 46%, DUR 45%, SPD 52%, AGI 61%, IQ 59% -> STR_EXP 1.1854, DUR_EXP 0.8387, TEMPO_GAIN 0.0048, DODGE_SPAN 0.5241, IQ_EXP 1.2853
pass 1.4 lines: STR 51%, DUR 53%, SPD 52%, AGI 52%, IQ 53% -> STR_EXP 1.1795, DUR_EXP 0.8262, TEMPO_GAIN 0.0047, DODGE_SPAN 0.5137, IQ_EXP 1.2104
pass 1.5 lines: STR 51%, DUR 51%, SPD 54%, AGI 46%, IQ 41% -> STR_EXP 1.1736, DUR_EXP 0.8221, TEMPO_GAIN 0.0045, DODGE_SPAN 0.5241, IQ_EXP 1.3244
pass 1.6 lines: STR 56%, DUR 54%, SPD 46%, AGI 44%, IQ 54% -> STR_EXP 1.1389, DUR_EXP 0.8058, TEMPO_GAIN 0.0046, DODGE_SPAN 0.5401, IQ_EXP 1.2982
pass 1.7 lines: STR 49%, DUR 54%, SPD 53%, AGI 46%, IQ 53% -> STR_EXP 1.1418, DUR_EXP 0.7898, TEMPO_GAIN 0.0046, DODGE_SPAN 0.551, IQ_EXP 1.2789
pass 1.8 lines: STR 46%, DUR 51%, SPD 56%, AGI 49%, IQ 54% -> STR_EXP 1.1533, DUR_EXP 0.7859, TEMPO_GAIN 0.0045, DODGE_SPAN 0.5538, IQ_EXP 1.2536
pass 1.1 classes: Sword 53% -> 0.98, Mace 39% -> 1.134, Tank 69% -> 1.166, Attacker 36% -> 1.201, Fighter 52% -> 1.279
pass 1.2 classes: Sword 45% -> 1.006, Mace 51% -> 1.127, Tank 59% -> 1.111, Attacker 45% -> 1.231, Fighter 50% -> 1.281
pass 1.3 classes: Sword 52% -> 0.993, Mace 50% -> 1.129, Tank 55% -> 1.081, Attacker 45% -> 1.263, Fighter 48% -> 1.296
pass 1.4 classes: Sword 52% -> 0.985, Mace 51% -> 1.125, Tank 52% -> 1.068, Attacker 45% -> 1.294, Fighter 50% -> 1.294
pass 1.5 classes: Sword 53% -> 0.968, Mace 53% -> 1.109, Tank 43% -> 1.107, Attacker 48% -> 1.308, Fighter 53% -> 1.273
pass 1.6 classes: Sword 52% -> 0.957, Mace 48% -> 1.119, Tank 55% -> 1.081, Attacker 45% -> 1.343, Fighter 50% -> 1.272
pass 2 style Boxing: 0.775
pass 2 style Taekwondo: 0.859
pass 2 style Muay Thai: 0.901
pass 2 style Karate: 0.796
pass 2 style Street: 0.901
pass 2 style Systema: 0.754
pass 2 special bolt: 1.323
pass 2 special arrow: 1.26
pass 2 special orb: 1.112
pass 2 special slash: 0.648
pass 2 special charge: 0.311
pass 2 special uppercut: 0.796
pass 2 special beam: 2.188
pass 2 special spiral: 1.682
pass 2 special wave: 1.935
pass 2 special teleport: 0.627
pass 2 special barrage: 0.817
pass 2 special meteor: 1.218
pass 2 skill blade (Sword): 1.539
pass 2 skill poise (Mace): 0.451
pass 2 skill reflect (Tank): 1.086
pass 2 skill bubble (Attacker): 0.406
pass 2 skill weave (Fighter): 0.587
pass 2 ult: ULT_SCALE 0.783 (the ultimate-saver wins 53%)
pass 2.1 lines: STR 51%, DUR 51%, SPD 51%, AGI 48%, IQ 50% -> STR_EXP 1.1519, DUR_EXP 0.782, TEMPO_GAIN 0.0045, DODGE_SPAN 0.5594, IQ_EXP 1.2536
pass 2.2 lines: STR 53%, DUR 52%, SPD 52%, AGI 48%, IQ 48% -> STR_EXP 1.1476, DUR_EXP 0.7742, TEMPO_GAIN 0.0045, DODGE_SPAN 0.565, IQ_EXP 1.2567
pass 2.3 lines: STR 51%, DUR 57%, SPD 51%, AGI 46%, IQ 51% -> STR_EXP 1.1462, DUR_EXP 0.7476, TEMPO_GAIN 0.0045, DODGE_SPAN 0.5764, IQ_EXP 1.2559
pass 2.4 lines: STR 53%, DUR 53%, SPD 48%, AGI 53%, IQ 49% -> STR_EXP 1.1419, DUR_EXP 0.7365, TEMPO_GAIN 0.0045, DODGE_SPAN 0.5721, IQ_EXP 1.2563
pass 2.5 lines: STR 51%, DUR 47%, SPD 51%, AGI 52%, IQ 50% -> STR_EXP 1.1405, DUR_EXP 0.742, TEMPO_GAIN 0.0045, DODGE_SPAN 0.5692, IQ_EXP 1.2563
pass 2.6 lines: STR 51%, DUR 50%, SPD 51%, AGI 51%, IQ 50% -> STR_EXP 1.1391, DUR_EXP 0.742, TEMPO_GAIN 0.0045, DODGE_SPAN 0.5678, IQ_EXP 1.2563
pass 2.7 lines: STR 51%, DUR 51%, SPD 51%, AGI 48%, IQ 51% -> STR_EXP 1.1377, DUR_EXP 0.7415, TEMPO_GAIN 0.0045, DODGE_SPAN 0.5692, IQ_EXP 1.2562
pass 2.8 lines: STR 51%, DUR 49%, SPD 51%, AGI 51%, IQ 50% -> STR_EXP 1.1363, DUR_EXP 0.7417, TEMPO_GAIN 0.0045, DODGE_SPAN 0.5688, IQ_EXP 1.2562
pass 2.1 classes: Sword 44% -> 0.987, Mace 48% -> 1.129, Tank 41% -> 1.128, Attacker 60% -> 1.274, Fighter 57% -> 1.23
pass 2.2 classes: Sword 51% -> 0.982, Mace 50% -> 1.129, Tank 46% -> 1.148, Attacker 52% -> 1.262, Fighter 51% -> 1.225
pass 2.3 classes: Sword 43% -> 1.019, Mace 49% -> 1.134, Tank 53% -> 1.128, Attacker 52% -> 1.249, Fighter 53% -> 1.207
pass 2.4 classes: Sword 56% -> 0.986, Mace 43% -> 1.173, Tank 49% -> 1.132, Attacker 51% -> 1.244, Fighter 50% -> 1.205
pass 2.5 classes: Sword 46% -> 1.006, Mace 54% -> 1.151, Tank 51% -> 1.127, Attacker 53% -> 1.225, Fighter 46% -> 1.228
pass 2.6 classes: Sword 48% -> 1.019, Mace 49% -> 1.157, Tank 49% -> 1.134, Attacker 55% -> 1.197, Fighter 50% -> 1.226
```

Then the Sword ultimate changed to meteor, and `npx tsx scripts/balance.ts --tune 160 classes` was rerun; its second-pass lines:

```
pass 2.1 classes: Sword 49% -> 1.014, Mace 46% -> 1.154, Tank 45% -> 1.154, Attacker 52% -> 1.21, Fighter 58% -> 1.2
pass 2.2 classes: Sword 52% -> 1.005, Mace 56% -> 1.117, Tank 46% -> 1.175, Attacker 46% -> 1.236, Fighter 50% -> 1.202
pass 2.3 classes: Sword 47% -> 1.021, Mace 47% -> 1.134, Tank 58% -> 1.129, Attacker 49% -> 1.243, Fighter 50% -> 1.205
pass 2.4 classes: Sword 49% -> 1.024, Mace 49% -> 1.141, Tank 50% -> 1.129, Attacker 52% -> 1.23, Fighter 50% -> 1.206
pass 2.5 classes: Sword 50% -> 1.022, Mace 51% -> 1.135, Tank 50% -> 1.131, Attacker 51% -> 1.226, Fighter 48% -> 1.216
pass 2.6 classes: Sword 47% -> 1.039, Mace 49% -> 1.142, Tank 49% -> 1.137, Attacker 52% -> 1.212, Fighter 53% -> 1.196
```

## 4. What I could NOT verify, and why
- **Real two-device play.** The new `Snapshot` fields (`ults`, per-fighter `ult/ultEnd/locked/hitHigh/tension`) are plain JSON, and `resumeMatch` copies them,
  but I never ran two browsers over WebRTC (no TURN/second network here). The disconnect/resume path with a lock in progress is untested.
- **Phones and gamepads.** The touch ULT button (BLOCK + SPECIAL together) and S+L on a gamepad (LB/RB/LT + B) are read off the code, not tried on hardware.
- **Real AI calls.** Gemini/Claude were not called (no key); `check-stats.ts` covers the parsing with a canned Gemini reply, including a missing ultimate and one that repeats slot 1.
- **Balance is CPU vs CPU** (hard), as before. Humans lock, block and time ultimates differently; expect to revisit once people play it.
- The admin page (`/admin`) does not show the ultimate yet.
- `DUR` sits at 46% in the final run (limit 45%): it passes deterministically (seeded), but it is the thinnest margin.

## 5. How to test it by hand
1. Log in as `demo1@inkfight.app` / `inkfight123`, open **/play/cpu**, pick Sir Scribbles vs Margin Mage, **Fight!**.
2. Fill the meter by landing hits (J, K). At half the console button turns gold: **L** fires slot 1 (quick, small). At full it pulses red and the HUD says ULTIMATE READY:
   hold **S** and tap **L**. Expect: the page blacks out, the banner shows the ultimate's name, the camera pushes in once it grabs, the opponent shakes in place while echo
   hits land, an inverted impact frame with wedges flashes on the hits, and the end launches them.
3. Block (S held) before the ultimate arrives: it must not lock. Mash buttons while held: nothing happens.
4. **/build**: pick Weapon, then the new "Ultimate (S + L, full meter)" row; each pick replays in the training room (dummy). Each weapon shows its cosmetic: sheath, wraps, orbs, shoulder pads, headband.
5. **/create** (upload) > "Correct the AI": the new Ultimate dropdown. Character pages and cards show the ultimate under the special.
6. Hurt a fighter below 30% (60 HP): a thin red bar appears under the health bar, a red aura and embers, and the meter refills faster.
7. Tick **Reduce flashes** in the console (or the gear panel on a phone) and repeat step 2: a gold ring replaces the inverted frame.
8. Head/body recoil: hook or headbutt = head snaps back; jab/cross = body folds over.
9. Stats: `Fighter` with DUR 100 (a shield-heavy build) is visibly broader; SPD 100 is lean with longer legs.
