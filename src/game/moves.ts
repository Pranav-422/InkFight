// Move catalogue shared by the sim, the renderer, the CPU and the server.
// Fighting styles give each fighter its own punch/kick combos; specials are
// building blocks that Claude (or the offline generator) picks and names.

import { normClass } from "../lib/stats";

// The twelve building blocks everyone starts with (the AI and the offline generator pick only from these), and the five
// the dungeon unlocks: UNLOCK_FLOOR is the floor whose boss you copy each one from (src/game/dungeon.ts).
export const BASE_KINDS = ["bolt", "arrow", "orb", "slash", "charge", "uppercut", "beam", "spiral", "wave", "teleport", "barrage", "meteor"] as const;
export const UNLOCK_KINDS = ["shatter", "counter", "dash_slash", "pull", "remote_detonation"] as const;
// What players and the API may pick: the twelve and the five. A dungeon boss may also have a kind nobody else can: it enters a fight only through
// createMatch(..., { boss }) (sim.ts BossSpec), never through a stat line, so `specialOf` / `ultOf` below don't know it.
export const SPECIAL_KINDS = [...BASE_KINDS, ...UNLOCK_KINDS] as const;
export const BOSS_KINDS = ["time_stop_barrage"] as const;
export type BossKind = (typeof BOSS_KINDS)[number];
export type SpecialKind = (typeof SPECIAL_KINDS)[number] | BossKind;
export type UnlockKind = (typeof UNLOCK_KINDS)[number];
export const UNLOCK_FLOOR: Record<UnlockKind, number> = { shatter: 2, counter: 4, dash_slash: 6, pull: 8, remote_detonation: 10 };
// The floor that must be cleared before a kind can be picked (0: free).
export const kindFloor = (kind: string): number => UNLOCK_FLOOR[kind as UnlockKind] ?? 0;

// how: shown on the character page. looks: tells Claude what the move is, so it can name it.
export const SPECIAL_INFO: Record<SpecialKind, { how: string; looks: string; ranged: boolean }> = {
  bolt: { how: "fires a fast magic bolt", looks: "a quick glowing energy shot", ranged: true },
  arrow: { how: "fires a long-range arrow", looks: "a fast straight projectile (arrow, dart, thrown blade)", ranged: true },
  orb: { how: "throws a slow, heavy orb that launches", looks: "a big slow ball of energy", ranged: true },
  beam: { how: "charges, then fires a huge beam across the arena (hits up to 4 times)", looks: "a charged two-handed energy beam (Kamehameha-style)", ranged: true },
  wave: { how: "slams the ground and sends a shockwave along the floor", looks: "a ground-pound shockwave rolling along the floor", ranged: true },
  slash: { how: "dashes in with a crescent slash", looks: "a lightning-fast dashing blade slash", ranged: false },
  charge: { how: "shield-charges and takes half damage for 3s", looks: "an armored body charge", ranged: false },
  uppercut: { how: "launches the opponent with a flaming uppercut", looks: "a rising dragon-fire uppercut", ranged: false },
  spiral: { how: "spins up a sphere in the palm and rams it in", looks: "a spinning energy sphere slammed into the enemy (Rasengan-style)", ranged: false },
  teleport: { how: "vanishes and strikes from behind", looks: "a vanish-and-reappear-behind strike", ranged: false },
  barrage: { how: "unloads a rapid flurry of punches, then a finisher", looks: "a rapid-fire punch flurry (ora-ora style)", ranged: false },
  meteor: { how: "leaps up and crashes down feet-first, with a shockwave", looks: "a leaping dive kick that craters the ground", ranged: false },
  shatter: { how: "grabs at close range: can't be blocked, but misses anyone in the air", looks: "an open-hand grab that crumples the target", ranged: false },
  counter: { how: "takes a stance: a melee hit in the first 0.4 s does nothing and is answered for 1.5x damage", looks: "a calm parry stance and a sharp answer", ranged: false },
  dash_slash: { how: "dashes straight through the opponent with one slash and ends up behind them", looks: "a blinding dash that ends back to back", ranged: false },
  pull: { how: "throws a slow hook that drags the target in front of you and steals some of their meter", looks: "a hooked chain or line that reels the target in", ranged: true },
  remote_detonation: { how: "marks the spot where the opponent stands: 0.7 s later a cut falls there (move to dodge)", looks: "a delayed strike that lands where you were", ranged: true },
  time_stop_barrage: { how: "stops time: anyone within 180 px is frozen while eight blows land, then launched (a boss's)", looks: "a frozen world and a flurry that lands all at once", ranged: false },
};

