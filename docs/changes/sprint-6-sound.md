# Sprint 6a: sound (branch `sprint-6-sound`)

Branched from `origin/main` (`fac3290`). Nothing pushed to `main`, nothing deployed.

## 1. What changed

- **`src/game/sound.ts` (new):** procedural Web Audio, no asset files. Thirteen recipes built from two helpers (`blip`: a pitched
  oscillator gliding between two frequencies; `burst`: filtered noise with a sweeping filter): `punch`, `kick` (pitch, length and
  loudness follow the damage: bigger = lower, longer, louder), `block`, `whiff` (the swish when a swing starts), `slip` (a dodge),
  `special`, `ultimate`, `clash`, `ko`, `round`, `skill`, `phase` (a boss changing form), `tap` (UI).
- **Light on a phone:** one `AudioContext`, one master chain (compressor, then gain 0.55) and one shared 1 s noise buffer, all created
  once; at most 10 voices sound at once (ordinary sounds past the cap are dropped; KO, ultimate, special, round and phase are never dropped);
  a voice frees its slot when its last node ends.
- **Autoplay:** the context is created on the first `pointerdown`, `keydown` or `touchend` (capture phase, passive) and resumed if the
  browser suspended it (`installUnlock`, armed by the header toggle, which is on every page, and by the fight switch).
- **Wired to the fight (`src/game/render.ts`):** `Renderer.effect()` plays the sound next to each visual: hit (thud by damage; a kick
  sounds heavier than a fist; blocked or absorbed = a tock), special/ultimate start, dodge, clash, skill, KO, round start, boss phase. A
  swing's whiff swish is played from `ingest()` when a punch or kick starts (`timer + t` names the swing so it plays once).
  Events already in the first snapshot of a renderer that joins mid-match are shown but not played, so a guest joining doesn't get a burst.
  The training room (`MovePreview`) uses the same renderer, so picks there make sound too.
- **The switch:** `src/components/SoundSwitch.tsx`: `SoundToggle` (speaker icon in the header, `aria-pressed`) and `SoundSwitch` (a
  checkbox in the desktop console and in the phone controls' settings gear). The choice is `localStorage["inkfight.sound"]`, default on,
  separate from "Reduce flashes"; turning it on plays a tap.
- **`scripts/check-sound.ts` (new)** and the real-browser checks below.

Files: `src/game/sound.ts`, `src/components/SoundSwitch.tsx`, `src/game/render.ts`, `src/app/layout.tsx`,
`src/components/Controller.tsx`, `src/components/TouchControls.tsx`, `scripts/check-sound.ts`.

## 2. Decisions

- No UI-tap sound on every control press: a punch already swishes and thuds, and a click on top is noise. `tap` is used by the switch.
- The recipes take a `Rig` (context, destination, noise, start time, power), so the same code runs against a live context and an
  `OfflineAudioContext` (that is how it was measured without ears, see section 4).
- Sound defaults to **on**, as the sheet says, but nothing can play before a gesture; the first press anywhere starts it.
- `check-sound.ts` is a new check script, added to this part's gate (the sheet's gate has no sound check).

## 3. Gate output

Local Postgres: system PostgreSQL 16 (`pg_ctlcluster 16 main start`), `prisma migrate deploy`, dummy `AUTH_SECRET`; `npm ci` first because
`main` added `@supabase/realtime-js`, then `prisma generate` and `next typegen`.

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

$ npx tsx scripts/check-sound.ts
check-sound: all good (13 effects, 269 nodes built)
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
✓ Running next.config.ts took 37ms

  Creating an optimized production build ...
✓ Compiled successfully in 14.9s
  Running TypeScript ...
  Finished TypeScript in 8.6s ...
  Collecting page data using 3 workers ...
  Generating static pages using 3 workers (0/18) ...
  Generating static pages using 3 workers (4/18) 
  Generating static pages using 3 workers (8/18) 
  Generating static pages using 3 workers (13/18) 
✓ Generating static pages using 3 workers (18/18) in 310ms
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

