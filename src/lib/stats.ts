// Rule half of the hybrid stat engine. Pure and deterministic: the same
// detected features always produce the same rule stats.
//
// Fairness model (docs/research/stats.json): everyone has the same 200 HP. A drawing
// only decides how a fixed BUDGET of points is split between durability (`def`, damage
// taken), attack and speed. A tank trades speed for durability; nobody gets more total.

export type Stats = { hp: number; atk: number; def: number; spd: number };
export type StatKey = keyof Stats;

export const HP = 200;
export const BUDGET = 210; // atk + def + spd, for every fighter

export const STAT_CAPS: Record<StatKey, [number, number]> = {
  hp: [HP, HP],
  atk: [40, 100],
  def: [40, 100],
  spd: [40, 100],
};

export const CLASSES = ["Mage", "Warrior", "Brawler", "Caster", "Tank", "Ranger"] as const;
export type CharacterClass = (typeof CLASSES)[number];

// Item → class. First match wins, so order is priority.
const ITEM_CLASS_MAP: [RegExp, CharacterClass][] = [
  [/book|tome|scroll|spellbook/, "Mage"],
  [/sword|blade|axe|katana|dagger|knife|spear/, "Warrior"],
  [/staff|wand|rod/, "Caster"],
  [/shield|armou?r|helmet/, "Tank"],
  [/bow|arrow|crossbow|sling/, "Ranger"],
];

export function classFromItems(items: string[]): CharacterClass {
  for (const [pattern, cls] of ITEM_CLASS_MAP) {
    if (items.some((item) => pattern.test(item.toLowerCase()))) return cls;
  }
  return "Brawler";
}

// Each class's shape of the budget (each row sums to BUDGET).
const CLASS_BASE: Record<CharacterClass, Stats> = {
  Mage: { hp: HP, atk: 82, def: 55, spd: 73 },
  Warrior: { hp: HP, atk: 78, def: 72, spd: 60 },
  Brawler: { hp: HP, atk: 72, def: 70, spd: 68 },
  Caster: { hp: HP, atk: 76, def: 60, spd: 74 },
  Tank: { hp: HP, atk: 58, def: 94, spd: 58 },
  Ranger: { hp: HP, atk: 68, def: 55, spd: 87 },
};

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
  if (features.size === "large") {
    adj.push({ reason: "Big figure", stat: "def", delta: 12 }, { reason: "Big figure", stat: "spd", delta: -8 });
  } else if (features.size === "small") {
    adj.push({ reason: "Tiny figure", stat: "def", delta: -10 }, { reason: "Tiny figure", stat: "spd", delta: 10 });
  }
  if (features.pose === "aggressive") {
    adj.push({ reason: "Aggressive pose", stat: "atk", delta: 8 }, { reason: "Aggressive pose", stat: "def", delta: -5 });
  } else if (features.pose === "defensive") {
    adj.push({ reason: "Defensive stance", stat: "def", delta: 8 }, { reason: "Defensive stance", stat: "atk", delta: -4 });
  }
  const colors = features.dominant_colors.map((c) => c.toLowerCase());
  if (colors.some((c) => /red|orange/.test(c))) adj.push({ reason: "Fiery colors", stat: "atk", delta: 4 });
  if (colors.some((c) => /blue|cyan/.test(c))) adj.push({ reason: "Cool colors", stat: "def", delta: 4 });
  if (colors.some((c) => /green|yellow/.test(c))) adj.push({ reason: "Lively colors", stat: "spd", delta: 4 });
  const m = features.measured;
  if (m && m.stance > 0.45) adj.push({ reason: "Wide stance", stat: "def", delta: 5 });
  if (m && m.armSpread > 0.65) adj.push({ reason: "Arms out", stat: "atk", delta: 5 });
  return adj;
}

// Fit any stat line into the fairness model: HP fixed, atk+def+spd = BUDGET, each
// inside its caps, keeping the line's proportions. Works for old fighters too.
export function clampStats(s: Stats): Stats {
  const keys = ["atk", "def", "spd"] as const;
  const v = { atk: Math.max(1, s.atk), def: Math.max(1, s.def), spd: Math.max(1, s.spd) };
  // Scale to the budget, clamp, then hand the leftover to stats that still have room.
  for (let round = 0; round < 4; round++) {
    const sum = v.atk + v.def + v.spd;
    const free = keys.filter((k) => (sum < BUDGET ? v[k] < STAT_CAPS[k][1] : v[k] > STAT_CAPS[k][0]));
    if (Math.abs(sum - BUDGET) < 0.5 || !free.length) break;
    const share = free.reduce((n, k) => n + v[k], 0);
    for (const k of free) v[k] = Math.min(STAT_CAPS[k][1], Math.max(STAT_CAPS[k][0], v[k] + ((BUDGET - sum) * v[k]) / share));
  }
  const out = { hp: HP, atk: Math.round(v.atk), def: Math.round(v.def), spd: Math.round(v.spd) };
  // Rounding can leave the total one point off; settle it on the largest stat.
  const big = keys.reduce((a, b) => (out[a] >= out[b] ? a : b));
  out[big] += BUDGET - (out.atk + out.def + out.spd);
  return out;
}

export function ruleStats(cls: CharacterClass, features: Features): Stats {
  const stats = { ...CLASS_BASE[cls] };
  for (const a of ruleAdjustments(features)) stats[a.stat] += a.delta;
  return clampStats(stats);
}

// Final stats lean on the rules (70%) so similar drawings land close together;
// the model's proposal (30%) adds per-drawing character. Then hard-clamped.
export const RULE_WEIGHT = 0.7;

export function blendStats(rule: Stats, model: Stats | null): Stats {
  if (!model) return rule;
  const m = clampStats(model);
  const mix = (k: StatKey) => rule[k] * RULE_WEIGHT + m[k] * (1 - RULE_WEIGHT);
  return clampStats({ hp: mix("hp"), atk: mix("atk"), def: mix("def"), spd: mix("spd") });
}