// ---------------------------------------------------------------- normal moves

export type MoveName =
  | "jab" | "cross" | "hook" | "uppercutP" | "elbow" | "knee" | "flyingKnee" | "palm" | "straight" | "headbutt"
  | "frontKick" | "roundhouse" | "spinKick" | "axeKick" | "lowKick" | "sweep"
  // weapon chains (the class's J), air moves
  | "iai" | "risingSlash" | "thrust" | "overhead" | "slam" | "shieldBash" | "inkPalm" | "airSlash" | "divePunch" | "flyingKick"
  // dungeon bosses' own moves (BossKit below): frame data from docs/research/new research where it has some
  | "flickerJab" | "corkscrew" | "gazelleHook" | "dempsey" | "seiken" | "kaitenGeri" | "heartPunch" | "kneeStomp" | "shinCannon"
  | "thunderclap" | "oniCut" | "pistol" | "bazooka" | "whip" | "mudaJab";

// Timings in ticks. Hitbox from `reach` in front of the body, between `top` and `bot`
// (fractions of body height above the feet). `lunge`: forward push while active.
// low: can't be blocked standing (jump it). armor: doesn't flinch while active. air: an air move
// (ends on landing; dive = [vx, vy] pushes it forward and down). down: extra hit-stun (a knockdown).
export type Move = {
  dur: number; from: number; to: number; reach: number; mult: number; knock: number;
  launch?: number; top: number; bot: number; lunge: number; hop?: number; tip: "hand" | "handB" | "foot" | "footB" | "knee" | "head";
  low?: boolean; armor?: boolean; air?: boolean; dive?: [number, number]; down?: number;
  crush?: boolean; // a guard doesn't hold against it when its owner has the Guard Crush passive (the Compressed Kick)
};

