# InkFight: design prompts for every screen, and the arena

For a design tool (Google Stitch, Figma AI, v0, Lovable, Galileo...). Paste **the design system prompt
first**, then one screen prompt at a time. Ask for **mobile first (390 × 844)** and a desktop version
(1440 wide). Bring the results back and the code can follow them screen by screen.

What the screens are about, so the tool doesn't guess: you draw a stick figure on paper, photograph it (or
build one from parts), and it becomes a fighter you control live against a friend on their phone, the
computer, or dungeon bosses. Its power comes from the drawing: the held item picks the class, the look
sets five stats.

---

## 0. Design system prompt (paste first, every time)

```
Design system for "InkFight", a mobile-first web game where hand-drawn stick figures fight.

Mood: a school notebook come alive. Off-white paper (#f7f5f0) with faint blue ruled lines and a red margin
line; black ink (#17171a); accents: hit red (#e5482d) for attacks and calls to action, guard blue (#2f5be0)
for defence and skills, gold (#f2b705) for specials, wins and rewards. Muted text #6b6a66, hairlines #e4e1d9.
Everything else should look drawn: doodled icons, slightly wobbly ink outlines, tape and sticky-note
accents, marker underlines, paper-cut shadows. Never glossy, never neon-gamer, never stock 3D.

Type: Bricolage Grotesque (extra bold) for headings, numbers and buttons; Inter for body. Big confident
headings, short copy, playful trash-talk tone ("Your doodle. Your fighter.").

Components: chunky rounded buttons (radius 16) with a 3 px "pressed paper" bottom shadow; cards like paper
scraps with a soft shadow; stat bars as marker strokes (STR red, DUR blue, SPD gold, AGI green, IQ violet);
class badges (Sword, Mace, Tank, Attacker, Fighter) as small inked stamps; fighter avatars are stick
figures in the drawing's own ink colour on white.

Mobile rules: one column, 16 px side gutters, thumb-reachable primary action at the bottom (sticky bar when
a page scrolls), touch targets at least 44 px, no hover-only actions, bottom tab bar instead of a crowded
top nav (Home, Fight, New fighter, Dungeon, Me). Respect safe areas. Light theme only.
```

## What looks weak today (from phone screenshots)

- The top nav crams 5 links plus the account into 390 px; the back arrow and logo compete with it.
- Pages are long walls of text and chip rows (the builder is a very long scroll before the preview).
- Cards all look the same: no hierarchy between "do this now" and "nice to know".
- The fight HUD eats the top of a landscape phone screen; the touch buttons are semi-transparent blobs.
- Portrait during a fight is a black "turn your phone" page with nothing else.
- Little motion or feedback outside the arena: no screen transitions, no celebration after a win.

---

## 1. Landing (logged out)

```
InkFight landing page, logged-out visitor on a phone. Goal: understand the idea in 5 seconds and either try
a sample fight (no account) or sign up.
Hero: headline "Your doodle. Your fighter." with "fighter" in hit red and a marker underline; one line:
"Draw a stick figure, snap a photo, and fight your friend's drawing live."; primary button "Start drawing,
it's free"; secondary text link "Try a sample fight, no login".
Below the fold: a looping mini arena showing two drawn stick figures fighting (POW! comic word); a 3-step
strip "Draw · Scan · Fight" as notebook doodles; "Power comes from the drawing" showing a sword → Sword class,
shield → Tank, book → Attacker, bare fists → Fighter as taped polaroids; a "Recent fighters" carousel of
stick-figure avatars with names and class stamps; footer with Gallery and Leaderboard.
```

## 2. Log in / Sign up

```
InkFight log in and sign up screens on a phone. A small notebook-page card centred on paper: email,
password (show/hide), primary button, link to the other screen. Sign up also asks for a fighter-handle
(public name). Friendly error states written in the game's voice ("That password didn't land."). If the
visitor came from a friend's invite link, show a sticky note on top: "Your friend challenged you. Sign up
and scan your fighter." Keep it to one screen with no scrolling on 390 × 844.
```

## 3. Home (logged in)

```
InkFight home dashboard on a phone, for a logged-in player. Top: greeting "Hey InkNinja" and a record line
(wins / losses, best rank) as hand-written notes. Primary card: "Fight a friend" (create a room, share a
link). Secondary row of three cards: "Vs computer", "The Dungeon" (shows the next floor and the boss's
silhouette), "New fighter". Then "My fighters": horizontal cards with the stick-figure avatar, name, class
stamp and the five marker stat bars; tap opens the fighter. Bottom tab bar.
```

