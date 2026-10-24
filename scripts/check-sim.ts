// Self-check for the fight mechanics that the balance numbers can't show are wired up:
// side skills, the skill press queue, limb clash, the low sweep, the ink bubble, air and mix moves.
//   npx tsx scripts/check-sim.ts

import assert from "node:assert/strict";
import { STYLE_INFO } from "../src/game/moves";
import { createMatch, EMPTY_INPUT, step, TICK_HZ, type FighterStats, type Input, type Match } from "../src/game/sim";
import { CLASSES, ruleStats } from "../src/lib/stats";

const neutral = { size: "medium", pose: "neutral", dominant_colors: [] } as const;
const fighter = (cls: string, extra: Partial<FighterStats> = {}): FighterStats => ({ ...ruleStats(cls, { ...neutral, dominant_colors: [] }), class: cls, ...extra });

// A match already in the fight phase, fighters `gap` px apart (centre to centre).
function fight(a: FighterStats, b: FighterStats, gap = 300): { m: Match; ia: Input; ib: Input } {
  const ia = { ...EMPTY_INPUT }, ib = { ...EMPTY_INPUT };
  const m = createMatch(a, b, [ia, ib]);
  for (let i = 0; i < 3 * TICK_HZ; i++) step(m, [ia, ib]);
  assert.equal(m.phase, "fight");
  m.fighters[0].x = 480 - gap / 2;
  m.fighters[1].x = 480 + gap / 2;
  return { m, ia, ib };
}
const run = (x: { m: Match; ia: Input; ib: Input }, ticks: number) => {
  for (let i = 0; i < ticks; i++) step(x.m, [x.ia, x.ib]);
};
const events = (m: Match, type: string) => m.events.filter((e) => e.type === type);

// Every class's skill fires on a press.
for (const c of CLASSES) {
  const x = fight(fighter(c), fighter("Fighter"));
  x.ia.skill++;
  run(x, 1);
  const f = x.m.fighters[0];
  assert.ok(f.skillT > 0 && f.skillCd > 0, `${c} skill didn't fire`);
  assert.equal(events(x.m, "skill").length, 1);
}

// A press while reeling isn't lost: it fires when the hit-stun ends.
{
  const x = fight(fighter("Sword"), fighter("Fighter"));
  Object.assign(x.m.fighters[0], { action: "hit", t: 0, stun: 12 });
  x.ia.skill++;
  run(x, 1);
  assert.equal(x.m.fighters[0].skillT, 0, "fired during hit-stun");
  run(x, 14);
  assert.ok(x.m.fighters[0].skillT > 0, "queued skill never fired");
}

// Two jabs thrown on the same tick within reach of each other clash: nobody is hurt.
{
  const x = fight(fighter("Fighter"), fighter("Fighter"), 100);
  x.ia.attack++;
  x.ib.attack++;
  run(x, 12);
  assert.equal(events(x.m, "clash").length, 1, "no clash");
  assert.equal(x.m.fighters[0].hp, 200);
  assert.equal(x.m.fighters[1].hp, 200);
}

// Down+K sweeps under a standing guard.
{
  const x = fight(fighter("Fighter"), fighter("Fighter"), 120);
  x.ib.block = true;
  run(x, 1);
  x.ia.block = true;
  x.ia.kick++;
  run(x, 1);
  assert.equal(x.m.fighters[0].move, "sweep");
  run(x, 20);
  const hit = events(x.m, "hit")[0];
  assert.ok(hit && hit.type === "hit" && !hit.blocked, "the sweep was blocked");
}

// An ink bubble soaks a hit and stays up; a mace's hit pops it.
for (const [att, stays] of [["Fighter", true], ["Mace", false]] as const) {
  const x = fight(fighter(att), fighter("Attacker"), 110);
  x.ib.skill++;
  run(x, 1);
  x.ia.attack++;
  run(x, 20);
  assert.equal(x.m.fighters[1].hp, 200, `${att}'s hit got through the bubble`);
  assert.equal(x.m.fighters[1].bubble > 0, stays, `${att} vs bubble`);
}

// J or K in the air is an air move.
{
  const x = fight(fighter("Fighter"), fighter("Fighter"));
  x.ia.jump++;
  run(x, 4);
  x.ia.kick++;
  run(x, 1);
  assert.equal(x.m.fighters[0].move, "flyingKick");
}

// Punch, punch, then kick plays the style's mix finisher.
{
  const x = fight(fighter("Fighter", { style: "Boxing" }), fighter("Fighter"), 500); // out of reach: nothing interrupts
  for (const k of ["attack", "attack", "kick"] as const) {
    while (x.m.fighters[0].action !== "idle" || x.m.fighters[0].cooldown > 0) run(x, 1); // inside the combo window
    x.ia[k]++;
    run(x, 1);
  }
  assert.equal(x.m.fighters[0].move, STYLE_INFO.Boxing.mix, "no mix finisher");
  assert.ok(x.m.fighters[0].mix);
}

console.log("check-sim: all good");
