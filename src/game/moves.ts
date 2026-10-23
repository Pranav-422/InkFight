// Move catalogue shared by the sim, the renderer, the CPU and the server.
// Fighting styles give each fighter its own punch/kick combos; specials are
// building blocks that Claude (or the offline generator) picks and names.

export const SPECIAL_KINDS = ["bolt", "arrow", "orb", "slash", "charge", "uppercut", "beam", "spiral", "wave", "teleport", "barrage", "meteor"] as const;
export type SpecialKind = (typeof SPECIAL_KINDS)[number];

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
};

// ---------------------------------------------------------------- normal moves

export type MoveName =
  | "jab" | "cross" | "hook" | "uppercutP" | "elbow" | "knee" | "flyingKnee" | "palm" | "straight" | "headbutt"
  | "frontKick" | "roundhouse" | "spinKick" | "axeKick" | "lowKick" | "sweep";

// Timings in ticks. Hitbox from `reach` in front of the body, between `top` and `bot`
// (fractions of body height above the feet). `lunge`: forward push while active.
export type Move = {
  dur: number; from: number; to: number; reach: number; mult: number; knock: number;
  launch?: number; top: number; bot: number; lunge: number; hop?: number; tip: "hand" | "handB" | "foot" | "footB" | "knee" | "head";
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
  sweep: { dur: 28, from: 11, to: 16, reach: 96, mult: 1.2, knock: 4, launch: 7, top: 0.25, bot: 0, lunge: 2, tip: "foot" },
};

// Fighting styles (a nod to Lookism's cast of fighters). Tap punch/kick again
// before the combo window closes to chain into the next move.
export const STYLES = ["Boxing", "Taekwondo", "Muay Thai", "Karate", "Street", "Systema"] as const;
export type Style = (typeof STYLES)[number];

export const STYLE_INFO: Record<Style, { punch: MoveName[]; kick: MoveName[]; blurb: string }> = {
  Boxing: { punch: ["jab", "cross", "hook", "uppercutP"], kick: ["lowKick"], blurb: "Hands of lightning: jab, cross, hook, uppercut" },
  Taekwondo: { punch: ["jab", "straight"], kick: ["roundhouse", "spinKick", "axeKick"], blurb: "Kicks for days: roundhouse, spinning back kick, axe kick" },
  "Muay Thai": { punch: ["jab", "elbow"], kick: ["roundhouse", "knee", "flyingKnee"], blurb: "Eight limbs: elbows, knees and a flying knee" },
  Karate: { punch: ["straight", "palm"], kick: ["frontKick", "roundhouse"], blurb: "Clean, straight lines: reverse punch, palm strike, front kick" },
  Street: { punch: ["hook", "hook", "headbutt"], kick: ["frontKick", "lowKick"], blurb: "No rules: wild hooks, a headbutt, a stomp kick" },
  Systema: { punch: ["palm", "palm", "elbow"], kick: ["lowKick", "sweep"], blurb: "Loose and sneaky: palm strikes, elbows, a leg sweep" },
};

export const COMBO_WINDOW = 22; // ticks after a move ends in which the next press continues the chain

// Damage scale per style and chain, so every chain deals the same damage per second
// when strung out in full (a 4-hit boxing chain otherwise out-damages a 2-hit karate
// one). Duration counts each move plus the ~20-tick cooldown after the last one.
const TARGET_DPS = 4.6 / 96; // the boxing punch chain's mult per tick, the reference
export const STYLE_POWER = Object.fromEntries(
  STYLES.map((s) => {
    const power = (chain: MoveName[]) => TARGET_DPS / (chain.reduce((n, m) => n + MOVES[m].mult, 0) / (chain.reduce((n, m) => n + MOVES[m].dur, 0) + 20));
    return [s, { punch: power(STYLE_INFO[s].punch), kick: power(STYLE_INFO[s].kick) }];
  }),
) as Record<Style, { punch: number; kick: number }>;

// Damage factors found by simulation (`npx tsx scripts/balance.ts --tune`): each style
// and special set so it wins about half its fights against a mixed pool of every
// style x special with the same stats. Re-run the tuner after changing moves or specials.
export const STYLE_TUNE: Record<Style, number> = { Boxing: 0.86, Taekwondo: 1.2, "Muay Thai": 1.05, Karate: 0.99, Street: 0.94, Systema: 0.8 };
export const SPECIAL_TUNE: Record<SpecialKind, number> = {
  bolt: 2, arrow: 1.51, orb: 1.62, slash: 1.2, charge: 0.63, uppercut: 1.41, beam: 1.03, spiral: 2.27, wave: 2.21, teleport: 1.2, barrage: 0.61, meteor: 1.91,
};

// Defaults for fighters made before moves were stored (and for unknown values).
export const CLASS_SPECIAL: Record<string, SpecialKind> = {
  Mage: "beam",
  Ranger: "arrow",
  Caster: "orb",
  Warrior: "slash",
  Tank: "charge",
  Brawler: "barrage",
};
export const CLASS_STYLE: Record<string, Style> = {
  Mage: "Systema",
  Ranger: "Taekwondo",
  Caster: "Karate",
  Warrior: "Karate",
  Tank: "Muay Thai",
  Brawler: "Boxing",
};

export const specialOf = (kind: string | null | undefined, cls: string): SpecialKind =>
  (SPECIAL_KINDS as readonly string[]).includes(kind ?? "") ? (kind as SpecialKind) : (CLASS_SPECIAL[cls] ?? "uppercut");
export const styleOf = (style: string | null | undefined, cls: string): Style =>
  (STYLES as readonly string[]).includes(style ?? "") ? (style as Style) : (CLASS_STYLE[cls] ?? "Street");

// Which specials suit each class, for the offline generator (Claude may pick any).
export const CLASS_SPECIAL_POOL: Record<string, SpecialKind[]> = {
  Mage: ["beam", "bolt", "spiral", "orb"],
  Caster: ["orb", "wave", "beam", "spiral"],
  Warrior: ["slash", "teleport", "meteor", "uppercut"],
  Tank: ["charge", "wave", "meteor"],
  Ranger: ["arrow", "bolt", "teleport"],
  Brawler: ["barrage", "uppercut", "spiral", "meteor"],
};

// Offline names: [prefix-free name, description]. Playful, a little anime.
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
  meteor: [["Staple Meteor", "Drops from the sky like a heavy-duty staple"], ["Margin Drop Kick", "Leaves a crater in the page"]],
};
