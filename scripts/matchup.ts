// Why does one class beat another? Damage breakdown for one pairing (hard CPU, default kits, 40 matches):
// normal vs special damage (ultDmg: the part from ultimates), how much of it was blocked, dodges, slot-1 specials and
// ultimates used and time spent guarding.
//   npx tsx scripts/matchup.ts Fighter Tank
// Use it when scripts/balance.ts shows a lopsided pair: a factor can't fix a broken mechanic.

import { cpuThink, newBrain } from "../src/game/cpu";
import { CLASS_ITEM, CLASS_SPECIAL, CLASS_STYLE } from "../src/game/moves";
import { createMatch, EMPTY_INPUT, step, TICK_HZ, type FighterStats } from "../src/game/sim";
import { ruleStats } from "../src/lib/stats";

let seed = 7;
Math.random = () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const neutral = { size: "medium", pose: "neutral", dominant_colors: [] } as const;
const fighter = (cls: string): FighterStats => ({ ...ruleStats(cls, { ...neutral, dominant_colors: [] }), class: cls, item: CLASS_ITEM[cls], style: CLASS_STYLE[cls], specialKind: CLASS_SPECIAL[cls] });

const [A, B] = [process.argv[2] ?? "Fighter", process.argv[3] ?? "Tank"];
const st = [0, 1].map(() => ({ wins: 0, normal: 0, normalBlocked: 0, hits: 0, hitsBlocked: 0, special: 0, specialBlocked: 0, specialHits: 0, specialsUsed: 0, ultsUsed: 0, ultDmg: 0, dodged: 0, guardSecs: 0 }));
for (let g = 0; g < 40; g++) {
  const ia = { ...EMPTY_INPUT }, ib = { ...EMPTY_INPUT };
  const m = createMatch(fighter(A), fighter(B), [ia, ib]);
  const brains = [newBrain("hard"), newBrain("hard")];
  let last = -1, ticks = 0;
  while (m.phase !== "matchEnd" && ticks++ < TICK_HZ * 360) {
    cpuThink(m, 0, brains[0], ia);
    cpuThink(m, 1, brains[1], ib);
    step(m, [ia, ib]);
    for (const i of [0, 1]) if (m.fighters[i].blocking) st[i].guardSecs += 1 / TICK_HZ;
    for (const e of m.events) {
      if (e.id <= last) continue;
      last = e.id;
      if (e.type === "hit") {
        const s = st[e.by];
        if (e.ult) s.ultDmg += e.dmg;
        if (e.special) {
          s.special += e.dmg;
          s.specialHits++;
          if (e.blocked) s.specialBlocked += e.dmg;
        } else {
          s.normal += e.dmg;
          s.hits++;
          if (e.blocked) {
            s.normalBlocked += e.dmg;
            s.hitsBlocked++;
          }
        }
      }
      if (e.type === "dodge") st[1 - e.by].dodged++; // the attacker's hit that was slipped
      if (e.type === "special") st[e.by][e.ult ? "ultsUsed" : "specialsUsed"]++;
    }
  }
  if (m.matchWinner !== null) st[m.matchWinner].wins++;
}
console.log(`${A} vs ${B}, 40 matches (damage dealt by each side)`);
st.forEach((s, i) => console.log((i ? B : A).padEnd(8), JSON.stringify({ ...s, guardSecs: Math.round(s.guardSecs) })));
