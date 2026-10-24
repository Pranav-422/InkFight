# Gemini research prompt for InkFight

Used by `scripts/research.ts`. That script sends the shared **Context** below, plus one **Task**, to Gemini (`gemini-3.1-pro-preview`, falling back to flash), with Google Search grounding. It saves each answer as JSON in `docs/research/`.

The tasks are split into small batches, because no single answer can cover "every anime". The output format matches the game engine, so the results can feed straight into animation work, by hand or with Gemini 3.8 / agy.

---

## Context (sent with every task)

You are the research lead for **InkFight**, a browser fighting game.

**Game basics.** Players draw a stick figure on paper and photograph it. The drawing becomes a fighter: the drawn head is cut out, and a clean stick body is animated underneath it. Two players fight live, 1v1, side view, best of 3 rounds of 60 s.

**Controls.** Move left/right, jump, block (hold), punch, kick, special.
- Tapping punch or kick again quickly chains the fighter's **combo** for its **fighting style**.
- **Special** needs a full energy meter, which fills from hitting, getting hit, and slowly over time.

**Engine facts (be exact; your output must fit these):**
- The simulation runs at **60 ticks per second**. All durations are given in ticks.
- Arena: 960 × 540 units, floor at y = 480. Body hitbox: 70 wide × 170 tall.
- A normal move is:
  `{ dur, from, to, reach, mult, knock, launch?, top, bot, lunge, hop?, tip }`
  - `dur`: total ticks.
  - `from`/`to`: the active hit window, in ticks.
  - `reach`: hit distance in front of the body.
  - `mult`: damage multiplier on the base punch damage.
  - `knock`: horizontal knockback.
  - `launch`: upward knockback (optional).
  - `top`/`bot`: hitbox height as fractions of body height above the feet. 1 = head, 0 = feet.
  - `lunge`: forward push while active.
  - `hop`: jump velocity for flying moves (optional).
  - `tip`: the striking limb, one of `hand`, `handB`, `foot`, `footB`, `knee`, `head`.
  - Examples: jab `{dur 14, from 4, to 7, reach 68, mult 0.7}`, roundhouse `{dur 28, from 11, to 17, reach 95, mult 1.5}`.
- **Body poses** are targets per bone.
  - Bones: `torso, head, upperF, foreF, upperB, foreB, thighF, shinF, thighB, shinB`. F = the limb nearer the opponent (front), B = the far one.
  - Each target is `{abs: radians}` (world angle) or `{rel: radians}` (rotation from rest).
  - Angles are body space, facing +x: 0 = straight ahead, π/2 = straight down, −π/2 = straight up, π = behind.
  - Rest stance: upper arms ≈ 1.2 rad (down-forward), thighs ≈ π/2 ± 0.3.
  - A move animation is a list of **keyframes** `{ t: tick, pose: {bone: target}, lunge?: units, flip?: boolean }`. The renderer eases between them.
- **Specials** are "building blocks" with fixed gameplay; the name and look vary per fighter.
  - Current blocks: `bolt`, `arrow`, `orb`, `beam` (Kamehameha-style), `wave` (ground shockwave), `slash`, `charge` (armored), `uppercut`, `spiral` (Rasengan-style sphere ram), `teleport` (vanish, strike from behind), `barrage` (punch flurry), `meteor` (leap + dive kick).
  - Effects available: glow, afterimages, smear trails, impact rings, sparks, screen flash, speed lines, camera zoom, hit-stop, slow motion.
- **Stats system**:
  - Everyone gets **200 HP** and a fixed point **BUDGET of 350** split across 5 stats (each 40–100, averaging 70):
    - `atk` / STR: physical damage
    - `def` / DUR: durability (damage taken, block absorption)
    - `spd` / SPD: walk speed, combo tempo/cooldown
    - `agi` / AGI: jump height, air control, hit recovery
    - `iq` / IQ: energy gain, magic damage
  - The drawing's features (size, pose, aspect ratio, stance, arm spread, ink colours, held item) decide how the 350 budget is split, so fights stay fair whatever someone draws.
- **Fighting styles in the game:** Boxing, Taekwondo, Muay Thai, Karate, Street, Systema. More can be added.

**Rules for your answers:**
- Be precise and concrete. Prefer numbers (ticks, angles, ratios) over adjectives.
- Real martial arts: describe techniques as they are actually performed, including stance, chamber, strike and recovery.
- Anime moves: give the official move name and its anime/character so it can be found again. Then describe what it *looks like* step by step, and map it to the engine.
- If no existing building block fits a move, propose a new one, with its gameplay in the same format.
- The game will **not** reuse trademarked names in play: in-game names are parodies or originals. Still, report the real names accurately.
- Output **only** JSON that matches the task's schema. No prose outside it.