export const MOVES: Record<MoveName, Move> = {
  jab: { dur: 14, from: 4, to: 7, reach: 68, mult: 0.7, knock: 4, top: 0.85, bot: 0.55, lunge: 3, tip: "hand" },
  cross: { dur: 18, from: 6, to: 10, reach: 74, mult: 1.0, knock: 7, top: 0.85, bot: 0.5, lunge: 5, tip: "handB" },
  hook: { dur: 20, from: 7, to: 11, reach: 62, mult: 1.2, knock: 9, top: 0.9, bot: 0.55, lunge: 2, tip: "hand" },
  uppercutP: { dur: 24, from: 8, to: 13, reach: 60, mult: 1.4, knock: 6, launch: 9, top: 0.95, bot: 0.4, lunge: 3, tip: "hand" },
  elbow: { dur: 18, from: 6, to: 10, reach: 52, mult: 1.3, knock: 8, top: 0.9, bot: 0.55, lunge: 4, tip: "hand" },
  knee: { dur: 22, from: 8, to: 13, reach: 56, mult: 1.4, knock: 6, launch: 6, top: 0.7, bot: 0.3, lunge: 4, tip: "knee" },
  flyingKnee: { dur: 30, from: 10, to: 18, reach: 70, mult: 1.8, knock: 10, launch: 5, top: 0.85, bot: 0.35, lunge: 6, hop: 9, tip: "knee" },
  palm: { dur: 18, from: 6, to: 11, reach: 70, mult: 1.1, knock: 13, top: 0.8, bot: 0.45, lunge: 5, tip: "hand" },
  straight: { dur: 18, from: 6, to: 10, reach: 76, mult: 1.1, knock: 7, top: 0.8, bot: 0.5, lunge: 4, tip: "hand" },
  headbutt: { dur: 22, from: 9, to: 13, reach: 50, mult: 1.5, knock: 8, top: 1.0, bot: 0.7, lunge: 5, tip: "head" },
  frontKick: { dur: 24, from: 9, to: 14, reach: 92, mult: 1.3, knock: 13, top: 0.65, bot: 0.3, lunge: 3, tip: "foot" },
  roundhouse: { dur: 28, from: 11, to: 17, reach: 95, mult: 1.5, knock: 10, top: 0.75, bot: 0.4, lunge: 2, tip: "foot" },
  spinKick: { dur: 34, from: 15, to: 21, reach: 100, mult: 1.9, knock: 14, launch: 4, top: 0.85, bot: 0.45, lunge: 3, tip: "footB" },
  axeKick: { dur: 34, from: 16, to: 21, reach: 85, mult: 1.8, knock: 6, top: 1.0, bot: 0.5, lunge: 2, tip: "foot" },
  lowKick: { dur: 20, from: 8, to: 12, reach: 90, mult: 1.0, knock: 5, top: 0.35, bot: 0, lunge: 2, tip: "foot" },
  sweep: { dur: 28, from: 11, to: 16, reach: 96, mult: 1.2, knock: 4, launch: 7, top: 0.25, bot: 0, lunge: 2, tip: "foot", low: true, down: 10 },
  // Weapon chains. Frame data: startup / active / recovery from the design doc. A sword adds TRAIT.SWORD_REACH.
  iai: { dur: 14, from: 4, to: 7, reach: 72, mult: 0.8, knock: 5, top: 0.9, bot: 0.5, lunge: 4, tip: "hand" },
  risingSlash: { dur: 14, from: 3, to: 6, reach: 66, mult: 0.9, knock: 6, launch: 6, top: 1.0, bot: 0.4, lunge: 3, tip: "hand" },
  thrust: { dur: 22, from: 6, to: 10, reach: 84, mult: 1.3, knock: 10, top: 0.8, bot: 0.5, lunge: 8, tip: "hand" },
  overhead: { dur: 26, from: 8, to: 12, reach: 70, mult: 1.5, knock: 8, top: 1.0, bot: 0.3, lunge: 3, tip: "hand" },
  slam: { dur: 30, from: 10, to: 14, reach: 74, mult: 1.8, knock: 12, launch: 5, top: 0.9, bot: 0, lunge: 4, tip: "hand" },
  shieldBash: { dur: 18, from: 5, to: 9, reach: 50, mult: 1.1, knock: 14, top: 0.9, bot: 0.3, lunge: 6, tip: "hand", armor: true },
  inkPalm: { dur: 16, from: 5, to: 8, reach: 64, mult: 1.0, knock: 9, top: 0.85, bot: 0.5, lunge: 4, tip: "hand" },
  // Air moves (J or K while airborne): active until landing or `to`.
  airSlash: { dur: 20, from: 3, to: 14, reach: 70, mult: 1.0, knock: 6, top: 0.9, bot: 0.1, lunge: 0, tip: "hand", air: true },
  divePunch: { dur: 22, from: 4, to: 16, reach: 60, mult: 1.0, knock: 7, top: 0.8, bot: 0.1, lunge: 0, tip: "hand", air: true, dive: [5, 6] },
  flyingKick: { dur: 24, from: 3, to: 18, reach: 80, mult: 1.2, knock: 9, top: 0.7, bot: 0, lunge: 0, tip: "foot", air: true, dive: [9, 7] },
  // Dungeon bosses' moves. The boxing and karate ones are the research's (Flicker Jab, Corkscrew Right Cross, Gazelle Liver Hook, Dempsey Rising
  // Uppercut; Seiken Chudan Tsuki, Rolling Thunder Kick; One-Inch Heart Punch; Oblique Knee Stomp), the rest follow their frame data's shape.
  flickerJab: { dur: 12, from: 3, to: 6, reach: 72, mult: 0.7, knock: 2, top: 0.95, bot: 0.65, lunge: 4, tip: "hand" },
  corkscrew: { dur: 18, from: 6, to: 10, reach: 78, mult: 1.15, knock: 7, top: 0.95, bot: 0.6, lunge: 8, tip: "handB" },
  gazelleHook: { dur: 22, from: 8, to: 13, reach: 66, mult: 1.35, knock: 6, launch: 3, top: 0.7, bot: 0.4, lunge: 12, tip: "hand" },
  dempsey: { dur: 24, from: 8, to: 14, reach: 60, mult: 1.45, knock: 5, launch: 9, top: 1.0, bot: 0.5, lunge: 7, tip: "handB" },
  seiken: { dur: 16, from: 5, to: 9, reach: 70, mult: 1.2, knock: 8, top: 0.78, bot: 0.45, lunge: 7, tip: "handB" },
  kaitenGeri: { dur: 30, from: 12, to: 19, reach: 92, mult: 1.65, knock: 10, launch: 4, top: 1.0, bot: 0.25, lunge: 16, hop: 6, tip: "footB" },
  heartPunch: { dur: 15, from: 3, to: 6, reach: 58, mult: 1.4, knock: 15, launch: 4, top: 0.82, bot: 0.5, lunge: 5, tip: "hand" },
  kneeStomp: { dur: 16, from: 5, to: 9, reach: 84, mult: 0.95, knock: 7, top: 0.45, bot: 0.1, lunge: 4, tip: "foot" },
  shinCannon: { dur: 38, from: 15, to: 20, reach: 104, mult: 2.3, knock: 17, launch: 7, top: 0.55, bot: 0.05, lunge: 7, tip: "footB", crush: true },
  thunderclap: { dur: 20, from: 5, to: 9, reach: 92, mult: 1.0, knock: 12, top: 0.9, bot: 0.4, lunge: 10, tip: "hand" },
  oniCut: { dur: 28, from: 9, to: 15, reach: 96, mult: 1.9, knock: 12, launch: 4, top: 1.0, bot: 0.25, lunge: 12, tip: "hand" },
  pistol: { dur: 20, from: 8, to: 12, reach: 150, mult: 0.9, knock: 7, top: 0.85, bot: 0.5, lunge: 2, tip: "hand" },
  bazooka: { dur: 26, from: 11, to: 16, reach: 130, mult: 1.7, knock: 14, launch: 3, top: 0.85, bot: 0.45, lunge: 6, tip: "hand" },
  whip: { dur: 24, from: 9, to: 14, reach: 125, mult: 1.2, knock: 9, top: 0.6, bot: 0.2, lunge: 3, tip: "foot" },
  mudaJab: { dur: 9, from: 2, to: 4, reach: 66, mult: 0.45, knock: 1, top: 0.9, bot: 0.55, lunge: 2, tip: "hand" },
};

