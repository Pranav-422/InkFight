# Sprint 8: Dungeon bosses, pass 2 (one identity per boss)

Branch `sprint-8-bosses`, based on `main` (`7d22ac2`). Nothing pushed to `main`, nothing deployed, no new dependency, no migration. Task sheet:
`docs/tasks/dungeon-bosses.md`. Research used: `docs/research/new research`, `docs/research/anime-*.json`, `docs/research/v2/*.json`.

This file is written **roster first** (sections 1-2, committed before any code), then the build (section 3 onwards grows part by part). Order of work, one
commit per part: **A** this standard and the roster table, **B** move sets, passives and CPU personalities, **C** looks (heads, outfits, auras, VFX),
**D** rewards and progress, **E** tuning, frames, the gate.

## 1. The standard (every boss must meet it)

1. **A ladder, not a list.** The floors climb five tiers: **street fighters** (1-2), **trained martial artists** (3-4), **elite swordsmen** (5-6),
   **power users** (7-9), **the final boss** (10). A floor teaches one thing and the next floor assumes it.
2. **A parody of one recognisable anime fighter** from the research. The game shows a *parody name* in the style of the research's `parody_name_ideas`
   (stationery puns, descriptive epithets); the real name, logo or exact art never appears in the game. The inspiration is named in these docs only.
3. **One identity.** The kit, the passive, the idle, the aura, the move effects and the CPU's behaviour all come from the same source. The test: read the
   move list and the AI notes of a boss and nothing in them is something its inspiration would not do (a sheathed swordsman has no kicks; a boxer has
   no kicks; a counter fighter does not chase).
4. **A look you can tell from the other nine at a glance.** A head drawing with its own silhouette (hair, hat, eyes, scar, blindfold, mask); outfit
   cosmetics drawn from the boss's data (haori, sash, gloves, hat, extra swords), never baked into the art PNG; the research colours (at least two of the
   research's hex values per boss); a signature aura and per-move effects; its own idle loop.
5. **A floor that teaches.** The `teaches` line is something a player can do after the fight that they could not before.
6. **A reward that is the signature move, made player-safe.** Odd floors give a named, element-tinted variant of a base kind; even floors give one of the
   five unlockable kinds. Both are ordinary kinds the PvP balance already prices (`SPECIAL_TUNE`, the `balance.ts` gate). Nothing boss-only is ever
   handed out.
7. **Difficulty by budget.** `scripts/dungeon.ts --tune` fits each floor's stat budget so the CPU stand-in clears the floor at about 84% (floor 1)
   falling to about 14% (floor 10), lower on every floor.