- **How it sounds.** I can't hear. What I did instead: rendered every recipe offline in headless Chromium with an `OfflineAudioContext`
  (the module bundled with esbuild, recipes run at power 0.1 and 0.9, then measured peak, RMS and the time the signal stays above 0.003).
  Every effect is audible (peak 0.09 to 0.64 before the master gain), nothing clips, hits get louder and longer with power, and the
  ultimate, KO and phase sounds last 0.6 s while hits last 60 to 135 ms. Whether they are pleasant is a matter for your ears; the numbers
  are the knobs at the top of each recipe in `sound.ts`.
```
punch@0.1      {"peak":0.373,"rms":0.0157,"ms":61}
punch@0.9      {"peak":0.569,"rms":0.0272,"ms":109}
kick@0.1       {"peak":0.507,"rms":0.019,"ms":85}
kick@0.9       {"peak":0.688,"rms":0.0275,"ms":135}
block@0.1      {"peak":0.292,"rms":0.0055,"ms":31}
block@0.9      {"peak":0.282,"rms":0.0055,"ms":33}
whiff@0.1      {"peak":0.117,"rms":0.0031,"ms":58}
whiff@0.9      {"peak":0.09,"rms":0.0028,"ms":61}
slip@0.1       {"peak":0.155,"rms":0.0034,"ms":50}
slip@0.9       {"peak":0.164,"rms":0.0036,"ms":54}
special@0.1    {"peak":0.176,"rms":0.0097,"ms":174}
special@0.9    {"peak":0.147,"rms":0.0095,"ms":174}
ultimate@0.1   {"peak":0.469,"rms":0.0507,"ms":665}
ultimate@0.9   {"peak":0.468,"rms":0.0508,"ms":665}
clash@0.1      {"peak":0.315,"rms":0.0076,"ms":57}
clash@0.9      {"peak":0.331,"rms":0.0077,"ms":59}
ko@0.1         {"peak":0.584,"rms":0.0541,"ms":621}
ko@0.9         {"peak":0.522,"rms":0.054,"ms":600}
round@0.1      {"peak":0.17,"rms":0.0117,"ms":322}
round@0.9      {"peak":0.17,"rms":0.0117,"ms":322}
skill@0.1      {"peak":0.207,"rms":0.006,"ms":78}
skill@0.9      {"peak":0.173,"rms":0.006,"ms":80}
phase@0.1      {"peak":0.445,"rms":0.0314,"ms":611}
phase@0.9      {"peak":0.384,"rms":0.0318,"ms":613}
tap@0.1        {"peak":0.099,"rms":0.0024,"ms":18}
tap@0.9        {"peak":0.099,"rms":0.0024,"ms":18}
```
- **A real phone.** Not tested on iOS Safari or Android Chrome (autoplay rules, the context being suspended again after a call or when
  the screen locks, the silent switch). The code resumes a suspended context on every gesture, which is the usual fix, unproven here.
- Audio latency and the load of ten voices on a mid phone.

What I did check in a real browser (headless Chromium, local dev server, logged in): no `AudioContext` exists before a gesture; after
the login clicks there is one and it is `running`; during a vs-computer fight with sound on the page built 20 oscillators and 31 noise
bursts in 7 s; after pressing the header mute button (`localStorage` = `0`) a further 5 s of fighting built none; no console errors.

## 5. How to test by hand

1. Open any page and click anywhere (the browser needs a gesture), then fight the computer (`/play/cpu`): punches thud, kicks are lower,
   blocks tock, every swing swishes, specials rise, the ultimate (S + L at a full meter) is the biggest sound, a clash rings, the KO falls.
2. Click the speaker icon in the header: everything goes quiet, the choice survives a reload. The same switch is the "Sound" checkbox under
   the console on desktop and in the gear panel on a phone.
3. Turn "Reduce flashes" on and off: it is independent of the sound switch.
4. `/build`: picking a special or an ultimate plays it on the dummy, with sound.
5. `npx tsx scripts/check-sound.ts` runs the fake-audio check.
