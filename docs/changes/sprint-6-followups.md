# Sprint 6c: admin and small follow-ups (branch `sprint-6-followups`)

Branched from `origin/main`. Nothing pushed to `main`, nothing deployed. I did not touch `src/game/useGameRoom.ts`,
`src/game/relay.ts` or `src/app/api/rooms/**`. This part changes `src/game/sim.ts` (one spot, below) and, because of it,
`src/game/cpu.ts` and the class factors in `src/game/moves.ts`.

## 1. What changed

- **`/admin` shows the ultimate and the side skill** of every design (`src/app/admin/page.tsx`, `AdminDesigns.tsx`): "Special: kind: name",
  "Ult: kind: title", "Skill: name", each marked "(default)" when the design has no stored pick (the class default is what fights use).
  The search box matches them too.
- **Re-cut also fixes the white cut-outs from before Sprint 4, once.** `src/lib/cutout.ts` (`CUT_PREFIX = "tcut-"`, `isTransparentCutout`,
  `needsRecut`): new uploads and re-cuts are stored as `tcut-*.png`. A design needs the re-cut when its file isn't a sample and doesn't start
  with `tcut-`, so every row that was cut before (`cut-*`, white) or never cut (photo) is listed once, and a done row can't come back (its file
  name changed). Button: "Re-cut N old images". `PUT /api/characters/[id]/image` and `POST /api/characters` use the prefix (`src/lib/storage.ts`
  takes it). The route still deletes the old file and resets rotation and pose.
- **The ultimate press while reeling is queued** (`src/game/sim.ts`, the one spot): `Fighter.ultQ`. An S + L press (S held, L pressed) made in
  hit-stun sets `ultQ`; on the first free tick, if the meter holds 100, the ultimate starts (`startSpecial(m, f, true)`), else the press is dropped,
  so a stale press never fires seconds later. A fighter held by an ultimate (`locked`) can't queue (cleared in `lockOn`). Same shape as `skillQ`.
- **CPU:** it no longer presses specials while it is reeling (`reelFree` in `src/game/cpu.ts`). Without this the CPU started queueing ultimates
  too (it holds block while hit and presses special), which moved Tank-Fighter to 62-67%. The queue is for people; the CPU waits for its moment,
  as it effectively did before (a press in hit-stun was lost).
- **Touch:** `src/components/TouchControls.tsx` holds the block for `GUARD_HOLD_MS = 160` after an ULT tap, so a quick tap on the phone arrives as
  S + L even though the thumb is not on a guard button (see 4).
- `scripts/check-sim.ts`: asserts for the queue (below). Class factors (`CLASS_TUNE` in `moves.ts`) re-tuned with
  `npx tsx scripts/balance.ts --tune 320 classes`.

Files: `src/lib/cutout.ts` (new), `src/lib/storage.ts`, `src/app/api/characters/route.ts`, `src/app/api/characters/[id]/image/route.ts`,
`src/app/admin/page.tsx`, `src/app/admin/AdminDesigns.tsx`, `src/game/sim.ts`, `src/game/cpu.ts`, `src/game/moves.ts`,
`src/components/TouchControls.tsx`, `scripts/check-sim.ts`. No migration.

## 2. Decisions

- Marking a re-cut row done by file name (`tcut-`) needs no column and no migration, and it survives a re-upload.
- The queue is one rule in the idle branch, so an ultimate cannot start while the fighter is still reeling, mid-swing or locked. A press made
  during the fighter's own swing (not hit-stun) is still lost, as before: outside this task.
- The CPU change is a balance decision, not a mechanic change: the queue exists for players, and a CPU that queues makes pairs lopsided.
- Class factors moved (`CLASS_TUNE` Sword 1.027 -> 1.017, Mace 1.099 -> 1.109, Tank 1.168 -> 1.144, Attacker 1.203 -> 1.214, Fighter 1.208 -> 1.211).
  Several tuning rounds (N=160, then 320) were noisy at the edge: the gate below is the third full run, with Sword-Tank and Tank-Fighter at 60%.

## 3. Gate output

Local Postgres as in `MEMORY.md` (system PostgreSQL 16, dummy `AUTH_SECRET`); `npm ci`, `prisma generate`, `next typegen` first.

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

$ npx next build
▲ Next.js 16.3.8 (Turbopack)
✓ Running next.config.ts took 28ms

  Creating an optimized production build ...
✓ Compiled successfully in 824ms
  Running TypeScript ...
  Finished TypeScript in 3.1s ...
  Collecting page data using 3 workers ...
  Generating static pages using 3 workers (0/18) ...
  Generating static pages using 3 workers (4/18) 
  Generating static pages using 3 workers (8/18) 
  Generating static pages using 3 workers (13/18) 
✓ Generating static pages using 3 workers (18/18) in 403ms
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
├ ƒ /api/turn
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

New asserts in `scripts/check-sim.ts`: S + L in hit-stun with a full meter is queued and the ultimate starts on recovery and spends the meter;
a plain L (no S) in hit-stun is not queued and nothing fires later; with a half meter nothing starts and the queue is cleared; a press made with a
full meter but followed by a drained meter doesn't fire; a fighter held by a slash ultimate can't queue. I confirmed the first assert fails with
the sim.ts change removed.

## 4. What I could NOT verify

- A real phone. I drove the SKILL and ULT touch buttons with Playwright in headless Chromium, mobile device emulation with real touch events
  (CDP `Input.dispatchTouchEvent` through `touchscreen.tap` and held touches), inside a CPU fight: SKILL fires the side skill, ULT with a thumb
  held on the guard and an instant tap both start the ultimate (the instant tap needed the 160 ms hold). That is not a thumb on glass: multi-touch
  feel, button size on small screens, haptics and a gamepad were not tried.
- The admin re-cut was run in the browser against a local DB with a seeded white cut-out and a photo: both were listed, re-cut once, the button
  then showed no rows. Not run against production data.
- Balance is CPU vs CPU only; how a human uses the queue was not measured.

## 5. How to test by hand

1. `/admin` (as an admin): each design card shows Special, Ult and Skill lines; search "meteor" or "Blade" and the list filters.
2. `/admin`: "Re-cut N old images" appears while any design isn't a `tcut-` file; run it, reload, the button is gone and the images sit on
   transparent backgrounds (check the avatar on a dark page).
3. `/play/cpu`: fill the meter (take hits), get hit, then press S + L during the hit-stun: the ultimate starts as you recover. With the meter
   under full nothing happens.
4. Phone (or DevTools device mode with touch): the SKILL and ULT buttons; tap ULT quickly while being hit with a full meter.
