# Sprint 6b: shareable result card (branch `sprint-6-share`)

Branched from `origin/main` (`fac3290`). Nothing pushed to `main`, nothing deployed. I did not touch `src/game/useGameRoom.ts`,
`src/game/relay.ts` or `src/app/api/rooms/**`.

## 1. What changed

- **The card (`src/lib/shareCard.tsx`):** `renderCard(a, b, score, link)` returns a 1080 x 1080 `ImageResponse` (Satori): notebook page
  (ruled lines, red margin), the `inkfight` wordmark, both fighters' cut-out drawings in white boxes (the winner's boxed in gold), names
  (ellipsised), WINNER / DEFEATED, the score, "Fought on InkFight" and the link. Drawings are read where they live (sample art in
  `public/samples`, `uploads/` on disk, the boss-art route handler, or an https URL on our Blob store) and inlined as data URIs, so the
  card never fetches from a host the request chose.
- **Stored (online) battles:** `src/app/battle/[id]/page.tsx` shows the result (both fighters, score, damage, date, Share, links to
  create and the leaderboard) and `src/app/battle/[id]/opengraph-image.tsx` is its 1080 x 1080 OG image (Next's file convention adds the
  `og:` and `twitter:` tags). The page is public, so a shared link opens logged out. The player page's recent-fights dates now link to it.
- **CPU fights (not stored):** `src/app/card/route.tsx` (`GET /card?a=&b=&sa=&sb=`, the PNG) and `src/app/share/page.tsx`
  (`/share?...`, the page with the card and its meta tags). Both validate: `a` and `b` must be a stored, non-hidden design or a dungeon
  boss (`boss-1` to `boss-10`), and the score must be one a match can end with (2-0 or 2-1, either way round: `parseScore`).
  `/card` is rate-limited per IP (40 a minute) and cached for an hour.
- **Finding the battle of an online fight:** `GET /api/battles/lookup?a=&b=` (logged in, rate-limited) returns the newest battle
  between two fighters in the last 15 minutes (either seat order). The host reports the result a moment after the match ends, so the
  button asks up to three times, 1.2 s apart, and falls back to the `/share` link if nothing is stored (an AI-played or admin-buffed fight).
- **"Share result" button (`src/components/ShareResult.tsx`):** `navigator.share` where the browser has it, else the link is copied
  ("Link copied"). On the online result overlay (`RoomClient.tsx`) and the vs-computer overlay (`CpuClient.tsx`, which also serves the
  dungeon; hidden for the built-in sample fighters, which have no stored design).
- `src/lib/shareScore.ts` (pure score parsing, shared) and `scripts/check-share.ts`.

Files: `src/lib/shareCard.tsx`, `src/lib/shareScore.ts`, `src/app/card/route.tsx`, `src/app/share/page.tsx`,
`src/app/battle/[id]/page.tsx`, `src/app/battle/[id]/opengraph-image.tsx`, `src/app/api/battles/lookup/route.ts`,
`src/components/ShareResult.tsx`, `src/app/play/[code]/RoomClient.tsx`, `src/app/play/cpu/CpuClient.tsx`,
`src/app/player/[id]/page.tsx`, `scripts/check-share.ts`. No migration.

## 2. Decisions

- The sheet's `src/app/share/[id]/opengraph-image.tsx` became `battle/[id]/opengraph-image.tsx` (the page it belongs to) plus a plain
  `/card` route for the query-built card; both call the same drawing function.
- Images are loaded from disk, the boss-art handler or our Blob host only (never from the `Host` header), so a forged request can't make
  the server fetch another site.
- A stored battle with no usable `wins` in its log (older rows) is drawn as 2-0 for the winner.
- Default font only (no font files, so no bundle weight): the card's text is Satori's default sans.
- The lookup is a new route under `api/battles/` (not `api/rooms/`), since the overlay can't learn the battle id from `useGameRoom.ts`.

## 3. Gate output

Local Postgres as in `MEMORY.md` (system PostgreSQL 16, dummy `AUTH_SECRET`); `npm ci`, `prisma generate`, `next typegen` first.

```
$ npx tsc --noEmit
exit 0

$ npm run lint

> inkfight@0.1.0 lint
> eslint


/home/user/InkFight/src/lib/shareCard.tsx
  8:10  warning  'parseScore' is defined but never used  @typescript-eslint/no-unused-vars

✖ 1 problem (0 errors, 1 warning)

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

$ npx tsx scripts/check-share.ts
check-share: all good
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
✓ Running next.config.ts took 34ms

  Creating an optimized production build ...
✓ Compiled successfully in 2.7s
  Running TypeScript ...
  Finished TypeScript in 7.5s ...
  Collecting page data using 3 workers ...
  Generating static pages using 3 workers (0/20) ...
  Generating static pages using 3 workers (5/20) 
  Generating static pages using 3 workers (10/20) 
  Generating static pages using 3 workers (15/20) 
✓ Generating static pages using 3 workers (20/20) in 303ms
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
├ ƒ /share
└ ƒ /signup


○  (Static)   prerendered as static content
ƒ  (Dynamic)  server-rendered on demand

exit 0
```

## 4. What I could NOT verify

- **The overlay buttons end to end.** I did not play a match to its end in a browser (a headless run can't win a best-of-three
  quickly), so the "Share result" button on the two overlays was only type-checked and linted; the same `ShareResult` component and the
  `/battle` and `/share` pages were exercised in the browser (below).
- **A real phone's share sheet** (`navigator.share`): headless Chromium has none, so only the copy fallback ran ("Link copied", the
  clipboard held `http://localhost:3001/battle/<id>`).
- **How the link previews look in WhatsApp, Discord, X or iMessage:** I checked that the tags are there and the image is a 1080 x 1080
  PNG, not what each app renders (and crawlers need a deployed, public URL, not `localhost`).
- The online fallback path with a real host reporting a real battle (I inserted a `Battle` row by hand and removed it afterwards).

What I did verify (headless Chromium and curl against the local dev server): the card PNG for a stored battle and for a CPU fight against
a boss (read by eye: both drawings, names, score, gold on the winner; I fixed an overflow and wrapping names); the `og:` and `twitter:`
tags on `/battle/[id]` and `/share`; 404 for a missing battle and for a bad `/share`; `/card` answers 400 for an unknown fighter, an
impossible score (2-2) and `boss-12`; the lookup answers 401 logged out, finds the battle in either seat order, nothing for the same
fighter twice, 400 for junk and nothing once the battle is older than 15 minutes; no console errors.

## 5. How to test by hand

1. Finish an online match (two windows) and press **Share result** on the overlay: on a phone the share sheet opens with
   `/battle/<id>`; on a desktop the link is copied. Open it logged out: result page with the score and both fighters.
2. Finish a vs-computer fight (or a Dungeon fight) and press **Share result**: you get `/share?a=...&b=...&sa=2&sb=1`; the page shows
   the card. Edit the score to `sa=2&sb=2` or a fighter id to `x` and you get a 404.
3. Open `/card?a=<your fighter id>&b=boss-3&sa=2&sb=0` directly: the PNG.
4. Paste a deployed `/battle/<id>` into a chat app and look at the preview (`og:image` is the card).
5. `/player/<id>`: the date on each recent fight links to its `/battle/<id>`.
6. `npx tsx scripts/check-share.ts` checks which scores are accepted.