// A dungeon boss's own punch (J) and kick (K) chains, over its class's and style's (sim.ts FighterDef.kit; the dungeon passes it in BossSpec).
export type BossKit = { punch?: MoveName[]; kick?: MoveName[] };

// Fighting styles (a nod to Lookism's cast of fighters). Tap punch/kick again
// before the combo window closes to chain into the next move.
export const STYLES = ["Boxing", "Taekwondo", "Muay Thai", "Karate", "Street", "Systema"] as const;
export type Style = (typeof STYLES)[number];

// mix: the finisher when a chain of two or more switches to the other button (punch, punch, kick).
export const STYLE_INFO: Record<Style, { punch: MoveName[]; kick: MoveName[]; mix: MoveName; blurb: string }> = {
  Boxing: { punch: ["jab", "cross", "hook", "uppercutP"], kick: ["lowKick"], mix: "lowKick", blurb: "Hands of lightning: jab, cross, hook, uppercut" },
  Taekwondo: { punch: ["jab", "straight"], kick: ["roundhouse", "spinKick", "axeKick"], mix: "spinKick", blurb: "Kicks for days: roundhouse, spinning back kick, axe kick" },
  "Muay Thai": { punch: ["jab", "elbow"], kick: ["roundhouse", "knee", "flyingKnee"], mix: "knee", blurb: "Eight limbs: elbows, knees and a flying knee" },
  Karate: { punch: ["straight", "palm"], kick: ["frontKick", "roundhouse"], mix: "frontKick", blurb: "Clean, straight lines: reverse punch, palm strike, front kick" },
  Street: { punch: ["hook", "hook", "headbutt"], kick: ["frontKick", "lowKick"], mix: "headbutt", blurb: "No rules: wild hooks, a headbutt, a stomp kick" },
  Systema: { punch: ["palm", "palm", "elbow"], kick: ["lowKick", "sweep"], mix: "sweep", blurb: "Loose and sneaky: palm strikes, elbows, a leg sweep" },
};