## 4. Scan a new fighter (upload)

```
InkFight "scan a new fighter" flow on a phone, in three steps with a progress line. Step 1, Capture: a big
camera button ("Take a photo") and "upload from gallery"; tips as doodled sticky notes (dark lines, good
light, plain paper, give it gear). Step 2, Check: the cut-out figure shown on white, a "Turn" button, a
detected-item chip ("Holding: sword ▾") the player can correct, optional name field, and a collapsible
"Correct the AI" drawer (fighting style, special, ultimate, side skill, element) with a small live training
dummy preview. Step 3, Analyzing: a fun loading state with rotating jokes ("Negotiating stats with the
judges...") and an ink-splash progress. The primary button always sits at the bottom of the screen.
```

## 5. Build a fighter (from parts)

```
InkFight fighter builder on a phone, as a character creator: the live stick-figure preview (with a small
training dummy that replays the picked move) stays pinned in the top half while the options scroll below
in tabs: Look (head shape, ink colour), Gear (item, which sets the class), Moves (fighting style, special,
ultimate), Skill (side skill), Element, Name. Each option is a big tappable tile with a doodle icon and a
one-line description, not a row of text chips. Sticky bottom bar: the class stamp and "Build it". On
desktop: preview on the right, options on the left.
```

## 6. Fighter page

```
InkFight fighter profile page on a phone. Hero: the stick-figure avatar playing its idle animation on
white, name, "drawn by @handle", class stamp, element chip. Five stat bars with numbers. Cards for the
moves: Special (L, half a meter), Ultimate (S + L, full meter), Side skill (U) with a one-line effect and
cooldown, Fighting style with the punch / weapon combo and the kick combo as move chips. A collapsible "Why
these stats?" explaining what was measured. Owner actions (rename, rotate, flip item, delete) in a "..."
menu. Sticky bottom bar: "Fight a friend" and "Practice vs computer". If it isn't yours: "Fight X vs
computer".
```

## 7. Play hub

```
InkFight "Fight" hub on a phone. Three big choices as paper cards: "Fight a friend" (create room: shows a
room code and a Share button; or join with a code field), "Vs computer" (difficulty Easy / Normal / Hard as
three stamps), "The Dungeon" (10 floors, next boss teaser). Plus "Sample fight" as a small text link.
```

## 8. Room lobby (online)

```
InkFight online room lobby on a phone. Top: room code in big type with Copy and Share (WhatsApp, link)
buttons and a QR code toggle. Two fighter cards facing each other with a crossed-swords doodle between:
avatar, name, class stamp, three key stats, special and ultimate names; the opponent card shows a dashed
"Waiting for a challenger..." placeholder until someone joins, then "connecting..." with a pulse. A status
strip for connection notices. Primary button "I'm ready" (becomes "Ready! tap to cancel"); a line "The
fight starts when both players are ready". Error state card: "Couldn't reach your friend's device" with
"Try again" and "New room".
```

## 9. Vs computer picker

```
InkFight "vs computer" setup on a phone. Step 1: pick your fighter (horizontal avatar carousel). Step 2:
pick the opponent from a grid of gallery fighters (avatar, name, class stamp, owner). Step 3: difficulty
stamps. Sticky bottom: "Fight!". Keep it one screen with sections, not separate pages.
```

## 10. Fight screen (landscape phone): HUD and controls

```
InkFight in-fight HUD for a landscape phone (844 × 390), drawn over the arena. Keep the top bar thin
(max 56 px): both fighters' names, HP bars as thick marker strokes, round-win dots, a round timer in the
middle; under each HP bar a thin special meter (gold, with a half-way tick for the 50% special and
"ULTIMATE READY" at full) and a tiny blue skill-cooldown bar. Touch controls: a floating joystick under the
left thumb (appears where the thumb lands) and an arc of buttons under the right thumb: PUNCH (largest),
KICK, BLOCK, SPECIAL (fills with gold as the meter fills, pulses when ready) and SKILL (blue, cooldown
ring). Buttons are solid paper discs with ink outlines and press animations, not translucent blobs. Small
pause and settings icons at the top centre (settings: left-handed layout, control size, reduce flashes,
sound). Also design: the round intro ("ROUND 1 · FIGHT!"), the K.O. banner, the "turn your phone sideways"
screen as a fun illustration of a stick figure rotating a phone, and the desktop layout with an on-screen
console below the arena.
```

