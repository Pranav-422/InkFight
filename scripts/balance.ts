// Fairness check: CPU vs CPU (hard) for every class pairing with its default kit (item, style,
// special), plus a stat-line check. Prints win rates and average round length.
//   npx tsx scripts/balance.ts [matches per pairing, default 60]
//   npx tsx scripts/balance.ts --tune [N] [passes]   find STYLE_TUNE / SPECIAL_TUNE / CLASS_TUNE /
//       ELEMENT_TUNE (src/game/moves.ts) and the stat spans in TUNE (src/game/sim.ts);
//       passes = comma list of specials,styles,skills,lines,classes,elements
// Exits 1 when a class pair (both cells together: 40-60%) or the stat lines (45-62%) miss their targets, or a class
// can only be balanced at an extreme factor (a structural problem: fix the code, not the number).
//   TUNE_JSON='{"STR_EXP":0.6}' npx tsx scripts/balance.ts   try other sim TUNE values
//   TRAIT_JSON / CLASS_JSON: the same for TRAIT (sim.ts) and CLASS_TUNE
//   LINES_ONLY=1 LINES=240 npx tsx scripts/balance.ts   just the stat-line check, 240 kits
//   SKILLS_OFF=1 / MATRIX_ONLY=1   side skills do nothing / skip the stat lines
// Math.random is seeded so a run can be repeated; the CPU is the only user of it.

import { cpuThink, newBrain } from "../src/game/cpu";
import { CLASS_ITEM, CLASS_SKILL, CLASS_SPECIAL, CLASS_STYLE, CLASS_TUNE, ELEMENT_TUNE, SIDE_SKILLS, SKILL_INFO, SKILL_TUNE, SPECIAL_KINDS, SPECIAL_TUNE, STYLE_TUNE, STYLES } from "../src/game/moves";
import { createMatch, EMPTY_INPUT, step, TICK_HZ, TRAIT, TUNE, type FighterStats } from "../src/game/sim";
import { CLASSES, ELEMENTS, ruleStats } from "../src/lib/stats";

const SEED = 20261024;
let seed = SEED;
Math.random = () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
Object.assign(TUNE, JSON.parse(process.env.TUNE_JSON ?? "{}"));
Object.assign(TRAIT, JSON.parse(process.env.TRAIT_JSON ?? "{}"));
Object.assign(CLASS_TUNE, JSON.parse(process.env.CLASS_JSON ?? "{}"));
if (process.env.SKILLS_OFF) for (const k of SIDE_SKILLS) SKILL_INFO[k].dur = 0; // what the side skills are worth

const TUNING = process.argv[2] === "--tune";
const N = Number(TUNING ? (process.argv[3] ?? 96) : (process.argv[2] ?? 60));
const PASSES = (TUNING && process.argv[4] ? process.argv[4] : "specials,styles,skills,lines,classes,elements").split(",");
const neutral = { size: "medium", pose: "neutral", dominant_colors: [] } as const;
// A class's usual stat line with its default item, style and special.
const fighter = (cls: string): FighterStats => ({
  ...ruleStats(cls, { ...neutral, dominant_colors: [] }),
  class: cls,
  item: CLASS_ITEM[cls],
  style: CLASS_STYLE[cls],
  specialKind: CLASS_SPECIAL[cls],
});

let totalSecs = 0;
function play(a: FighterStats, b: FighterStats, skillA = 1, skillB = 1) {
  const ia = { ...EMPTY_INPUT }, ib = { ...EMPTY_INPUT };
  const m = createMatch(a, b, [ia, ib]);
  const ba = newBrain("hard"), bb = newBrain("hard");
  ba.skillUse = skillA;
  bb.skillUse = skillB;
  let ticks = 0, rounds = 0, lastRound = 1;
  while (m.phase !== "matchEnd" && ticks < TICK_HZ * 60 * 6) {
    cpuThink(m, 0, ba, ia);
    cpuThink(m, 1, bb, ib);
    step(m, [ia, ib]);
    ticks++;
    if (m.round !== lastRound) {
      rounds++;
      lastRound = m.round;
    }
  }
  totalSecs += ticks / TICK_HZ / Math.max(1, rounds + 1);
  return { winner: m.matchWinner };
}