// A weapon class swings its weapon on J; the style still sets its kicks (and a Fighter's punches).
export const CLASS_CHAIN: Partial<Record<string, MoveName[]>> = {
  Sword: ["iai", "risingSlash", "thrust"],
  Mace: ["overhead", "slam"],
  Tank: ["jab", "shieldBash"],
  Attacker: ["inkPalm", "palm"],
};

export const COMBO_WINDOW = 22; // ticks after a move ends in which the next press continues the chain

// Damage scale per style and chain, so every chain deals the same damage per second
// when strung out in full (a 4-hit boxing chain otherwise out-damages a 2-hit karate
// one). Duration counts each move plus the ~20-tick cooldown after the last one.
const TARGET_DPS = 4.6 / 96; // the boxing punch chain's mult per tick, the reference
export const chainPower = (chain: MoveName[]) => TARGET_DPS / (chain.reduce((n, m) => n + MOVES[m].mult, 0) / (chain.reduce((n, m) => n + MOVES[m].dur, 0) + 20));
export const STYLE_POWER = Object.fromEntries(STYLES.map((s) => [s, { punch: chainPower(STYLE_INFO[s].punch), kick: chainPower(STYLE_INFO[s].kick) }])) as Record<Style, { punch: number; kick: number }>;
// The same for the weapon chains (CLASS_TUNE evens out the rest).
export const CLASS_CHAIN_POWER = Object.fromEntries(Object.entries(CLASS_CHAIN).map(([c, chain]) => [c, chainPower(chain!)])) as Record<string, number>;

// Damage factors found by simulation (`npx tsx scripts/balance.ts --tune`): each style
// and special set so it wins about half its fights against a mixed pool of every
// style x special with the same stats. Re-run the tuner after changing moves or specials.
export const STYLE_TUNE: Record<Style, number> = { Boxing: 0.838, Taekwondo: 0.796, "Muay Thai": 0.88, Karate: 0.901, Street: 0.964, Systema: 0.817 };
export const SPECIAL_TUNE: Record<SpecialKind, number> = { bolt: 1.323, arrow: 1.049, orb: 0.964, slash: 0.606, charge: 0.311, uppercut: 0.986, beam: 2.336, spiral: 1.871, wave: 1.639, teleport: 0.69, barrage: 0.732, meteor: 1.175, shatter: 0.986, counter: 0.732, dash_slash: 1.576, pull: 1.196, remote_detonation: 1.492, time_stop_barrage: 1 };