8. **No leakage.** A passive, a boss-only move and a boss-only special kind only exist inside `createMatch(..., { boss })`; `balance.ts` asserts no player
   kit carries one, the API still validates `pick_*` against the player kinds, and normal fights are untouched (`check-sim`'s golden hashes).
9. **Nothing breaks.** The five unlockable kinds stay on floors 2 / 4 / 6 / 8 / 10 (`UNLOCK_FLOOR`), `User.dungeonFloor` means what it meant, and fighters
   made earlier keep their stored special names and kinds.

## 2. The roster

| Floor | Tier | Inspiration (docs only) | Parody name | Class | Style | Item | Element | Colours (research) |
|---|---|---|---|---|---|---|---|---|
| 1 | Street | Vasco (Lookism) | **Brass Shin**, the Wrecking Kick | Mace | Muay Thai | nothing | FIRE | `#FF5500` `#FFFFFF` `#222222` |
| 2 | Street | Scar (Fullmetal Alchemist) | **Crosshatch**, the Eraser Hand | Fighter | Street | nothing | ELECTRIC | `#4444FF` `#FF0000` + ink `#2B1D18` |
| 3 | Martial artist | Ippo Makunouchi (Hajime no Ippo) | **Pip Punchline**, the Rolling Fist | Fighter | Boxing | nothing | BLEED | `#FFFFFF` `#888888` + gloves `#E5482D` |
| 4 | Martial artist | Gun Park (Lookism) | **Pale Ogre**, the Counter Smash | Tank | Karate | nothing | NONE | `#000000` `#FF0033` `#FFFFFF` |
| 5 | Swordsman | Zenitsu Agatsuma (Demon Slayer) | **Yellow Streak**, the Sleeping Thunder | Sword | Karate | sword | ELECTRIC | `#FFFF00` `#FFFFFF` |
| 6 | Swordsman | Roronoa Zoro (One Piece) | **Triple Nib**, Lord of the Three Pens | Sword | Karate | sword | POISON | `#00FF66` `#111111` `#FF0044` `#006400` |
| 7 | Power user | Monkey D. Luffy (One Piece) | **Rubber Bo**, the Elastic Storm | Fighter | Street | nothing | GRAVITY | `#FF2200` `#111111` `#FFC0CB` |
| 8 | Power user | Satoru Gojo (Jujutsu Kaisen) | **Asymptote**, the Limitless Margin | Attacker | Systema | nothing | GRAVITY | `#00AAFF` `#FF2200` `#800080` |
| 9 | Power user | Son Goku (Dragon Ball) | **Saffron Spike**, the Wave Master | Fighter | Karate | nothing | FROST | `#00CCFF` `#FFD700` `#FF8800` `#0044FF` |
| 10 | Final boss | DIO (JoJo's Bizarre Adventure) | **The Overdue**, King of Borrowed Time | Fighter | Street | nothing | BLEED | `#FFD700` `#8800FF` `#00FFAA` |

| Floor | Signature moves (L / S+L, own chains) | Passive (rule in one line) | CPU personality | What the floor teaches |
|---|---|---|---|---|
| 1 | L `wave` (Forbidden Thai Cannon), S+L `wave`. Kicks: knee stomp, roundhouse, **Compressed Kick** (boss-only finisher). Punches: jab, elbow | **Guard Crush** (new): the Compressed Kick breaks a guard it hits: most of its damage goes through and you cannot block for 40 ticks | **Brawler**: walks you down, never backs off, 70% of swings are kicks | Block the strings, step back from the finisher, punish its long recovery |
| 2 | L `shatter` (Deconstruction grab), S+L `shatter`. Punches: hook, palm, **heart punch** (boss-only, 1-inch punch) | **Fracture Stacks** (`heat-stacks`, BLEED): three clean hits and the next one deconstructs you (bleed); a blocked hit clears the stacks | **Grappler**: closes in; grabs the moment you turtle | Blocking works, except against a grab: step or jump it |
| 3 | L `uppercut` (Gazelle Punch), S+L `barrage` (Dempsey Roll). Punches: **flicker jab, corkscrew cross, gazelle hook, Dempsey uppercut** (boss-only, the research's boxing chain). No kicks | **Bob & Weave** (`afterimage`): once per 6 s the first hit that would land while he is on the move is slipped | **Boxer**: punches only, weaves at mid range, strings 3-4 punches | Do not swing at a weaving target; hit him when he stops, block the first jab |
| 4 | L `counter` (Counter Smash), S+L `charge` (armoured smash). Punches: **seiken**, palm. Kicks: low kick, roundhouse, **rolling thunder kick** (boss-only) | **Aikido Redirect** (`whiteout-guard`): the third hit he blocks in 2 s throws the attacker back and stuns him | **Counter fighter**: holds mid range behind the guard, answers a swing with the counter, attacks only an opening | Stop mashing into a guard: two hits, then bait the counter and punish it |
| 5 | L `teleport` (Thunderclap and Flash), S+L `teleport` (Sixfold). Punches: **Thunderclap** only (boss-only iai dash). No kicks | **Sheathed Draw** (`sheathed-draw`): still for 20 ticks arms the blade; the next swing is a dash for half again the damage, then 12 extra recovery | **Sheathed**: stands still, draws when you enter dash range, sheathes, waits again; never walks in unless you stall 3 s | React to a tell: block or jump the dash, punish the recovery |
| 6 | L `dash_slash` (Triple Blade crossing), S+L `teleport` (Lion's Song). Punches: iai, rising slash, **Oni Cut** (boss-only three-way cross-cut) | **Nothing Happened** (`unbending-spine`): the wind-up of a swing is not interrupted by normal hits (x0.8 damage) | **Swordsman**: relentless pressure, no step-back; the teleport cut the moment you turtle | Do not trade into an armoured wind-up: block it, punish the recovery, break armour with a launcher |
| 7 | L `barrage` (Gatling), S+L `barrage`. Punches: **rubber pistol, pistol, bazooka**; kick: **rubber whip** (boss-only, 130-150 px reach, the arm stretches) | **Rubber Body** (new): blows from fists (the punch chain) deal x0.65 to him; kicks, weapons and specials are normal | **Poker**: holds just inside his own reach and pokes; closes when you are in hit-stun; backs off when you crowd him | Spacing against reach, and changing tools: kick the rubber man |
| 8 | L `pull` (Blue), S+L `beam` (Purple). Chains: the Attacker's palm strikes | **Infinite Margin** (`infinite-margin`): projectiles barely hurt him; crowd him for 1.5 s and he blinks across the arena | **Zoner**: mid range, pulls you in, blinks away when crowded | Cornering and committed close pressure against someone who wants space |
| 9 | L `beam` (Kamehameha), S+L `uppercut` (Dragon Fist). Karate chains | **Ki Charge** (new): standing still fills his meter 3x faster, the aura grows; the beam at full aura hits one extra time | **Charger**: stands and charges while you are far, fights in melee when you close in, fires from range | Interrupt a charge: close in on a standing target, jump the beam |
| 10 | L `arrow` (knives), S+L **`time_stop_barrage`** (boss-only: time stops, 8 hits, launch). Punches: **muda jabs** | **Borrowed Time** (new, both forms): a full meter shows a clock; the time stop locks you from any range up to 180 px; the knives he planted fall when time resumes. Phase 2 (half health): slot 1 becomes `remote_detonation`, stops are longer, more knives | **Timekeeper**: knives from range, a rush when you are close, the time stop at once when the meter is full and you are inside 180 | The final exam: stay outside 180 or hit the startup; walk off the knives; everything from floors 1-9 |

| Floor | Reward (copy it in the builder) | Kind / element |
|---|---|---|
| 1 | Hero's Shin Wrecker | variant of `wave`, FIRE |
| 2 | Deconstruct | `shatter` (floor 2, as before) |
| 3 | Gazelle Rise | variant of `uppercut`, BLEED |
| 4 | Unconscious Counter | `counter` (floor 4, as before) |
| 5 | Static Dash | variant of `teleport`, ELECTRIC |
| 6 | Triple Blade | `dash_slash` (floor 6, as before) |
| 7 | Elastic Ink Gatling | variant of `barrage`, GRAVITY |
| 8 | Blue Pull | `pull` (floor 8, as before) |
| 9 | Turtle Ink Wave | variant of `beam`, FROST |
| 10 | Stopped Clock | `remote_detonation` (floor 10, as before) |

### Notes on the choices

- **Why these kinds sit on these floors.** The unlock floors cannot move (a player who copied `counter` on floor 4 must keep it, and a later floor would
  take it away). The research already pairs the sources with the kinds: Scar's Deconstruction is the `shatter` block, Zoro's Oni Giri is the `dash_slash`
  block, Gun's Aikido counter and Gojo's Blue/Red are the `counter` and `pull` ideas, DIO's knives stopped in time are a delayed strike. The odd floors take
  base kinds the research maps directly (Vasco `wave`, Ippo `uppercut`/`barrage`, Zenitsu `teleport`, Luffy `barrage`, Goku `beam`).
- **All five classes appear** (Mace 1, Fighter 2/3/7/9/10, Tank 4, Sword 5/6, Attacker 8) so the class traits (a Mace's armoured finisher, a Tank's
  shield shove, a Sword's reach, an Attacker's blasts) are part of the identity too.
- **Passives that were kept** are the ones whose rule *is* the identity of the new boss (Smudge's afterimage is a boxer's slip; Whiteout's guard is
  an aikido redirect; the old sheathed draw is Zenitsu's draw; Infinite Margin is Gojo's Limitless). **New** passives exist where nothing fit: Guard Crush,
  Rubber Body, Ki Charge, Borrowed Time. Passives nobody wears any more (Royal Pride, Endless Dance, Pencil Case, Curse Marks, Red Margin Lines) are
  removed with their tests, so there is no dead boss code.
- **What is boss-only and where it lives.** `FighterDef.kit` (own punch / kick chains), `FighterDef.passive` and the special kind `time_stop_barrage` are
  set only through `BossSpec` in `createMatch`. `SPECIAL_KINDS` (what players and the API can pick) is unchanged; the boss kind lives in `BOSS_KINDS`.
- **Looks.** One data module (`src/game/bossLook.ts`) holds each boss's head drawing (SVG path data), palette, outfit pieces, idle and aura. The browser
  builds the head sprite from it directly (so hair can leave the head circle and nothing is blurred by a PNG round trip), `drawStick` draws the outfit
  from it, the renderer reads the palette for the aura and the move effects, and `/boss-art/[floor]` draws the same head into the PNG used by share
  cards and as a fallback for the old pipeline.

## 3. What changed

(Filled in part by part.)