// Same stats, one difference: how often does `a` beat `b`? Sides swap every other match.
// Every measurement starts from the same seed (common random numbers), so two candidates differ
// only by their numbers, not by luck. That's what lets the bisection converge.
function rate(a: FighterStats, b: FighterStats, n: number, start = SEED) {
  seed = start;
  let wins = 0;
  for (let i = 0; i < n; i++) wins += (i % 2 ? play(b, a).winner === 1 : play(a, b).winner === 0) ? 1 : 0;
  return wins / n;
}

// A style × special pair for match i: spread over every combination, the same for both sides of a test.
const kit = (i: number) => ({ style: STYLES[i % STYLES.length], specialKind: SPECIAL_KINDS[(i * 5 + Math.floor(i / 12)) % SPECIAL_KINDS.length] });
const avg: FighterStats = { hp: 200, atk: 70, def: 70, spd: 70, agi: 70, iq: 70, class: "Fighter" };

// Each stat alone: 100 in that stat and ~62 in the other four (same 350 budget) vs an all-70 fighter,
// with the same style × special on both sides so only the numbers differ. Target 45-62%.
const NAMES = { atk: "STR", def: "DUR", spd: "SPD", agi: "AGI", iq: "IQ" } as const;
function statLines(n: number, only?: (keyof typeof NAMES)[]) {
  return (only ?? (Object.keys(NAMES) as (keyof typeof NAMES)[])).map((k) => {
    const others = [62, 63, 62, 63];
    const stats = { ...avg };
    for (const o of Object.keys(NAMES) as (keyof typeof NAMES)[]) stats[o] = o === k ? 100 : others.shift()!;
    let wins = 0;
    // Each kit gets its own seed: with one shared seed every kit replayed the same CPU decisions, so 200 kits
    // were worth a handful of samples and a line swung ±10 points from noise alone.
    for (let i = 0; i < n; i++) wins += rate({ ...stats, ...kit(i) }, { ...avg, ...kit(i) }, 2, SEED + i * 7919);
    return { k, pct: Math.round((wins / n) * 100) };
  });
}