// Damage factor per class, found by simulation like the two above (scripts/balance.ts --tune):
// each class's usual stat line and kit wins about half its fights against every class.
export const CLASS_TUNE: Record<string, number> = { Sword: 1.017, Mace: 1.109, Tank: 1.144, Attacker: 1.214, Fighter: 1.211 };
// Strength of each element's status effect (1 = as described in sim.ts), tuned the same way.
export const ELEMENT_TUNE: Record<string, number> = { NONE: 1, FIRE: 1, ELECTRIC: 1, FROST: 1, POISON: 1, BLEED: 1, GRAVITY: 1 };

// Defaults for fighters made before moves were stored (and for unknown values).
// Old class names (Warrior, Mage, ...) are mapped by normClass in src/lib/stats.ts.
export const CLASS_SPECIAL: Record<string, SpecialKind> = {
  Sword: "slash",
  Mace: "meteor",
  Tank: "charge",
  Attacker: "beam",
  Fighter: "barrage",
};
export const CLASS_STYLE: Record<string, Style> = {
  Sword: "Karate",
  Mace: "Street",
  Tank: "Muay Thai",
  Attacker: "Karate",
  Fighter: "Boxing",
};

// What each class holds unless the drawing says otherwise (the item sets the look only).
export const CLASS_ITEM: Record<string, string> = { Sword: "sword", Mace: "mace", Tank: "shield", Attacker: "book", Fighter: "nothing" };
export const itemOf = (item: string | null | undefined, cls: string): string => item || CLASS_ITEM[normClass(cls)] || "nothing";

export const specialOf = (kind: string | null | undefined, cls: string): SpecialKind =>
  (SPECIAL_KINDS as readonly string[]).includes(kind ?? "") ? (kind as SpecialKind) : (CLASS_SPECIAL[normClass(cls)] ?? "uppercut");

// Two special slots: L spends SLOT1_COST energy on the first special, S + L spends ULT_COST on the ultimate
// (the same twelve building blocks, plus a hit-lock: see lockOn in sim.ts). Old fighters have no ultimate
// stored, so they get their class's.
export const SLOT1_COST = 50;
export const ULT_COST = 100;
export const CLASS_ULT: Record<string, SpecialKind> = {
  Sword: "meteor",
  Mace: "uppercut",
  Tank: "meteor",
  Attacker: "spiral",
  Fighter: "beam",
};
export const ultOf = (kind: string | null | undefined, cls: string): SpecialKind =>
  (SPECIAL_KINDS as readonly string[]).includes(kind ?? "") ? (kind as SpecialKind) : (CLASS_ULT[normClass(cls)] ?? "meteor");
export const styleOf = (style: string | null | undefined, cls: string): Style =>
  (STYLES as readonly string[]).includes(style ?? "") ? (style as Style) : (CLASS_STYLE[normClass(cls)] ?? "Street");

// Side skills (the SKILL button): one per fighter, the class's by default. cd in seconds (IQ shortens it), dur in
// ticks before SKILL_TUNE (so the texts name no durations: the character page shows the tuned one).
export const SIDE_SKILLS = ["blade", "reflect", "bubble", "weave", "poise"] as const;
export type SideSkill = (typeof SIDE_SKILLS)[number];
export const SKILL_INFO: Record<SideSkill, { name: string; how: string; cd: number; dur: number }> = {
  blade: { name: "Element blade", how: "your weapon hits 15% harder (and sets your element on a clean target)", cd: 12, dur: 300 },
  reflect: { name: "Reflect shield", how: "a blocked hit bounces half its damage back", cd: 10, dur: 72 },
  bubble: { name: "Ink bubble", how: "soaks two hits and shoves a melee attacker back (a mace pops it in one)", cd: 14, dur: 240 },
  weave: { name: "Slip-weave", how: "the next hit is slipped and your next move comes out fast: time it", cd: 8, dur: 30 },
  poise: { name: "Iron poise", how: "hits don't stagger you (they still hurt)", cd: 12, dur: 180 },
};
// Each skill's duration factor, found by simulation (scripts/balance.ts --tune N
// skills): a class with its skill beats the same class without it 60% of the time. A mirror amplifies any edge,
// so that is a few % of HP: worth pressing, not a matchup decider.
export const SKILL_TUNE: Record<SideSkill, number> = { blade: 2.014, reflect: 1.267, bubble: 0.383, weave: 0.406, poise: 0.406 };
export const CLASS_SKILL: Record<string, SideSkill> = { Sword: "blade", Mace: "poise", Tank: "reflect", Attacker: "bubble", Fighter: "weave" };
export const skillOf = (skill: string | null | undefined, cls: string): SideSkill =>
  (SIDE_SKILLS as readonly string[]).includes(skill ?? "") ? (skill as SideSkill) : (CLASS_SKILL[normClass(cls)] ?? "weave");

