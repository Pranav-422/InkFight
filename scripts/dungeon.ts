// Dungeon difficulty curve: how often a mid-skill player clears each floor on the first try, against the
// target in docs/research/v2/bosses.json (85% on floor 1 falling to 15% on floor 10). The "mid-skill
// player" is the normal CPU playing each class's usual line in turn, against the boss with its floor's
// budget, cap and AI knobs.
//   npx tsx scripts/dungeon.ts [matches per floor, default 100]
//   npx tsx scripts/dungeon.ts --tune [N]   bisect each floor's stat budget onto the target; prints the budgets
//       to copy into src/game/dungeon.ts (the stat proportions stay the bosses' own)
// Also checks that a boss fight is deterministic (same seed, same result), which a resumed match relies on. The boss
// plays with its passive (and floor 10 with its second form), so re-tune after any change to either.

import assert from "node:assert/strict";
import { cpuThink, newBrain } from "../src/game/cpu";
import { BOSSES, bossFighter, bossKnobs, bossRun } from "../src/game/dungeon";
import { CLASS_ITEM, CLASS_SPECIAL, CLASS_STYLE } from "../src/game/moves";
import { createMatch, deriveDef, EMPTY_INPUT, step, TICK_HZ, type FighterStats } from "../src/game/sim";
import { CLASSES, ruleStats } from "../src/lib/stats";

const TARGET = [0.85, 0.78, 0.7, 0.62, 0.54, 0.46, 0.38, 0.3, 0.22, 0.15];
const TUNING = process.argv[2] === "--tune";
const N = Number((TUNING ? process.argv[3] : process.argv[2]) ?? 100);

let seed = 1;
Math.random = () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

const neutral = { size: "medium", pose: "neutral", dominant_colors: [] } as const;
const player = (cls: string): FighterStats => ({ ...ruleStats(cls, { ...neutral, dominant_colors: [] }), class: cls, item: CLASS_ITEM[cls], style: CLASS_STYLE[cls], specialKind: CLASS_SPECIAL[cls] });

// One match, player on the left: true when the player wins.
function clear(floor: number, cls: string, s: number) {
  seed = s;
  const b = BOSSES[floor - 1];
  const ia = { ...EMPTY_INPUT }, ib = { ...EMPTY_INPUT };
  const run = bossRun(floor);
  const m = createMatch(player(cls), bossFighter(floor), [ia, ib], { boss: run.spec }); // the passive and the second form are part of the boss
  const me = newBrain("normal"), boss = newBrain("hard", b.cpu);
  for (let t = 0; m.phase !== "matchEnd" && t < TICK_HZ * 360; t++) {
    boss.knobs = bossKnobs(run, m.boss?.phase);
    cpuThink(m, 0, me, ia);
    cpuThink(m, 1, boss, ib);
    step(m, [ia, ib]);
  }
  return m.matchWinner === 0;
}

// Bosses keep their budget through deriveDef (players are always clamped to 350).
for (const b of BOSSES) {
  const d = deriveDef(bossFighter(b.floor));
  const { budget, cap, ...plain } = bossFighter(b.floor); // eslint-disable-line @typescript-eslint/no-unused-vars
  const p = deriveDef(plain);
  if (b.budget > 350) assert.ok(d.punch + d.magic + d.speed > p.punch + p.magic + p.speed, `floor ${b.floor}: budget not applied`);
}
assert.equal(clear(1, "Fighter", 42), clear(1, "Fighter", 42), "a boss fight isn't deterministic");

const rateOf = (floor: number) => {
  let wins = 0;
  for (let i = 0; i < N; i++) wins += clear(floor, CLASSES[i % CLASSES.length], 1000 + i * 7919) ? 1 : 0;
  return wins / N;
};

if (TUNING) {
  // More budget, fewer clears: bisect each floor onto its target.
  for (const b of BOSSES) {
    let lo = 200, hi = 560;
    for (let i = 0; i < 8; i++) {
      b.budget = Math.round((lo + hi) / 2);
      if (rateOf(b.floor) > TARGET[b.floor - 1]) lo = b.budget;
      else hi = b.budget;
    }
    b.budget = Math.round((lo + hi) / 2);
    console.log(`floor ${b.floor}: budget ${b.budget}`);
  }
  console.log(`BUDGETS ${JSON.stringify(BOSSES.map((b) => b.budget))}`);
}

console.log(`floor  boss                    clear   target   (${N} matches each, normal CPU as the player, 5 classes)`);
let prev = 1;
let rising = 0;
for (const b of BOSSES) {
  const rate = rateOf(b.floor);
  if (rate > prev + 0.05) rising++;
  prev = rate;
  const t = TARGET[b.floor - 1];
  const mark = Math.abs(rate - t) <= 0.12 ? "" : rate > t ? "  too easy" : "  too hard";
  console.log(`${String(b.floor).padStart(5)}  ${b.title.padEnd(22)}  ${String(Math.round(rate * 100)).padStart(4)}%   ${String(Math.round(t * 100)).padStart(4)}%${mark}`);
}
console.log(rising ? `curve: ${rising} floor(s) easier than the one below` : "curve: falls floor by floor");