if (TUNING) {
  // Opponents: every style × special, with the current factors. Tuning against this mix
  // (not one fixed rival) balances melee vs ranged too. Two passes so factors settle.
  const pool: FighterStats[] = STYLES.flatMap((style) => SPECIAL_KINDS.map((specialKind) => ({ ...avg, style, specialKind })));
  const vs = (variant: (i: number) => FighterStats, opp: (i: number) => FighterStats) => {
    seed = SEED;
    let wins = 0;
    for (let i = 0; i < N; i++) wins += (i % 2 ? play(opp(i), variant(i)).winner === 1 : play(variant(i), opp(i)).winner === 0) ? 1 : 0;
    return wins / N;
  };
  const fromPool = (i: number) => pool[(i * 7919) % pool.length];
  // Bisect a factor until the variant wins `target` of its fights (more factor = more wins).
  const tune = (set: (v: number) => void, win: () => number, target = 0.5, lo = 0.3, hi = 3) => {
    for (let i = 0; i < 7; i++) {
      const mid = (lo + hi) / 2;
      set(mid);
      if (win() > target) hi = mid;
      else lo = mid;
    }
    const v = Math.round(((lo + hi) / 2) * 1000) / 1000;
    set(v);
    return v;
  };
  const say = (what: string, v: number, win: () => number) => console.log(`${what}: ${v} (wins ${Math.round(win() * 100)}%)`);
  let structural = false;
  // The knob each stat line moves (SPD pays in attack tempo; IQ also fills the meter, bounded in deriveDef),
  // with a step size per knob that halves whenever its line overshoots.
  const LINE_KNOBS: [keyof typeof NAMES, keyof typeof TUNE][] = [["atk", "STR_EXP"], ["def", "DUR_EXP"], ["spd", "TEMPO_GAIN"], ["agi", "DODGE_SPAN"], ["iq", "IQ_EXP"]];
  const lineGain = Object.fromEntries(LINE_KNOBS.map(([k]) => [k, 2])) as Record<string, number>;
  const lineErr: Record<string, number> = {};
  for (let pass = 1; pass <= Number(process.env.PASSES_N ?? 2); pass++) {
    if (PASSES.includes("styles")) {
      // A style is judged across all specials, a special across all styles.
      for (const s of STYLES) {
        const win = () => vs((i) => ({ ...avg, style: s, specialKind: SPECIAL_KINDS[i % SPECIAL_KINDS.length] }), fromPool);
        console.log(`pass ${pass} style ${s}: ${tune((v) => (STYLE_TUNE[s] = v), win)}`);
      }
    }
    if (PASSES.includes("specials")) {
      for (const k of SPECIAL_KINDS) {
        const win = () => vs((i) => ({ ...avg, style: STYLES[i % STYLES.length], specialKind: k }), fromPool);
        console.log(`pass ${pass} special ${k}: ${tune((v) => (SPECIAL_TUNE[k] = v), win)}`);
      }
    }
    if (PASSES.includes("skills")) {
      // A class with its side skill vs the same class that never uses it: 60% (a mirror amplifies any edge, so that's
      // a few % of HP). The edge is only ~10 points over even, so it needs many matches (SKILL_N, default 400).
      const n = Number(process.env.SKILL_N ?? 400);
      for (const c of CLASSES) {
        const k = CLASS_SKILL[c];
        const win = () => {
          seed = SEED;
          let wins = 0;
          for (let i = 0; i < n; i++) wins += (i % 2 ? play(fighter(c), fighter(c), 0, 1).winner === 1 : play(fighter(c), fighter(c), 1, 0).winner === 0) ? 1 : 0;
          return wins / n;
        };
        const v = tune((x) => (SKILL_TUNE[k] = x), win, 0.6, 0.1, 3);
        console.log(`pass ${pass} skill ${k} (${c}): ${v}`);
        if (v <= 0.15 || v >= 2.94) {
          console.log(`STRUCTURAL: ${k} only balances at the edge of its range`);
          structural = true;
        }
      }
    }
    if (PASSES.includes("lines")) {
      // Every stat line aims at 50%: 30 points in one stat are worth 8 points in each of the other four,
      // so a specialist and a generalist are even. All knobs move at once from one measurement of every line:
      // tuning one at a time never settled, since each span changes what the other stats are worth.
      for (let it = 1; it <= 8; it++) {
        const ls = statLines(Number(process.env.LINES ?? 80));
        for (const [k, key] of LINE_KNOBS) {
          const err = 0.5 - ls.find((l) => l.k === k)!.pct / 100;
          if (lineErr[k] !== undefined && Math.sign(err) !== Math.sign(lineErr[k])) lineGain[k] /= 2; // overshot: smaller steps
          lineErr[k] = err;
          TUNE[key] = Math.round(TUNE[key] * Math.exp(lineGain[k] * err) * 10000) / 10000;
        }
        console.log(`pass ${pass}.${it} lines: ${ls.map((l) => `${NAMES[l.k]} ${l.pct}%`).join(", ")} -> ${LINE_KNOBS.map(([, key]) => `${key} ${TUNE[key]}`).join(", ")}`);
      }
    }
    if (PASSES.includes("classes")) {
      // Each class's usual line wins about half its fights against every class's usual line. All factors move
      // at once, from the whole matrix: tuning one class at a time chases its tail (each change moves the rest).
      for (let it = 1; it <= 6; it++) {
        const score = Object.fromEntries(CLASSES.map((c) => [c, 0])) as Record<string, number>;
        CLASSES.forEach((a, i) =>
          CLASSES.slice(i + 1).forEach((b) => {
            const p = rate(fighter(a), fighter(b), N);
            score[a] += p;
            score[b] += 1 - p;
          }),
        );
        // About 1.4 points of win rate per 1% of factor: a half step keeps the noise from making it oscillate.
        for (const c of CLASSES) CLASS_TUNE[c] = Math.round(CLASS_TUNE[c] * (1 + 0.5 * (0.5 - score[c] / (CLASSES.length - 1))) * 1000) / 1000;
        console.log(`pass ${pass}.${it} classes: ${CLASSES.map((c) => `${c} ${Math.round((score[c] / (CLASSES.length - 1)) * 100)}% -> ${CLASS_TUNE[c]}`).join(", ")}`);
      }
      // The overall level is arbitrary (it only sets fight length); what matters is the ratio to the rest.
      // Only a narrow factor is allowed: a class that needs an extreme one has a mechanical problem.
      const mean = Object.values(CLASS_TUNE).reduce((s, x) => s + x, 0) / CLASSES.length;
      for (const c of CLASSES) {
        const rel = CLASS_TUNE[c] / mean;
        if (rel < 0.7 || rel > 1.4) {
          console.log(`STRUCTURAL: ${c} only balances at ×${rel.toFixed(2)} of the average`);
          structural = true;
        }
      }
    }
  }
  if (PASSES.includes("elements")) {
    // An element should give a small edge: 52.5% for a fighter with it vs the same fighter without.
    for (const e of ELEMENTS.filter((x) => x !== "NONE")) {
      const win = () => vs((i) => ({ ...avg, ...kit(i), element: e }), (i) => ({ ...avg, ...kit(i), element: "NONE" }));
      const v = tune((x) => (ELEMENT_TUNE[e] = x), win, 0.525);
      say(`element ${e}`, v, win);
      if (v <= 0.31 && win() > 0.55) console.log(`  !! ${e} is too strong even at 0.3`);
      if (v >= 2.99 && win() < 0.5) console.log(`  !! ${e} is too weak even at 3`);
    }
  }
  console.log(JSON.stringify({ STYLE_TUNE, SPECIAL_TUNE, CLASS_TUNE, ELEMENT_TUNE, SKILL_TUNE, TUNE }));
  process.exit(structural ? 1 : 0);
}

