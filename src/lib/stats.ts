// Rule half of the hybrid stat engine. Pure and deterministic: the same
// detected features always produce the same rule stats.
//
// Fairness model (docs/research/stats.json): everyone has the same 200 HP. A drawing
// only decides how a fixed BUDGET of points is split between five stats:
//   atk = STR (physical damage)   def = DUR (damage taken, block)   spd = SPD (walk, combo tempo)
//   agi = AGI (jump, air control, hit recovery)   iq = IQ (energy gain, magic damage)
// A tank trades speed for durability; nobody gets more total.

export type Stats = { hp: number; atk: number; def: number; spd: number; agi: number; iq: number };
export type StatKey = keyof Stats;
export const STAT_KEYS = ["atk", "def", "spd", "agi", "iq"] as const;

export const HP = 200;
export const BUDGET = 350; // atk + def + spd + agi + iq, for every fighter (70 average each)

export const STAT_CAPS: Record<StatKey, [number, number]> = {
  hp: [HP, HP],
  atk: [40, 100],
  def: [40, 100],
  spd: [40, 100],
  agi: [40, 100],
  iq: [40, 100],
};

export const CLASSES = ["Sword", "Mace", "Tank", "Attacker", "Fighter"] as const;
export type CharacterClass = (typeof CLASSES)[number];

// Class names before InkFight 2.0, for anything not migrated (old rooms, caches).
const OLD_CLASS: Record<string, CharacterClass> = { Warrior: "Sword", Brawler: "Fighter", Mage: "Attacker", Caster: "Attacker", Ranger: "Attacker" };
export const normClass = (cls: string): CharacterClass => ((CLASSES as readonly string[]).includes(cls) ? (cls as CharacterClass) : (OLD_CLASS[cls] ?? "Fighter"));

// Item -> class. First match wins, so order is priority.
const ITEM_CLASS_MAP: [RegExp, CharacterClass][] = [
  [/book|tome|scroll|spellbook|staff|wand|rod|bow|arrow|crossbow|sling/, "Attacker"],
  [/sword|blade|katana|dagger|knife|spear/, "Sword"],
  [/mace|club|hammer|axe|flail/, "Mace"],
  [/shield|armou?r|helmet/, "Tank"],
];

export function classFromItems(items: string[]): CharacterClass {
  for (const [pattern, cls] of ITEM_CLASS_MAP) {
    if (items.some((item) => pattern.test(item.toLowerCase()))) return cls;
  }
  return "Fighter";
}

// Each class's shape of the budget (each row sums to BUDGET). Starting points: the
// class factors in moves.ts (CLASS_TUNE, found by scripts/balance.ts) even out the rest.
const CLASS_BASE: Record<CharacterClass, Stats> = {
  Sword: { hp: HP, atk: 78, def: 62, spd: 78, agi: 74, iq: 58 },
  Mace: { hp: HP, atk: 92, def: 80, spd: 60, agi: 58, iq: 60 }, // a heavy hitter, not a second tank: less DUR than the Tank, a step quicker
  Tank: { hp: HP, atk: 66, def: 100, spd: 56, agi: 56, iq: 72 },
  Attacker: { hp: HP, atk: 56, def: 54, spd: 72, agi: 76, iq: 92 },
  Fighter: { hp: HP, atk: 76, def: 70, spd: 76, agi: 74, iq: 54 },
};

// Elements: a status effect on special hits (see sim.ts). The ink colour suggests one;
// the player can pick any.
export const ELEMENTS = ["NONE", "FIRE", "ELECTRIC", "FROST", "POISON", "BLEED", "GRAVITY"] as const;
export type Element = (typeof ELEMENTS)[number];
export function suggestElement(colors: string[]): Element {
  const c = colors.map((x) => x.toLowerCase());
  if (c.some((x) => /red|orange/.test(x))) return "FIRE";
  if (c.some((x) => /blue|cyan|yellow/.test(x))) return "ELECTRIC";
  if (c.some((x) => /green|purple/.test(x))) return "POISON";
  return "GRAVITY";
}

export type Features = {
  size: "small" | "medium" | "large";
  pose: "aggressive" | "defensive" | "neutral";
  dominant_colors: string[];
  // Numbers read off the drawing in the browser (see measureInk in src/game/sprite.ts).
  measured?: Measurements;
};

export type Measurements = { fill: number; aspect: number; stance: number; armSpread: number };

