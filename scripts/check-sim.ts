// Self-check for the fight mechanics that the balance numbers can't show are wired up:
// side skills, the skill press queue, limb clash, the low sweep, the ink bubble, air and mix moves.
//   npx tsx scripts/check-sim.ts

import assert from "node:assert/strict";
import { CLASS_ULT, SLOT1_COST, SPECIAL_KINDS, STYLE_INFO, ULT_COST } from "../src/game/moves";
import { createMatch, deriveDef, EMPTY_INPUT, step, TICK_HZ, type FighterStats, type Input, type Match } from "../src/game/sim";
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

// Two special slots. L costs half a meter, S + L the whole one; a lone S + L below a full meter falls back to slot 1.
{
  const x = fight(fighter("Fighter"), fighter("Fighter"));
  x.m.fighters[0].energy = SLOT1_COST - 1;
  x.ia.special++;
  run(x, 1);
  assert.equal(x.m.fighters[0].action, "idle", "slot 1 fired below its cost");
  x.m.fighters[0].energy = SLOT1_COST;
  x.ia.special++;
  run(x, 1);
  const f = x.m.fighters[0];
  assert.ok(f.action === "special" && !f.ult, "L didn't start slot 1");
  assert.ok(f.energy < 1, "slot 1 should cost the 50 it had");
  assert.equal(x.m.freeze, 6, "slot 1 freezes 6 ticks");
  assert.equal(events(x.m, "special").length, 1);
}
{
  const x = fight(fighter("Fighter"), fighter("Fighter"));
  const f = x.m.fighters[0];
  f.energy = ULT_COST - 1;
  x.ia.block = true;
  x.ia.special++;
  run(x, 1);
  assert.ok(f.action === "special" && !f.ult, "S + L below a full meter should fire slot 1");
  const y = fight(fighter("Fighter"), fighter("Fighter"));
  y.m.fighters[0].energy = ULT_COST;
  y.ia.block = true;
  y.ia.special++;
  run(y, 1);
  const g = y.m.fighters[0];
  assert.ok(g.action === "special" && g.ult, "S + L didn't start the ultimate");
  assert.ok(g.energy < 1);
  assert.equal(y.m.freeze, 16, "the ultimate freezes 16 ticks");
  const e = events(y.m, "special")[0];
  assert.ok(e.type === "special" && e.ult && e.kind === CLASS_ULT.Fighter);
}
// The ultimate defaults to the class's, a stored kind overrides it, junk is ignored; slot 1 is never used twice by default.
for (const c of CLASSES) {
  const d = deriveDef(fighter(c));
  assert.equal(d.ult, CLASS_ULT[c]);
  assert.ok(d.ult !== d.special, `${c}: both slots default to ${d.ult}`);
}
assert.equal(deriveDef(fighter("Sword", { ultKind: "orb" })).ult, "orb");
assert.equal(deriveDef(fighter("Sword", { ultKind: "nonsense" })).ult, CLASS_ULT.Sword);
// Every kind runs as slot 1 and as the ultimate without throwing, and ends (nobody stays in the special forever).
for (const kind of SPECIAL_KINDS) {
  for (const ult of [false, true]) {
    const x = fight(fighter("Fighter", { specialKind: kind, ultKind: kind }), fighter("Fighter"), 150);
    x.m.fighters[0].energy = 100;
    x.ia.block = ult;
    x.ia.special++;
    run(x, 1);
    x.ia.block = false;
    run(x, 400);
    assert.notEqual(x.m.fighters[0].action, "special", `${kind} ${ult ? "ult" : "slot 1"} never ended`);
  }
}