const rows: string[] = [];
const pctOf: Record<string, number> = {};
for (const a of process.env.LINES_ONLY ? [] : CLASSES) {
  const cells: string[] = [];
  for (const b of CLASSES) {
    const before = totalSecs;
    const pct = Math.round(rate(fighter(a), fighter(b), N) * 100);
    pctOf[a + b] = pct;
    cells.push(`${String(pct).padStart(3)}% ${((totalSecs - before) / N).toFixed(0).padStart(2)}s`);
  }
  rows.push(`${a.padEnd(8)} ${cells.join(" | ")}`);
}
// The verdict uses each pair's two cells together (2N matches): one cell alone is ±5.6% at N=80, so with 20
// cells some miss 40-60 by luck even when every matchup is even (the mirror cells show the noise).
const pairs = CLASSES.flatMap((a, i) => CLASSES.slice(i + 1).map((b) => ({ a, b, pct: (pctOf[a + b] + 100 - pctOf[b + a]) / 2 })));
const worst = Math.max(...pairs.map((p) => Math.max(p.pct, 100 - p.pct)));
if (rows.length) {
  console.log(`win rate of row vs column (hard CPU, default kits, ${N} matches each) · avg round length`);
  console.log(`         ${CLASSES.map((c) => c.padEnd(9)).join(" | ")}`);
  console.log(rows.join("\n"));
  const noise = Math.round((50 / Math.sqrt(2 * N)) * 10) / 10;
  console.log(`pairs (${2 * N} matches each, ±${noise}%): ${pairs.map((p) => `${p.a}-${p.b} ${Math.round(p.pct)}%`).join(", ")}`);
  console.log(`${worst > 60 ? "UNFAIR" : "fair"}: every pair within ${Math.round(100 - worst)}-${Math.round(worst)}%`);
}

const LINE_N = Number(process.env.LINES ?? Math.max(N, 120));
const lines = process.env.MATRIX_ONLY ? [] : statLines(LINE_N);
console.log(`
stat line vs all-70 (${LINE_N} kits, 2 matches each): one stat at 100, the other four ~62`);
if (lines.length) console.log(lines.map((l) => `${NAMES[l.k]} ${l.pct}%`).join("  ·  "));
const off = lines.filter((l) => l.pct > 62 || l.pct < 45);
if (lines.length) console.log(off.length ? `OFF TARGET: ${off.map((l) => NAMES[l.k]).join(", ")} (retune with --tune N lines)` : "ok: every stat line within 45-62%");
const unfair = rows.length > 0 && worst > 60;
process.exit(unfair || off.length ? 1 : 0);