// Which specials suit each class, for the offline generator (Claude may pick any).
export const CLASS_SPECIAL_POOL: Record<string, SpecialKind[]> = {
  Attacker: ["beam", "bolt", "orb", "arrow", "spiral", "wave"],
  Sword: ["slash", "teleport", "meteor", "uppercut"],
  Mace: ["meteor", "wave", "uppercut"],
  Tank: ["charge", "wave", "meteor"],
  Fighter: ["barrage", "uppercut", "spiral", "meteor"],
};

// Offline names: [prefix-free name, description]. Playful, a little anime. SPECIAL_NAMES is for the first
// special, ULT_NAMES for the ultimate (bigger, louder, more final).
export const SPECIAL_NAMES: Record<SpecialKind, [string, string][]> = {
  bolt: [["Ballpoint Bolt", "A crackling shot of pure ink"], ["Footnote Zap", "Cites you. Painfully."]],
  arrow: [["Pencil Javelin", "Sharpened to a deadly point"], ["Ruler Railshot", "Perfectly straight, perfectly rude"]],
  orb: [["Ink Blot Meteor", "A wobbling sphere of wet ink"], ["Eraser Comet", "Rubs you out of the round"]],
  beam: [["Ink-ame-hameha", "Cupped hands, one long scream, one huge beam"], ["Margin Cannon", "Fires a beam the width of the page"], ["Highlighter Flash", "Neon. Blinding. Unfair."]],
  wave: [["Notebook Quake", "Slams the page so hard the lines ripple"], ["Spine Crack Wave", "The ground itself folds toward you"]],
  slash: [["Crescent Scribble", "One stroke, too fast to see"], ["Paper Cut Supreme", "The most painful cut in existence"]],
  charge: [["Hardcover Rush", "Charges in like a falling textbook"], ["Binder Bash", "Three rings of armored fury"]],
  uppercut: [["Doodle Dragon Fist", "A flaming fist that rises to the sky"], ["Rising Sharpie", "Leaves a permanent mark"]],
  spiral: [["Scribble-gan", "A spinning ball of scribbles, rammed home"], ["Spiral Doodle Sphere", "Spins faster than a bored student's pen"]],
  teleport: [["Eraser Step", "Erases itself, redraws behind you"], ["Page Flip Ambush", "Turns the page and appears at your back"]],
  barrage: [["Ink Ink Ink Rush", "Fifty punches, zero hesitation"], ["Scribble Storm Fists", "A flurry so fast it smudges"]],
  meteor: [["Staple Meteor", "Drops from the sky like a heavy-duty staple"], ["Margin Drop Kick", "Leaves a crater in the page"]],  shatter: [["Knuckle Crumple", "Closes a fist around the page and the page crumples"], ["Paper Wad Grab", "Cannot be blocked, folded or recycled"]],
  counter: [["Parry in the Margin", "Waits for the swing, then writes the reply over it"], ["Correction Stance", "Whatever you wrote, it gets crossed out"]],
  dash_slash: [["Sunline Pass", "Through you in a blink, back to back before the page turns"], ["Ruler Dash", "One straight line, drawn straight through you"]],
  pull: [["Iron Reel", "Hooks a line into you and reels you in, meter and all"], ["Bookmark Snare", "Marks your place, then pulls you to it"]],
  remote_detonation: [["Red Margin", "Underlines where you stand, then cuts along the line"], ["Delayed Strikethrough", "Crosses you out, a moment late"]],
  time_stop_barrage: [["Paused Ink World", "Time stops, the blows land, time starts again"]],
};

