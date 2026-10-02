// Rule half of the hybrid stat engine. Pure and deterministic: the same
// detected features always produce the same rule stats.

export type Stats = { hp: number; atk: number; def: number; spd: number };
export type StatKey = keyof Stats;

export const STAT_CAPS: Record<StatKey, [number, number]> = {
  hp: [60, 140],
  atk: [40, 90],
  def: [40, 90],
  spd: [40, 90],
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

// Each class starts from a baseline that already sits inside the caps.
const CLASS_BASE: Record<CharacterClass, Stats> = {
  Mage: { hp: 85, atk: 72, def: 48, spd: 66 },
  Warrior: { hp: 105, atk: 74, def: 62, spd: 56 },
  Brawler: { hp: 110, atk: 64, def: 58, spd: 62 },
  Caster: { hp: 90, atk: 68, def: 52, spd: 64 },
  Tank: { hp: 130, atk: 52, def: 80, spd: 44 },
  Ranger: { hp: 90, atk: 66, def: 50, spd: 78 },
};

export type Features = {
  size: "small" | "medium" | "large";
  pose: "aggressive" | "defensive" | "neutral";
  dominant_colors: string[];
};

export type Adjustment = { reason: string; stat: StatKey; delta: number };

export function ruleAdjustments(features: Features): Adjustment[] {
  const adj: Adjustment[] = [];
  if (features.size === "large") {
    adj.push({ reason: "Big figure", stat: "hp", delta: 15 }, { reason: "Big figure", stat: "spd", delta: -6 });
  } else if (features.size === "small") {
    adj.push({ reason: "Tiny figure", stat: "hp", delta: -12 }, { reason: "Tiny figure", stat: "spd", delta: 10 });
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
  return adj;
}

export function clamp(stat: StatKey, value: number): number {
  const [min, max] = STAT_CAPS[stat];
  return Math.round(Math.min(max, Math.max(min, value)));
}

export function clampStats(s: Stats): Stats {
  return { hp: clamp("hp", s.hp), atk: clamp("atk", s.atk), def: clamp("def", s.def), spd: clamp("spd", s.spd) };
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