// Turn measured shape numbers into the size/pose words the rules use.
export function featuresFromMeasurements(m: Measurements, colors: string[]): Features {
  const size = m.fill > 0.16 || m.aspect > 0.9 ? "large" : m.fill < 0.07 && m.aspect < 0.45 ? "small" : "medium";
  const pose = m.armSpread - m.stance > 0.25 ? "aggressive" : m.stance - m.armSpread > 0.15 ? "defensive" : "neutral";
  return { size, pose, dominant_colors: colors, measured: m };
}

export type Adjustment = { reason: string; stat: StatKey; delta: number };

export function ruleAdjustments(features: Features): Adjustment[] {
  const adj: Adjustment[] = [];
  const add = (reason: string, ...d: [StatKey, number][]) => d.forEach(([stat, delta]) => adj.push({ reason, stat, delta }));
  if (features.size === "large") add("Big figure", ["atk", 6], ["def", 8], ["agi", -8]);
  else if (features.size === "small") add("Tiny figure", ["spd", 6], ["agi", 6], ["def", -8]);
  if (features.pose === "aggressive") add("Aggressive pose", ["atk", 8], ["def", -5]);
  else if (features.pose === "defensive") add("Defensive stance", ["def", 8], ["atk", -4]);
  const colors = features.dominant_colors.map((c) => c.toLowerCase());
  if (colors.some((c) => /red|orange/.test(c))) add("Fiery colors", ["atk", 4]);
  if (colors.some((c) => /blue|cyan/.test(c))) add("Cool colors", ["def", 4]);
  if (colors.some((c) => /green|yellow/.test(c))) add("Lively colors", ["spd", 4]);
  const m = features.measured;
  if (m) {
    if (m.aspect < 0.45) add("Tall and lean", ["spd", 5], ["agi", 5]);
    else if (m.aspect > 0.9) add("Wide build", ["def", 6]);
    if (m.stance > 0.45) add("Wide stance", ["def", 5]);
    else if (m.stance < 0.2) add("Narrow stance", ["agi", 5]);
    if (m.armSpread > 0.65) add("Arms out", ["atk", 5]);
    else if (m.armSpread < 0.3) add("Arms close", ["iq", 4]);
  }
  return adj;
}

// Fit any stat line into the fairness model: HP fixed, the five stats sum to BUDGET,
// each inside its caps, keeping the line's proportions. Old fighters (no agi/iq) get 70s.
export type StatLine = { hp: number; atk: number; def: number; spd: number; agi?: number; iq?: number };
export function clampStats(s: StatLine): Stats {
  const keys = STAT_KEYS;
  const v = { atk: Math.max(1, s.atk), def: Math.max(1, s.def), spd: Math.max(1, s.spd), agi: Math.max(1, s.agi ?? 70), iq: Math.max(1, s.iq ?? 70) };
  // Scale to the budget, clamp, then hand the leftover to stats that still have room.
  for (let round = 0; round < 4; round++) {
    const sum = keys.reduce((n, k) => n + v[k], 0);
    const free = keys.filter((k) => (sum < BUDGET ? v[k] < STAT_CAPS[k][1] : v[k] > STAT_CAPS[k][0]));
    if (Math.abs(sum - BUDGET) < 0.5 || !free.length) break;
    const share = free.reduce((n, k) => n + v[k], 0);
    for (const k of free) v[k] = Math.min(STAT_CAPS[k][1], Math.max(STAT_CAPS[k][0], v[k] + ((BUDGET - sum) * v[k]) / share));
  }
  const out = { hp: HP, atk: Math.round(v.atk), def: Math.round(v.def), spd: Math.round(v.spd), agi: Math.round(v.agi), iq: Math.round(v.iq) };
  // Rounding can leave the total a point or two off; settle it on the largest stat.
  const big = keys.reduce((a, b) => (out[a] >= out[b] ? a : b));
  out[big] += BUDGET - keys.reduce((n, k) => n + out[k], 0);
  return out;
}

export function ruleStats(cls: CharacterClass | string, features: Features): Stats {
  const stats = { ...CLASS_BASE[normClass(cls)] };
  for (const a of ruleAdjustments(features)) stats[a.stat] += a.delta;
  return clampStats(stats);
}

// Final stats lean on the rules (70%) so similar drawings land close together;
// the model's proposal (30%) adds per-drawing character. Then hard-clamped.
export const RULE_WEIGHT = 0.7;

export function blendStats(rule: Stats, model: StatLine | null): Stats {
  if (!model) return rule;
  const m = clampStats(model);
  const mix = (k: StatKey) => rule[k] * RULE_WEIGHT + m[k] * (1 - RULE_WEIGHT);
  return clampStats({ hp: mix("hp"), atk: mix("atk"), def: mix("def"), spd: mix("spd"), agi: mix("agi"), iq: mix("iq") });
}