export const ULT_NAMES: Record<SpecialKind, [string, string][]> = {
  bolt: [["Final Footnote", "One citation, delivered at lightning speed, then the pages keep coming"], ["Thesis Thunder", "A bolt that drags you in and grades you in person"]],
  arrow: [["Last Line Volley", "The arrow lands, the ruler follows, the margin cheers"], ["Pencil Rain Execution", "Sharpened to a point, then sharpened again, on you"]],
  orb: [["Total Blot Eclipse", "The orb swallows you whole and spits out a stain"], ["Rubber Planet Crush", "A world of eraser, rolling over one fighter"]],
  beam: [["Ink-ame-hameha: Full Page", "Every line on the page lights up behind one scream"], ["Margin Sun Cannon", "A beam so wide the page gets a new border"], ["Highlighter Judgement", "Neon. Final. Unforgivable."]],
  wave: [["Spine Crack Apocalypse", "The whole notebook folds and you are in the crease"], ["Seismic Staple Storm", "The ground rips, the wave grabs, the finale hits"]],
  slash: [["Ten Thousand Cuts of Ink", "One stroke, then ten thousand, all before you blink"], ["Guillotine Margin", "The cut that ends the chapter"]],
  charge: [["Hardcover Stampede", "A falling textbook, but it keeps falling"], ["Binder Breaker Rush", "Three rings of armor and zero brakes"]],
  uppercut: [["Doodle Dragon Ascension", "A flaming fist, a locked grip, and a one-way trip to the ceiling"], ["Rising Sharpie Finale", "Leaves a permanent mark on the sky"]],
  spiral: [["Scribble-gan: Maximum Tangle", "A sphere of scribbles that does not let go"], ["Great Spiral Notebook", "Spins until the page runs out"]],
  teleport: [["Eraser Step: Infinite Redraw", "Erased, redrawn, erased again, always behind you"], ["Page Flip Massacre", "Turns every page at once, appears on all of them"]],
  barrage: [["Ink Ink Ink Ink Rush", "Five hundred punches and not one apology"], ["Scribble Storm Overdrive", "So fast the paper smokes"]],
  meteor: [["Staple Meteor: Armageddon", "Drops from orbit, takes you with it"], ["Margin Crater Finale", "Leaves a crater in the page and the page in the crater"]],  shatter: [["Knuckle Crumple: Total Wad", "A grab that does not let go until you are a paper ball"], ["Final Fold", "Folds you in half, then in half again"]],
  counter: [["Last Word Parry", "Lets you finish the sentence, then finishes it for you"], ["Whiteout Reply", "Your best move, erased and answered"]],
  dash_slash: [["Sunline Pass: Eclipse", "Through you, around you, through you again"], ["Straightedge Execution", "A line so straight the page splits"]],
  pull: [["Iron Reel: Spool Out", "Reels you in and keeps reeling"], ["Margin Chain Finale", "A chain with no loose end"]],
  remote_detonation: [["Red Margin: Final Edit", "Marks you, waits, and cuts the whole line"], ["Strikethrough Sentence", "The cut was always going to land there"]],
  time_stop_barrage: [["Freeze Frame Flurry", "The page holds still for everyone but one"]],
};

// The name to show for a fighter's ultimate: its own, or a stock one for old fighters that were made without.
export const ultTitle = (name: string | null | undefined, kind: string | null | undefined, cls: string) => name || ULT_NAMES[ultOf(kind, cls)][0][0];
