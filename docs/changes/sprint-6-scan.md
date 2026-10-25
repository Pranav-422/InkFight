# Sprint 6d: scans that look like the player drew them (branch `sprint-6-scan`)

Branched from `origin/main` (`04353ac`). Nothing pushed to `main`, nothing deployed. I did not touch `src/game/useGameRoom.ts`,
`src/game/relay.ts`, `src/app/api/rooms/**` or `src/game/sim.ts`. No migration (the boxes live in the `Character.pose` JSON).

## 1. What changed

- **`src/lib/vision.ts`:** the `pose` object takes two optional fields, `head_box` `{x, y, r}` (the drawn head only: centre as fractions of the
  image, `r` as a fraction of the image's longer side) and `item_box` `{x0, y0, x1, y1}` or `null` (the held item's bounding box). The prompt
  (shared by Claude and Gemini) asks for both. `validPose` is now exported and checks each box on its own: a head box must have a plausible radius
  (1-20% of the long side) and sit on the head joint; an item box must be a real rectangle (0.05%-50% of the image) with a hand at or next to it.
  A box that fails is dropped and the joints stay; a reply without boxes (or an old stored pose) works as before.
- **`src/game/sprite.ts`:**
  - `boxesFromPose` maps the boxes into the cut-out like the joints (rotation, crop, scale; a rotation can swap the item corners).
  - `cutHead` crops exactly the head box (radius x 1.05 so the outline isn't clipped); without a box it is the old circle around the head joint.
  - `propSide` takes the item box as a hint: only ink inside the box plus a margin (`max(2 pen widths, 3% of the body)`) can be the item, and the
    old rules still apply (not the arm stroke, connected through the forearm to the hand). The head exclusion radius comes from the box when there
    is one. If the box finds nothing that touches the hand, the old search runs without it.
  - **Head cleanup** (`headSpecks`, pure, exported): drops ink specks smaller than a few pixels and shading hatches, found twice: as loose
    strokes apart from the face, and, with the outline's ring (outer 20% of the radius) cut away, as strokes growing out of the outline. Hatching
    means 4 or more short, thin, roughly parallel strokes (3 when they grow out of the outline); fewer are brows or a mouth and stay. The faint
    antialiased fringe round an erased stroke goes with it. If the cleanup would remove more than 40% of the head's ink it does nothing.
- `scripts/check-stats.ts`: a scribbled-head case (outline, eyes, mouth, specks, loose hatching), a hatching-at-the-outline case, brows + mouth
  untouched, box mapping (`boxesFromPose`), and the Gemini canned reply now carries both boxes (kept; a stray head box and a stray item box are
  dropped while the joints stay; a reply without them still gives a pose).

Files: `src/lib/vision.ts`, `src/game/sprite.ts`, `scripts/check-stats.ts`.

## 2. Decisions

- Both boxes are optional in the schema: a model that skips them must not fail the whole analysis (it would fall back to the offline generator).
- A `null` item box falls back to the old held-item search rather than meaning "no item": the class comes from the item list, and the box is
  only a hint for the cut. Offline (no key) there are no boxes, so the head circle and prop search are exactly the old code paths.
- The cleanup also runs on the offline head circle (it is a few lines of pure pixel work on the crop and never removes the outline or more than 40%
  of the ink). It is the only change on that path.
- The cleanup is deliberately conservative ("cleanup, not redrawing"): marks that touch other marks, hatching merged with an eye, and the short
  stubs of hatching left on the outline ring stay.

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

$ npx tsx scripts/dungeon.ts
floor  boss                    clear   target   (100 matches each, normal CPU as the player, 5 classes)
    1  Smudge                    82%     85%
    2  Cinder Knuckle            75%     78%
    3  Volt Nib                  63%     70%
    4  Whiteout                  59%     62%
    5  Prince Vellum             53%     54%
    6  Dawnstroke                43%     46%
    7  Ferrule                   38%     38%
    8  Hardcover Atlas           34%     30%
    9  Asymptote                 15%     22%
   10  The Redline Regent        17%     15%
curve: falls floor by floor
exit 0

$ npx next build
▲ Next.js 16.3.8 (Turbopack)
✓ Running next.config.ts took 35ms

  Creating an optimized production build ...
✓ Compiled successfully in 3.5s
  Running TypeScript ...
  Finished TypeScript in 7.3s ...
  Collecting page data using 3 workers ...
  Generating static pages using 3 workers (0/18) ...
  Generating static pages using 3 workers (4/18) 
  Generating static pages using 3 workers (8/18) 
  Generating static pages using 3 workers (13/18) 
✓ Generating static pages using 3 workers (18/18) in 376ms
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

## 4. What I could NOT verify

- **Real AI boxes.** There is no API key here and no `./uploads` photos (the folder is empty in this environment), so no real model has drawn a
  `head_box` or `item_box`: the parsing/validation is tested with a canned Gemini reply only. Whether the prompt gets good boxes from real
  drawings needs a key and a few real scans.
- **Real photos.** I used one synthetic figure drawn on a canvas (head with a hat, hair scribbles, hatching and specks, a sword with a dangling
  ribbon, a decoy scribble by the other hand), loaded through `loadSprite` in headless Chromium (esbuild bundle of `sprite.ts` on a page):
  - Head: with the head box the crop is the full drawn circle without the hat and hair that the offline circle picks up; three of the five hatches
    that grow out of the outline are erased, the two that merged with the eye dot and the stubs on the ring stay; the mouth is kept.
  - Item: with the box the dangling ribbon is mostly gone from the prop (126 x 202 px against 127 x 248 without the box); a few ticks of it inside
    the margin remain.
  - Upstream of this change the figure cutter (`cutFigure`) already drops small marks that aren't linked to the figure, and in the test it also
    dropped the eye dots; that is not changed here.
- Not seen in the arena (stickman wearing the new head), the upload flow end to end, or on a phone.

## 5. How to test by hand

1. `npx tsx scripts/check-stats.ts` (pure parts: cleanup, box mapping, Gemini reply with boxes).
2. With a key (`GEMINI_API_KEY` or `ANTHROPIC_API_KEY`): upload a scan of a figure with a hat or hair and a sword/staff; open the character page
   and the arena: the head should be just the drawn head, the item the whole weapon without the cuff or ribbon. Look at the stored pose
   (`Character.pose` in the DB): it has `head_box` and `item_box`.
3. Without a key: upload the same drawing; the offline path is as before (head circle from the joints) apart from the specks/hatching cleanup.
4. A scribbled face (shading lines across the face): the face should still read, with the loose shading gone and the eyes, mouth and outline
   untouched.