// Hit-lock: an ultimate that connects holds the opponent (no input, pinned 60 px in front), keeps hitting, and ends
// with a launch. Slot 1 never locks, a guard stops the lock, and interrupting the attacker lets go.
const ultOn = (kind: string, gap: number, defender: Partial<FighterStats> = {}) => {
  const x = fight(fighter("Fighter", { specialKind: "bolt", ultKind: kind }), fighter("Fighter", defender), gap);
  x.m.fighters[0].energy = 100;
  x.ia.block = true;
  x.ia.special++;
  run(x, 1);
  x.ia.block = false;
  return x;
};
{
  const x = ultOn("slash", 110);
  const [a, b] = x.m.fighters;
  let held = 0, lockedAt = -1;
  for (let i = 0; i < 200 && a.action === "special"; i++) {
    x.ib.attack++; // the victim mashes: nothing may come of it
    x.ib.jump++;
    run(x, 1);
    if (b.locked) {
      held++;
      if (lockedAt < 0) lockedAt = i;
      assert.equal(b.action, "hit", "a held fighter acts");
      assert.ok(Math.abs(b.x - Math.min(930 - 35, Math.max(65, a.x + a.facing * 60))) < 0.5, `held ${Math.round(Math.abs(b.x - a.x))} px away, not 60`);
    }
  }
  assert.ok(lockedAt >= 0 && held >= 30, `slash ult held the opponent for ${held} ticks`);
  assert.ok(!b.locked, "still locked after the ultimate ended");
  assert.ok(b.vy < -8 && b.action === "hit", `no launch at the end (vy ${b.vy})`);
  const hits = x.m.events.filter((e) => e.type === "hit" && e.by === 0).length;
  assert.ok(hits >= 4, `only ${hits} hits recorded (opener + echoes + finale)`);
  assert.ok(b.hp < 200 - 10);
}
for (const kind of ["beam", "barrage", "teleport", "uppercut", "spiral", "meteor", "charge"]) {
  const x = ultOn(kind, kind === "beam" ? 350 : kind === "meteor" || kind === "teleport" ? 200 : 110);
  const b = x.m.fighters[1];
  let was = false;
  for (let i = 0; i < 200 && x.m.fighters[0].action === "special"; i++) {
    run(x, 1);
    was ||= b.locked;
  }
  assert.ok(was, `${kind} ultimate never locked the opponent`);
  assert.ok(!b.locked, `${kind} ultimate never let go`);
}
// A projectile ultimate pulls the attacker back into the move and locks on contact.
for (const kind of ["bolt", "arrow", "orb", "wave"]) {
  const x = ultOn(kind, 300);
  const [a, b] = x.m.fighters;
  let was = false;
  for (let i = 0; i < 400 && !was; i++) {
    run(x, 1);
    was = b.locked;
  }
  assert.ok(was && a.action === "special" && a.ult && a.ultEnd > 0, `${kind} ultimate didn't lock on contact`);
  for (let i = 0; i < 200 && b.locked; i++) run(x, 1);
  assert.ok(!b.locked && b.vy < -8, `${kind} ultimate didn't end with a launch`);
}
{
  const x = fight(fighter("Fighter", { specialKind: "slash" }), fighter("Fighter"), 110); // slot 1 (L), not the ultimate
  x.m.fighters[0].energy = 100;
  x.ia.special++;
  for (let i = 0; i < 40; i++) {
    run(x, 1);
    assert.ok(!x.m.fighters[1].locked, "slot 1 locked the opponent");
  }
}
{
  const x = fight(fighter("Fighter", { ultKind: "slash" }), fighter("Fighter"), 110);
  x.ib.block = true; // a guard stops the grab (the blocked blow still chips)
  x.m.fighters[0].energy = 100;
  x.ia.block = true;
  x.ia.special++;
  run(x, 1);
  x.ia.block = false;
  for (let i = 0; i < 60; i++) {
    run(x, 1);
    assert.ok(!x.m.fighters[1].locked, "a blocked ultimate locked");
  }
}
{
  const x = ultOn("slash", 110);
  const [a, b] = x.m.fighters;
  while (!b.locked) run(x, 1);
  Object.assign(a, { action: "hit", t: 0, stun: 10 }); // the attacker is knocked out of it
  run(x, 10); // (the hit-stop of the blow that locked has to play out first)
  assert.ok(!b.locked && b.vy > -3, "the victim wasn't let go (or was launched anyway)");
}

console.log("check-sim: all good");