---

## Task: stats — what stats mean in a fighting game, and the 200 HP design

Research how fighting games, and combat games in general, define and balance fighter stats. Cover Street Fighter, Tekken, Smash Bros, Guilty Gear, MOBA heroes and RPG combat. Cover:
- what health, durability/defense, attack/damage, speed (walk, startup frames, recovery) and range actually do in a fight
- how "frame data" (startup / active / recovery, advantage on hit/block) creates the feel of fast vs heavy characters
- archetypes: rushdown, zoner, grappler, tank, all-rounder
- how designers keep wildly different characters fair: budgets, trade-offs, matchup spreads
- a concrete proposal for InkFight with 200 HP for everyone and a fixed budget of 350 over 5 stats (STR, DUR, SPD, AGI, IQ)
  - formulas from stat → damage taken, damage dealt, walk speed, combo cooldown
  - the min/max per stat
  - how a drawing's look (bulky, thin, armed, wide stance) should map onto it
  - 6 example builds with expected time-to-kill against an average fighter

Schema:
```json
{ "concepts": [{ "stat": "", "what_it_does": "", "how_games_use_it": "", "numbers_seen_in_games": "" }],
  "frame_data": { "explanation": "", "light_medium_heavy_examples": [{ "kind": "", "startup": 0, "active": 0, "recovery": 0, "ticks_at_60hz": "" }] },
  "archetypes": [{ "name": "", "strengths": "", "weaknesses": "", "stat_shape": "" }],
  "balance_methods": [{ "method": "", "how": "", "example": "" }],
  "inkfight_proposal": { "hp": 200, "budget": 0, "stats": [{ "name": "", "min": 0, "max": 0, "formula": "", "meaning": "" }],
    "drawing_to_stats": [{ "drawing_trait": "", "effect": "" }],
    "example_builds": [{ "name": "", "durability": 0, "attack": 0, "speed": 0, "time_to_kill_seconds": 0, "notes": "" }],
    "notes": "" } }
```

## Task: martial-arts — real fighting styles and their techniques

Cover at least 30 real martial arts and fighting styles, with their signature techniques. Examples: boxing, kickboxing, Muay Thai, Lethwei, Taekwondo, Karate (Shotokan, Kyokushin), Kung Fu (Wing Chun, Shaolin, Jeet Kune Do), Capoeira, Savate, Krav Maga, Systema, Sambo, Judo, BJJ, wrestling, Sumo, Kalaripayattu, Silat, Escrima/Kali, Aikido, Hapkido, Bajiquan, Tai Chi, Bokator, Pankration, MMA, street fighting, and kendo/kenjutsu (armed).

For each style, give 4–8 techniques in the engine's move format, plus 2–3 keyframe poses each. Also give a combo chain (punch chain and kick chain, 2–4 moves each) that feels like that style.

Schema:
```json
{ "styles": [{ "name": "", "origin": "", "stance": "", "philosophy_in_one_line": "", "drawing_cues": "what a stick figure drawing of this fighter would look like",
  "techniques": [{ "name": "", "kind": "punch|kick|knee|elbow|throw|sweep|weapon|other", "real_description": "", "move": { "dur": 0, "from": 0, "to": 0, "reach": 0, "mult": 0, "knock": 0, "launch": 0, "top": 0, "bot": 0, "lunge": 0, "tip": "" },
    "keyframes": [{ "t": 0, "pose": { "upperF": { "abs": 0 } }, "lunge": 0 }] }],
  "punch_chain": [""], "kick_chain": [""] }] }
```

## Task: anime-batch — special moves of significant characters

For the listed anime, cover every significant fighter: main cast, rivals, major villains and fan favourites. For each, give their signature special moves, 1–4 per character.

Schema:
```json
{ "anime": [{ "title": "", "characters": [{ "name": "", "fighting_style": "", "moves": [{
  "official_name": "", "translation": "", "what_it_does": "", "visual_sequence": ["step by step, what you see"],
  "colors": [""], "sound_feel": "",
  "maps_to_block": "one of the current blocks, or NEW",
  "new_block": { "id": "", "gameplay": "", "timing_ticks": { "startup": 0, "active": 0, "recovery": 0 }, "damage_mult": 0, "range": "", "special_rules": "" },
  "keyframes": [{ "t": 0, "pose": { "upperF": { "abs": 0 } }, "lunge": 0 }],
  "vfx": [{ "t": 0, "effect": "glow|beam|sphere|slash|ring|flash|speedlines|shake|zoom|slowmo|afterimage|particles", "detail": "" }],
  "parody_name_ideas": [""] }] }] }] }
```