## 11. Match result

```
InkFight match result overlay on a phone. Winner side: big "K.O.!" or "TIME!", the winner's avatar doing a
victory pose, rounds score (2-1), damage dealt, best combo, special/ultimate hits. Buttons: Rematch (primary),
New matchup, Share result. "Share result" generates a 1080 × 1080 card: both stick figures, names, score,
"Fought on InkFight", the app link. Loser side: a sporting line ("Close one. Your doodle wants a rematch.").
```

## 12. Gallery

```
InkFight gallery on a phone: a masonry grid of fighter cards (stick-figure avatar on white, name, class
stamp, owner handle). Filters as chips: class, element; sort: newest, most wins. Tap a card to open the
fighter; long-press for "Fight this one vs computer".
```

## 13. Leaderboard

```
InkFight leaderboard on a phone. Podium for the top 3 fighters (avatars on stacked notebooks with gold,
silver, bronze tape), then a ranked list: rank, avatar, fighter name, owner, wins-losses, win rate as a
small marker bar. Tabs: Fighters / Players. Your own fighters highlighted with a sticky-note marker.
```

## 14. Player profile

```
InkFight player profile on a phone: handle, record (W/L, win rate, best rank) as notebook stats, their
fighters as cards, recent fights as a list (opponent avatar, result stamp WIN/LOSS, score, date).
```

## 15. The Dungeon

```
InkFight Dungeon on a phone: a vertical ladder of 10 floors drawn as a tower of notebook pages climbing up
the screen, scrolled so the current floor is centred. Cleared floors: the boss avatar crossed out with a
red tick and the move you copied. Current floor: the boss card glowing, its title and epithet ("Smudge, the
Margin Runner"), class stamp, element, its passive as a one-line warning, its taunt in a speech bubble, and a
big "Fight" button. Locked floors: a padlock and the boss's silhouette. Top: "Floor 3 of 10" and the
fighter you're climbing with (tap to change). Also design the boss intro screen (full-screen boss avatar,
title card, taunt, "FIGHT") and the floor-cleared reward screen ("You copied Smudge Step").
```

## 16. Empty, loading and error states

```
InkFight empty and error states, one set: no fighters yet ("Draw your first fighter" with a doodled
pencil), loading skeletons as sketch outlines, offline, room full ("Two's a fight, three's a crowd"),
connection failed, 404 ("This page got erased"), and a toast style for notices. Same notebook style.
```

---

## The arena prompt (for the art: backgrounds and floors)

```
Game art for InkFight's fighting arena: a side-view 2D stage where two hand-drawn stick figures fight, seen
straight from the side like a classic fighting game. Logical size 960 × 540 (16:9); the floor line sits at
y = 480; fighters are about 180 px tall and stand anywhere between x = 60 and x = 900. Deliver separate
layers so the game can move them:
1. Far background: a notebook page (off-white #f7f5f0, faint blue ruled lines every 34 px, a red margin line
   at x = 64), with paper texture, a coffee ring and eraser smudges. Must stay calm: the fighters are thin
   ink lines and must remain the most readable thing on screen.
2. Mid layer (parallax, slow): doodles drawn in pencil around the page edges: paper planes, spirals, stars,
   clouds, a little sun, scribbled hearts. Transparent PNG or SVG, tileable horizontally.
3. Floor: a hand-inked ground line with a little shading below it and a faint ruler or desk edge; a few
   pencil shavings and ink splats.
4. Foreground (optional, very subtle): the curl of the page corner or the tip of a pencil at one edge.
Style: pen and pencil on paper, a little wobbly, black ink #17171a with accents only in red #e5482d, blue
#2f5be0 and gold #f2b705. No characters in the art. No text except optional tiny margin scribbles.
Variants with the same layout: (a) the normal page; (b) a graph-paper page; (c) a sticky-note covered desk;
(d) 10 dungeon floors that get darker and wilder as they climb: from a clean page (floor 1) through
coffee-stained, torn, burnt-edge, and finally a red-margin "Redline Regent" throne page (floor 10).
Also: a KO splash texture (ink burst), a hit spark sheet (6 frames, ink and red), and a dust puff sheet
(6 frames), all transparent PNG.
```

When the art comes back: drop the layers in `public/arena/` and the renderer (`src/game/render.ts`,
`paperPage()` and the doodle layer) can use them instead of drawing the page in code.
