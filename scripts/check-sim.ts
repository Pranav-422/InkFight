// Self-check for the fight mechanics that the balance numbers can't show are wired up:
// side skills, the skill press queue, limb clash, the low sweep, the ink bubble, air and mix moves.
//   npx tsx scripts/check-sim.ts

import assert from "node:assert/strict";
import { CLASS_ULT, SLOT1_COST, SPECIAL_KINDS, STYLE_INFO, ULT_COST } from "../src/game/moves";
import { poseFor } from "../src/game/poses";
import { AVERAGE_BUILD, buildFor, solveStick } from "../src/game/stickman";
import { createMatch, deriveDef, EMPTY_INPUT, resumeMatch, snapshot, step, TICK_HZ, type BossSpec, type FighterStats, type Input, type Match } from "../src/game/sim";
import { CLASSES, clampStats, ruleStats } from "../src/lib/stats";

const neutral = { size: "medium", pose: "neutral", dominant_colors: [] } as const;
const fighter = (cls: string, extra: Partial<FighterStats> = {}): FighterStats => ({ ...ruleStats(cls, { ...neutral, dominant_colors: [] }), class: cls, ...extra });

// A match already in the fight phase, fighters `gap` px apart (centre to centre).
function fight(a: FighterStats, b: FighterStats, gap = 300, boss?: BossSpec): { m: Match; ia: Input; ib: Input } {
  const ia = { ...EMPTY_INPUT }, ib = { ...EMPTY_INPUT };
  const m = createMatch(a, b, [ia, ib], boss ? { boss } : {});
  for (const d of m.defs) d.dodge = 0; // nothing in here is about luck: no slipped hits
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

// Ink Flash: chain finishers (only) crit with 0.03 + 0.003 per IQ point over 60, rolled from the match clock.
{
  // (stats are rebalanced into the shared budget first, so a 100 IQ asked for is what clampStats leaves of it)
  for (const iq of [40, 60, 75, 100]) {
    const asked = fighter("Fighter", { iq });
    assert.ok(Math.abs(deriveDef(asked).crit - (0.03 + Math.max(0, clampStats(asked).iq - 60) * 0.003)) < 1e-9, `crit at IQ ${iq}`);
  }
  assert.equal(deriveDef(fighter("Fighter", { iq: 40 })).crit, 0.03);
  const crits = () => {
    const x = fight(fighter("Fighter", { iq: 100, atk: 70, style: "Boxing" }), fighter("Fighter"), 100);
    const [a, b] = x.m.fighters;
    const seen = new Set<number>();
    const out: number[] = [];
    let finishers = 0;
    for (let i = 0; i < 9000; i++) {
      b.hp = 200;
      b.action = "idle";
      if (a.action === "idle" && a.cooldown === 0 || (a.action === "attack" && a.t > 12)) x.ia.attack++;
      run(x, 1);
      for (const e of x.m.events) {
        if (e.type !== "hit" || e.by !== 0 || seen.has(e.id)) continue;
        seen.add(e.id);
        if (a.combo === 3 && a.move === "uppercutP") finishers++;
        if (e.crit) {
          out.push(e.id);
          assert.ok(a.combo === 3 && a.move === "uppercutP", `crit on ${a.move} (combo ${a.combo}): only a chain finisher may crit`);
          assert.ok(!e.special && !e.blocked);
        }
      }
    }
    assert.ok(finishers > 20, `only ${finishers} finishers landed`);
    return { out, finishers };
  };
  const one = crits(), two = crits();
  assert.ok(one.out.length >= 1, `no Ink Flash in ${one.finishers} finishers`);
  assert.deepEqual(one.out, two.out, "crits aren't deterministic");
}

// Spine recoil: a blow above 70% of body height sets hitHigh (hook = head, jab = body), and the hit pose follows it.
{
  const land = (style: string) => {
    const x = fight(fighter("Fighter", { style }), fighter("Fighter", { agi: 40 }), 100); // (no agility: nothing is slipped)
    x.ia.attack++;
    for (let i = 0; i < 20 && x.m.fighters[1].hp === 200; i++) run(x, 1);
    assert.ok(x.m.fighters[1].hp < 200, `${style}: the first punch didn't land`);
    return x.m.fighters[1].hitHigh;
  };
  assert.equal(land("Street"), true, "a hook to the head should be a high hit");
  assert.equal(land("Boxing"), false, "a jab to the body should be a low hit");
  const x = fight(fighter("Fighter"), fighter("Fighter"));
  const f = snapshot(x.m).fighters[1];
  const at = (hitHigh: boolean) => poseFor({ ...f, action: "hit", t: 4, hitHigh }, "bolt", 0, "Fighter").pose;
  const high = at(true), low = at(false);
  assert.ok("rel" in high.head! && high.head.rel < -0.5 && "rel" in high.torso! && high.torso.rel < 0, "a head hit should snap the head back");
  assert.ok("rel" in low.torso! && low.torso.rel > 0.4 && "rel" in low.head! && low.head.rel > 0, "a body hit should fold the torso forward");
  assert.ok("abs" in low.upperF! && low.upperF.abs > 1 && "abs" in low.upperB! && low.upperB.abs > 1.5, "a body hit should drop the arms");
}

// Body proportions follow DUR and SPD, and an average fighter is drawn exactly as before.
{
  assert.deepEqual(buildFor(70, 70), { shoulder: 0, thick: 1, legs: 1 });
  const bulky = buildFor(100, 40), lean = buildFor(40, 100);
  assert.ok(bulky.shoulder > 8 && bulky.thick > 1.2 && bulky.legs < 1, "high DUR / low SPD should be broad, thick and short-legged");
  assert.ok(lean.shoulder === 0 && lean.thick < 0.9 && lean.legs > 1.05, "low DUR / high SPD should be lean with longer legs");
  const feet = (b: typeof AVERAGE_BUILD) => solveStick({} as never, b).joints.footF.y;
  assert.ok(feet(lean) > feet(AVERAGE_BUILD) && feet(AVERAGE_BUILD) > feet(bulky), "longer legs reach lower (the renderer then lifts the body)");
  assert.equal(solveStick({} as never).joints.footF.y, feet(AVERAGE_BUILD));
}

// Tension: below 30% health it rises by the tick and with every blow taken, and speeds the meter up; above it, nothing.
{
  const x = fight(fighter("Fighter"), fighter("Fighter"), 500);
  const [a, b] = x.m.fighters;
  a.hp = 59;
  b.hp = 150;
  run(x, 120);
  assert.ok(a.tension > 0.45 && a.tension < 0.55, `tension after 2 s below 30%: ${a.tension}`);
  assert.equal(b.tension, 0, "a healthy fighter built tension");
  const energyPerSec = (tension: number) => {
    const y = fight(fighter("Fighter"), fighter("Fighter"), 500);
    const f = y.m.fighters[0];
    f.hp = 200;
    f.tension = tension;
    f.energy = 0;
    run(y, 60);
    return f.energy;
  };
  const ratio = energyPerSec(1) / energyPerSec(0);
  assert.ok(Math.abs(ratio - 1.8) < 0.05, `full tension should earn ${1.8}x the energy, got ${ratio}`);
  const z = fight(fighter("Fighter"), fighter("Fighter", { agi: 40 }), 100);
  z.m.fighters[1].hp = 50;
  const before = z.m.fighters[1].tension;
  z.ia.attack++;
  for (let i = 0; i < 20 && z.m.fighters[1].hp === 50; i++) run(z, 1);
  assert.ok(z.m.fighters[1].hp < 50 && z.m.fighters[1].tension >= before + 0.1, "a blow taken while hurt should add tension");
}

// resumeMatch restores an in-progress fight so the guest's local copy can be handed
// back to a returning host. Verify: HP and phase carry over, and the fight can continue.
{
  const x = fight(fighter("Fighter"), fighter("Mace"), 120);
  run(x, 30 * TICK_HZ); // run a full round's worth
  const s = snapshot(x.m);
  // Simulate the guest taking over (CPU plays host), then hand back to a new host match.
  const resumed = resumeMatch(s, fighter("Fighter"), fighter("Mace"), [{ ...EMPTY_INPUT }, { ...EMPTY_INPUT }]);
  assert.equal(resumed.fighters[0].hp, s.fighters[0].hp, "hp carried over");
  assert.equal(resumed.fighters[1].hp, s.fighters[1].hp, "hp[1] carried over");
  assert.equal(resumed.phase, s.phase, "phase carried over");
  assert.equal(resumed.round, s.round, "round carried over");
  // The resumed match can step without throwing.
  step(resumed, [{ ...EMPTY_INPUT }, { ...EMPTY_INPUT }]);
  assert.ok(true, "resumed match stepped without error");
}


// ---------------------------------------------------------------- dungeon boss passives (createMatch(..., { boss }) only)
const bossOf = (passive: BossSpec["passive"], extra: Partial<BossSpec> = {}): BossSpec => ({ slot: 1, passive, ...extra });
const still = (agi = 40): Partial<FighterStats> => ({ agi }); // no agility: nothing is slipped by luck
const hpLoss = (f: { hp: number }) => 200 - f.hp;

// Nobody but a boss has a passive, and only the seat the dungeon names gets one.
for (const c of CLASSES) assert.equal(deriveDef(fighter(c)).passive, undefined, `${c}: a player kit has a passive`);
{
  const x = fight(fighter("Fighter"), fighter("Fighter"), 300, bossOf("afterimage"));
  assert.equal(x.m.defs[0].passive, undefined);
  assert.equal(x.m.defs[1].passive, "afterimage");
  assert.equal(fight(fighter("Fighter"), fighter("Fighter")).m.defs[1].passive, undefined, "a passive without a boss spec");
}

// Afterimage: the first hit on it while it walks just misses (once per 360 ticks); afterwards hits land.
{
  const x = fight(fighter("Fighter"), fighter("Fighter", still()), 100, bossOf("afterimage"));
  const [a, b] = x.m.fighters;
  x.ib.left = true; // walking, so its afterimage is up
  run(x, 2);
  x.ia.attack++;
  run(x, 12);
  assert.equal(b.hp, 200, "the walking boss was hit");
  assert.notEqual(b.action, "hit", "an afterimage hit left hit-stun");
  assert.ok(b.pv.cd > 300, "afterimage didn't spend its charge");
  x.ib.left = false;
  run(x, 30);
  x.ia.attack++;
  run(x, 12);
  assert.ok(hpLoss(b) > 0, "the boss never got hit again");
  void a;
}

// Heat Stacks: three clean normal hits, then the next sets you on fire; a blocked hit resets the heat.
{
  const x = fight(fighter("Fighter", still()), fighter("Fighter", { style: "Karate" }), 100, bossOf("heat-stacks"));
  const [a, b] = x.m.fighters;
  let peak = 0;
  for (let i = 0; i < 900 && a.status?.kind !== "FIRE"; i++) {
    a.hp = 200;
    if (b.action === "idle" && b.cooldown === 0) x.ib.attack++;
    run(x, 1);
    peak = Math.max(peak, b.pv.heat ?? 0);
    if (a.status?.kind === "FIRE") break;
  }
  assert.equal(a.status?.kind, "FIRE", "three clean hits never lit the fourth");
  assert.equal(peak, 3);
  assert.equal(b.pv.heat, 0, "heat should reset on the burning hit");
  const y = fight(fighter("Fighter", still()), fighter("Fighter", { style: "Karate" }), 100, bossOf("heat-stacks"));
  y.m.fighters[1].pv.heat = 2;
  y.ia.block = true;
  y.ib.attack++;
  run(y, 12);
  assert.equal(y.m.fighters[1].pv.heat, 0, "a blocked hit should put the heat out");
}

// Sheathed Draw: still for 20 ticks, then the next opener dashes, hits half again as hard and leaves 12 more ticks of recovery.
{
  const opener = (wait: number) => {
    const x = fight(fighter("Fighter", still()), fighter("Sword", { agi: 70 }), 120, bossOf("sheathed-draw"));
    const b = x.m.fighters[1];
    b.pv.still = 0; // (the intro already left it standing for a while)
    run(x, wait);
    x.ib.attack++;
    let peakV = 0;
    for (let i = 0; i < 14 && x.m.fighters[0].hp === 200; i++) {
      run(x, 1);
      peakV = Math.max(peakV, Math.abs(b.vx));
    }
    const dmg = hpLoss(x.m.fighters[0]);
    while (b.action === "attack") run(x, 1);
    return { draw: b.draw, dmg, peakV, cd: b.cooldown };
  };
  const quick = opener(2), drawn = opener(30);
  assert.ok(drawn.dmg > 0 && quick.dmg > 0, "the openers didn't land");
  assert.ok(drawn.dmg / quick.dmg > 1.3 && drawn.dmg / quick.dmg < 1.7, `draw-cut damage ${drawn.dmg} vs ${quick.dmg}, expected ~1.5x`);
  assert.ok(drawn.peakV > quick.peakV * 2, "the draw-cut should dash");
  assert.equal(drawn.cd - quick.cd, 12, "a draw-cut leaves 12 extra recovery ticks");
}

// Whiteout Guard: the third blocked hit bursts the guard: the attacker is shoved back and frozen.
{
  const x = fight(fighter("Fighter", still()), fighter("Tank"), 100, bossOf("whiteout-guard"));
  const [a, b] = x.m.fighters;
  x.ib.block = true;
  let burst = false;
  for (let i = 0; i < 400 && !burst; i++) {
    if (a.action === "idle" && a.cooldown === 0) x.ia.attack++;
    run(x, 1);
    if (a.status?.kind === "FROST") burst = true;
  }
  assert.ok(burst, "three blocked hits never burst the guard");
  assert.equal(b.pv.cracks, 0, "the cracks should reset after the burst");
  assert.ok(a.vx < -5 && a.action === "hit", "the attacker wasn't shoved back");
  assert.ok(a.status!.t <= 60, "frost should last only 60 ticks");
}

// Royal Pride: below 40% health the meter fills twice as fast and every blast comes in a pair.
{
  const energy = (hp: number) => {
    const x = fight(fighter("Fighter"), fighter("Attacker"), 500, bossOf("royal-pride"));
    const b = x.m.fighters[1];
    b.hp = hp;
    b.energy = 0;
    b.tension = 0;
    run(x, 60);
    return b.energy;
  };
  assert.ok(Math.abs(energy(70) / energy(200) - 2) < 0.15 || energy(70) > energy(200) * 1.7, "pride should double the meter below 40%");
  const blasts = (hp: number) => {
    const x = fight(fighter("Fighter"), fighter("Attacker"), 500, bossOf("royal-pride"));
    x.m.fighters[1].hp = hp;
    x.ib.attack++;
    run(x, 9);
    return x.m.projectiles.filter((p) => p.owner === 1 && p.kind === "blast");
  };
  assert.equal(blasts(200).length, 1);
  const pair = blasts(70);
  assert.equal(pair.length, 2, "no second blast");
  assert.ok(pair.some((p) => (p.delay ?? 0) > 0), "the second blast should be delayed");
}

// Endless Dance: when the last move of a chain lands clean, the chain starts again with no rest (twice at most); a blocked blow stalls it.
{
  const dance = (blockIt: boolean) => {
    const x = fight(fighter("Fighter", still()), fighter("Fighter", { style: "Karate" }), 100, bossOf("endless-dance"));
    const [a, b] = x.m.fighters;
    x.ia.block = blockIt;
    let restarts = 0, lastCd = -1;
    for (let i = 0; i < 400; i++) {
      a.hp = 200;
      // press only until the chain's last move has begun: any further swing is the passive's
      const chain = STYLE_INFO.Karate.punch;
      if ((b.action === "idle" && b.cooldown === 0 && !b.pv.restarts) || (b.action === "attack" && b.combo < chain.length - 1 && b.t > 6)) x.ib.attack++;
      run(x, 1);
      restarts = Math.max(restarts, b.pv.restarts ?? 0);
      if (b.action === "idle" && b.comboT === 0 && b.cooldown > 0) lastCd = Math.max(lastCd, b.cooldown);
    }
    return { restarts, lastCd };
  };
  const clean = dance(false), blocked = dance(true);
  assert.equal(clean.restarts, 2, `clean hits should restart the chain twice, got ${clean.restarts}`);
  assert.ok(blocked.restarts < 2, "a blocked dance kept restarting");
}

// Pencil Case: every 480 ticks it swaps weapon (mace > sword > shield > mace); the 50-tick swap can't attack and takes x1.25.
{
  const x = fight(fighter("Fighter", still()), fighter("Mace", { agi: 40 }), 120, bossOf("pencil-case"));
  const b = x.m.fighters[1];
  b.pv.timer = 0;
  const seen: number[] = [];
  let swapDmg = 0, normalDmg = 0, swapAttacked = false;
  for (let i = 0; i < 480 * 3 + 300; i++) {
    x.m.fighters[0].hp = 200;
    b.hp = 200;
    if (b.pv.swap === 10 && x.m.fighters[0].action === "idle") x.ia.attack++; // hit it mid-swap
    if ((b.pv.swap ?? 0) > 0) {
      x.ib.attack++;
      run(x, 1);
      swapAttacked ||= b.action === "attack";
      if (hpLoss(b) > 0) swapDmg = hpLoss(b);
    } else run(x, 1);
    if (seen.at(-1) !== (b.pv.weapon ?? 0)) seen.push(b.pv.weapon ?? 0);
  }
  assert.deepEqual(seen, [0, 1, 2, 0], `weapon cycle ${seen}`);
  assert.ok(!swapAttacked, "it attacked mid-swap");
  // The same blow outside a swap, for comparison.
  const y = fight(fighter("Fighter", still()), fighter("Mace", { agi: 40 }), 100, bossOf("pencil-case"));
  y.ia.attack++;
  for (let i = 0; i < 14 && y.m.fighters[1].hp === 200; i++) run(y, 1);
  normalDmg = hpLoss(y.m.fighters[1]);
  assert.ok(swapDmg > normalDmg * 1.15, `a swap should take x1.25 (${swapDmg} vs ${normalDmg})`);
}

// Unbending Spine: a normal hit during its wind-up neither interrupts it nor does full damage; a launcher still interrupts.
{
  const hitWindup = (style: string) => {
    const x = fight(fighter("Fighter", { style: "Boxing" }), fighter("Fighter", { agi: 40, style }), 90, bossOf("unbending-spine"));
    const [a, b] = x.m.fighters;
    x.ib.kick++; // a slow kick: long startup
    run(x, 2);
    x.ia.attack++;
    for (let i = 0; i < 12 && b.hp === 200; i++) run(x, 1);
    return { loss: hpLoss(b), action: b.action, a, b };
  };
  const spine = hitWindup("Taekwondo");
  assert.ok(spine.loss > 0, "the wind-up wasn't hit");
  assert.equal(spine.action, "kick", "a normal hit interrupted the wind-up");
  const plain = fight(fighter("Fighter", { style: "Boxing" }), fighter("Fighter", { agi: 40, style: "Taekwondo" }), 90);
  plain.ib.kick++;
  run(plain, 2);
  plain.ia.attack++;
  for (let i = 0; i < 12 && plain.m.fighters[1].hp === 200; i++) run(plain, 1);
  assert.equal(plain.m.fighters[1].action, "hit", "control: a normal fighter should be interrupted");
  assert.ok(spine.loss < hpLoss(plain.m.fighters[1]), "the spine should take less damage");
}

// Infinite Margin: projectiles barely hurt it (x0.6 for specials) unless it is reeling or mid-special; crowding it makes it blink away, and a hit in the shimmer cancels that.
{
  const bolt = (boss: boolean) => {
    const x = fight(fighter("Attacker", { specialKind: "bolt" }), fighter("Attacker", { agi: 40 }), 300, boss ? bossOf("infinite-margin") : undefined);
    x.m.fighters[0].energy = 50;
    x.ia.special++;
    for (let i = 0; i < 80 && x.m.fighters[1].hp === 200; i++) run(x, 1);
    return hpLoss(x.m.fighters[1]);
  };
  const ratio = bolt(true) / bolt(false);
  assert.ok(ratio > 0.5 && ratio < 0.7, `projectile specials should do x0.6, got x${ratio.toFixed(2)}`);
  const x = fight(fighter("Fighter", still()), fighter("Attacker", still()), 100, bossOf("infinite-margin"));
  const b = x.m.fighters[1];
  b.pv.near = 0;
  b.pv.cd = 0;
  for (let i = 0; i < 89; i++) run(x, 1);
  assert.equal(b.pv.shimmer ?? 0, 0, "it blinked before 90 ticks of crowding");
  run(x, 3);
  assert.ok(b.pv.shimmer > 0, "crowding for 90 ticks should start the shimmer");
  const near = Math.abs(b.x - x.m.fighters[0].x);
  run(x, 20);
  assert.ok(Math.abs(b.x - x.m.fighters[0].x) > 450 && near < 120, "it should have blinked far away");
  assert.ok(b.pv.cd > 250, "the blink has a cooldown");
  // Cancel: a clean hit during the shimmer.
  const y = fight(fighter("Fighter", still()), fighter("Attacker", still()), 100, bossOf("infinite-margin"));
  y.m.fighters[1].pv.shimmer = 18;
  y.m.fighters[1].pv.near = 95;
  y.ia.attack++;
  for (let i = 0; i < 12 && y.m.fighters[1].hp === 200; i++) run(y, 1);
  assert.ok(y.m.fighters[1].hp < 200 && !y.m.fighters[1].pv.shimmer && y.m.fighters[1].pv.near < 5, "a hit should cancel the blink and restart the count");
}

// Curse Marks: each unblocked hit marks the player; one mark fades per 120 ticks; five detonate (16 flat damage + poison).
{
  const x = fight(fighter("Fighter", still()), fighter("Fighter"), 100, bossOf("curse-marks"));
  const [a, b] = x.m.fighters;
  a.marks = 4;
  const hp = a.hp;
  x.ib.attack++;
  for (let i = 0; i < 14 && a.hp === hp; i++) run(x, 1);
  assert.equal(a.marks, 0, "five marks should detonate");
  assert.ok(hp - a.hp >= 16 + 1, `the detonation should add 16 damage (lost ${hp - a.hp})`);
  assert.equal(a.status?.kind, "POISON");
  assert.equal(b.marks, 0);
  const y = fight(fighter("Fighter", still()), fighter("Fighter"), 500, bossOf("curse-marks"));
  y.m.fighters[0].marks = 3;
  y.m.fighters[0].markT = 0;
  run(y, 125);
  assert.equal(y.m.fighters[0].marks, 2, "a mark should fade after 120 ticks");
}

// Phase 2 (floor 10): the blow that would take it under half health leaves it exactly there, then it changes form.
const p2 = (): BossSpec => bossOf("curse-marks", { phase2: { stats: { ...fighter("Sword", { atk: 112, def: 80, spd: 102, agi: 80, iq: 111, specialKind: "slash", element: "BLEED" }), budget: 485, cap: 115 }, passive: "red-margin-lines", cls: "Sword", item: "sword" } });
{
  const x = fight(fighter("Fighter", { atk: 100 }), fighter("Fighter", { agi: 40 }), 100, p2());
  const [a, b] = x.m.fighters;
  b.hp = 104;
  a.marks = 0;
  b.status = { kind: "FIRE", t: 100, n: 0 };
  x.m.fighters[0].marks = 3;
  x.ia.attack++;
  for (let i = 0; i < 14 && x.m.boss!.phase === 1; i++) run(x, 1);
  assert.equal(x.m.boss!.phase, 2, "the Regent never changed form");
  assert.equal(b.hp, 100, "the triggering hit must leave exactly half health");
  assert.equal(x.m.defs[1].special, "slash");
  assert.equal(x.m.defs[1].passive, "red-margin-lines");
  assert.equal(b.status, null);
  assert.ok(Math.abs(b.energy - 50) < 1, "phase 2 starts at half a meter");
  assert.equal(a.marks, 0, "phase 2 clears the curse marks");
  assert.ok(Math.abs(a.x - b.x) >= 299, `they should be pushed 300 px apart (${Math.abs(a.x - b.x)})`);
  assert.equal(x.m.freeze, 40, "phase 2 holds the fight still for 40 ticks");
  const ev = x.m.events.filter((e) => e.type === "phase");
  assert.equal(ev.length, 1);
  // A big combo can't skip it: a huge blow from a higher HP still stops at exactly 100.
  const y = fight(fighter("Fighter", { atk: 100 }), fighter("Fighter", { agi: 40 }), 100, p2());
  y.m.fighters[1].hp = 125;
  y.ia.attack++;
  for (let i = 0; i < 14 && y.m.boss!.phase === 1; i++) run(y, 1);
  assert.ok(y.m.fighters[1].hp >= 100, "a blow skipped past phase 2");
  // Ruled lines: every 240 ticks a line is drawn at the player and cuts 45 ticks later (12 damage); walking off avoids it.
  const z = fight(fighter("Fighter", still()), fighter("Fighter"), 500, p2());
  z.m.boss!.phase = 2;
  z.m.defs[1] = { ...z.m.defs[1], passive: "red-margin-lines", element: "BLEED" };
  z.m.phaseT = 239;
  run(z, 2);
  assert.equal(z.m.hazards.length, 1, "no ruled line was drawn");
  const line = z.m.hazards[0];
  assert.ok(Math.abs(line.x - z.m.fighters[0].x) < 1 && line.w === 40);
  const hp = z.m.fighters[0].hp;
  run(z, 47);
  assert.ok(hp - z.m.fighters[0].hp >= 10, "standing on the line should cost ~12");
  assert.equal(z.m.fighters[0].status?.kind, "BLEED");
  const w = fight(fighter("Fighter", still()), fighter("Fighter"), 500, p2());
  w.m.defs[1] = { ...w.m.defs[1], passive: "red-margin-lines" };
  w.m.phaseT = 239;
  run(w, 2);
  w.ia.right = true;
  run(w, 47);
  assert.equal(w.m.fighters[0].hp, 200, "walking off the line should avoid it");
  // The next round starts in the first form again.
  const r = fight(fighter("Fighter", { atk: 100 }), fighter("Fighter", { agi: 40 }), 100, p2());
  r.m.fighters[1].hp = 104;
  r.ia.attack++;
  for (let i = 0; i < 14 && r.m.boss!.phase === 1; i++) run(r, 1);
  r.m.fighters[1].hp = 1;
  r.m.defs[1].dodge = 0; // (the second form has its own agility)
  run(r, 45); // the form change holds the fight still for 40 ticks
  r.m.fighters[0].x = r.m.fighters[1].x - 90;
  r.ia.attack++;
  run(r, 20);
  run(r, 20 * TICK_HZ); // through the KO and the round end
  assert.equal(r.m.boss!.phase, 1, "a new round should start in the first form");
  assert.equal(r.m.defs[1].special, deriveDef(fighter("Fighter", { agi: 40 })).special);
}

// ---------------------------------------------------------------- the five unlockable kinds
{
  const cast = (kind: string, gap: number, opts: { ult?: boolean; defender?: Partial<FighterStats>; attacker?: Partial<FighterStats> } = {}) => {
    const x = fight(fighter("Fighter", { specialKind: kind, ultKind: kind, ...opts.attacker }), fighter("Fighter", { agi: 40, ...opts.defender }), gap);
    x.m.fighters[0].energy = 100;
    x.ia.block = !!opts.ult;
    x.ia.special++;
    run(x, 1);
    x.ia.block = false;
    return x;
  };
  const until = (x: ReturnType<typeof cast>, ticks: number, stop: () => boolean) => {
    for (let i = 0; i < ticks && !stop(); i++) run(x, 1);
  };

  // shatter: a grab. A guard doesn't stop it; someone in the air isn't found.
  {
    const guarded = cast("shatter", 100);
    guarded.ib.block = true;
    until(guarded, 40, () => guarded.m.fighters[1].hp < 200);
    assert.ok(guarded.m.fighters[1].hp < 200, "a guard stopped shatter");
    assert.ok(events(guarded.m, "hit").every((e) => e.type === "hit" && !e.blocked), "shatter was blocked");
    const airborne = cast("shatter", 100);
    airborne.m.fighters[1].y -= 120;
    airborne.m.fighters[1].vy = -4;
    airborne.m.fighters[1].grounded = false;
    run(airborne, 14); // (the startup is 12 ticks)
    for (let i = 0; i < 4; i++) {
      airborne.m.fighters[1].y = 480 - 120;
      airborne.m.fighters[1].vy = 0;
      airborne.m.fighters[1].grounded = false;
      run(airborne, 1);
    }
    assert.equal(airborne.m.fighters[1].hp, 200, "shatter found someone in the air");
  }

  // counter: a melee hit in the first 24 ticks does nothing and is answered for ~1.5x; a projectile goes through; a whiff recovers for 30 ticks.
  {
    const x = cast("counter", 100);
    const [a, b] = x.m.fighters;
    x.ib.attack++;
    until(x, 30, () => b.hp < 200 || a.hp < 200);
    assert.equal(a.hp, 200, "the countered hit did damage");
    assert.ok(b.hp < 200, "the counter never struck back");
    assert.ok(events(x.m, "hit").some((e) => e.type === "hit" && e.dmg === 0), "no absorbed-hit event");
    const y = cast("counter", 400, { defender: { specialKind: "bolt" } });
    y.m.fighters[1].energy = 50;
    y.ib.special++;
    until(y, 60, () => y.m.fighters[0].hp < 200);
    assert.ok(y.m.fighters[0].hp < 200, "a projectile should go through the counter stance");
    const z = cast("counter", 500);
    run(z, 50); // (the 6-tick hit-stop at the start doesn't count: the move is 54 ticks long)
    assert.equal(z.m.fighters[0].action, "special", "whiffed counter recovered too soon");
    until(z, 20, () => z.m.fighters[0].action === "idle");
    assert.equal(z.m.fighters[0].action, "idle", "a whiffed counter should end after 54 ticks");
    // As the ultimate, the strike-back locks.
    const u = cast("counter", 100, { ult: true });
    u.ib.attack++;
    let locked = false;
    for (let i = 0; i < 30 && !locked; i++) {
      run(u, 1);
      locked = u.m.fighters[1].locked;
    }
    assert.ok(locked, "a counter ultimate's answer should lock");
  }

  // dash_slash: through the opponent, one hit, and out the other side facing them.
  {
    const x = cast("dash_slash", 140);
    const [a, b] = x.m.fighters;
    const startX = a.x, side = Math.sign(b.x - a.x);
    until(x, 50, () => a.action !== "special");
    assert.ok(b.hp < 200, "dash_slash missed a standing opponent");
    assert.equal(events(x.m, "hit").filter((e) => e.type === "hit" && e.by === 0).length, 1, "dash_slash should hit once");
    assert.ok(Math.sign(a.x - b.x) === side && Math.abs(a.x - b.x) > 40, `it should end behind them (${startX} > ${a.x}, them ${b.x})`);
    assert.equal(a.facing, -side === 1 ? 1 : -1 === -side ? a.facing : a.facing); // (turned round: checked below)
    assert.equal(a.facing, a.x < b.x ? 1 : -1, "it should turn to face them after the pass");
    assert.ok(Math.abs(a.x - startX) > 150, "it should dash about 220 px");
  }

  // pull: a slow hook of 300 px that drags the target to 80 px in front and steals 25 energy; a guard stops the drag.
  {
    const x = cast("pull", 280);
    const [a, b] = x.m.fighters;
    b.energy = 60;
    a.energy -= 0;
    until(x, 80, () => b.hp < 200);
    assert.ok(b.hp < 200, "the hook never landed");
    assert.ok(Math.abs(b.x - (a.x + a.facing * 80)) < 2, `dragged to ${Math.abs(b.x - a.x)} px, expected 80`);
    assert.ok(a.energy > 70 && a.energy < 85 && b.energy < 55, `energy not stolen: attacker ${a.energy}, target ${b.energy}`); // (slot 1 spent 50 of 100, the hook took 25 back)
    const far = cast("pull", 420);
    run(far, 80);
    assert.equal(far.m.fighters[1].hp, 200, "the hook flew past its 300 px range");
    const guard = cast("pull", 280);
    guard.ib.block = true;
    const gx = guard.m.fighters[1].x;
    run(guard, 60);
    assert.ok(Math.abs(guard.m.fighters[1].x - gx) < 40, "a blocked hook still dragged the target");
  }

  // remote_detonation: marks where they stand; 40 ticks later a 40 px cut falls there. Moving away dodges it, a guard blocks it.
  {
    const x = cast("remote_detonation", 300);
    until(x, 30, () => x.m.hazards.length > 0);
    assert.equal(x.m.hazards.length, 1, "no mark was placed");
    const mark = x.m.hazards[0];
    assert.ok(Math.abs(mark.x - x.m.fighters[1].x) < 2 && mark.w === 40 && mark.kind === "cut");
    until(x, 60, () => x.m.fighters[1].hp < 200);
    assert.ok(x.m.fighters[1].hp < 200, "the cut never landed on someone standing still");
    const dodge = cast("remote_detonation", 300);
    until(dodge, 30, () => dodge.m.hazards.length > 0);
    dodge.m.fighters[1].x += 150;
    run(dodge, 60);
    assert.equal(dodge.m.fighters[1].hp, 200, "moving away should dodge the cut");
    const blocked = cast("remote_detonation", 300);
    blocked.ib.block = true;
    until(blocked, 30, () => blocked.m.hazards.length > 0);
    run(blocked, 60);
    const e = events(blocked.m, "hit").find((h) => h.type === "hit");
    assert.ok(e && e.type === "hit" && e.blocked, "a guard should block the cut");
  }

  // Each of them as an ultimate locks on contact and lets go with a launch.
  for (const [kind, gap] of [["shatter", 100], ["dash_slash", 140], ["pull", 280], ["remote_detonation", 300]] as const) {
    const x = cast(kind, gap, { ult: true });
    const b = x.m.fighters[1];
    let was = false;
    for (let i = 0; i < 400 && !(was && !b.locked); i++) {
      run(x, 1);
      was ||= b.locked;
    }
    assert.ok(was, `${kind} ultimate never locked`);
    assert.ok(!b.locked, `${kind} ultimate never let go`);
  }
}

console.log("check-sim: all good");
