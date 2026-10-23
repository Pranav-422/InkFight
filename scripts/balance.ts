// Fairness check: CPU vs CPU (hard) for every class pairing with default specials and
// styles. Prints win rates and average round length. Flags any matchup over 65%.
//   npx tsx scripts/balance.ts [matches per pairing, default 60]
//   npx tsx scripts/balance.ts --tune   find STYLE_TUNE / SPECIAL_TUNE (src/game/moves.ts)

import { cpuThink, newBrain } from "../src/game/cpu";
import { SPECIAL_KINDS, SPECIAL_TUNE, STYLE_TUNE, STYLES } from "../src/game/moves";
import { createMatch, EMPTY_INPUT, step, TICK_HZ, type FighterStats } from "../src/game/sim";
import { CLASSES, ruleStats } from "../src/lib/stats";

const TUNING = process.argv[2] === "--tune";
const N = TUNING ? 96 : Number(process.argv[2] ?? 60);
const neutral = { size: "medium", pose: "neutral", dominant_colors: [] } as const;
const fighter = (cls: string): FighterStats => ({ ...ruleStats(cls as (typeof CLASSES)[number], { ...neutral, dominant_colors: [] }), class: cls });

function play(a: FighterStats, b: FighterStats) {
  const ia = { ...EMPTY_INPUT }, ib = { ...EMPTY_INPUT };
  const m = createMatch(a, b, [ia, ib]);
  const ba = newBrain("hard"), bb = newBrain("hard");
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
  return { winner: m.matchWinner, seconds: ticks / TICK_HZ / Math.max(1, rounds + 1) };
}

// Same stats, one difference: how often does `a` beat `b`?
function rate(a: FighterStats, b: FighterStats, n: number) {
  let wins = 0;
  for (let i = 0; i < n; i++) wins += (i % 2 ? play(b, a).winner === 1 : play(a, b).winner === 0) ? 1 : 0;
  return wins / n;
}

if (TUNING) {
  const avg = { hp: 200, atk: 70, def: 70, spd: 70, class: "Brawler" };
  // Opponents: every style × special, with the current factors. Tuning against this mix
  // (not one fixed rival) balances melee vs ranged too. Two passes so factors settle.
  const pool: FighterStats[] = STYLES.flatMap((style) => SPECIAL_KINDS.map((specialKind) => ({ ...avg, style, specialKind })));
  const vsPool = (variant: (i: number) => FighterStats) => {
    let wins = 0;
    for (let i = 0; i < N; i++) {
      const opp = pool[(i * 7919) % pool.length];
      wins += (i % 2 ? play(opp, variant(i)).winner === 1 : play(variant(i), opp).winner === 0) ? 1 : 0;
    }
    return wins / N;
  };
  // Bisect a damage factor until the variant wins about half its fights.
  const tune = (set: (v: number) => void, variant: (i: number) => FighterStats) => {
    let lo = 0.3, hi = 3;
    for (let i = 0; i < 7; i++) {
      const mid = (lo + hi) / 2;
      set(mid);
      if (vsPool(variant) > 0.5) hi = mid;
      else lo = mid;
    }
    const v = Math.round(((lo + hi) / 2) * 100) / 100;
    set(v);
    return v;
  };
  for (let pass = 1; pass <= 2; pass++) {
    // A style is judged across all specials, a special across all styles.
    for (const s of STYLES) console.log(`pass ${pass} style ${s}: ${tune((v) => (STYLE_TUNE[s] = v), (i) => ({ ...avg, style: s, specialKind: SPECIAL_KINDS[i % SPECIAL_KINDS.length] }))}`);
    for (const k of SPECIAL_KINDS) console.log(`pass ${pass} special ${k}: ${tune((v) => (SPECIAL_TUNE[k] = v), (i) => ({ ...avg, style: STYLES[i % STYLES.length], specialKind: k }))}`);
  }
  console.log(JSON.stringify({ STYLE_TUNE, SPECIAL_TUNE }));
  process.exit(0);
}

const rows: string[] = [];
let worst = 0;
for (const a of CLASSES) {
  const cells: string[] = [];
  for (const b of CLASSES) {
    let wins = 0, secs = 0;
    for (let i = 0; i < N; i++) {
      // Swap sides every other match so slot 0 has no edge.
      const r = i % 2 ? play(fighter(b), fighter(a)) : play(fighter(a), fighter(b));
      if (r.winner === (i % 2 ? 1 : 0)) wins++;
      secs += r.seconds;
    }
    const pct = Math.round((wins / N) * 100);
    if (a !== b) worst = Math.max(worst, pct);
    cells.push(`${String(pct).padStart(3)}% ${(secs / N).toFixed(0).padStart(2)}s`);
  }
  rows.push(`${a.padEnd(8)} ${cells.join(" | ")}`);
}
console.log(`win rate of row vs column (hard CPU, ${N} matches each) · avg round length`);
console.log(`         ${CLASSES.map((c) => c.padEnd(9)).join(" | ")}`);
console.log(rows.join("\n"));
console.log(worst > 65 ? `UNFAIR: a matchup reaches ${worst}%` : `fair: no matchup above ${worst}%`);
