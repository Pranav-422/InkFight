// Self-check for the fight mechanics that the balance numbers can't show are wired up:
// side skills, the skill press queue, limb clash, the low sweep, the ink bubble, air and mix moves.
//   npx tsx scripts/check-sim.ts

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { heatAt } from "../src/game/arenaRender";
import { ARENA_STORY_IDS, ARENA_STORY_LENGTH, ARENA_TUNE, arenaBoost, arenaTick, arenaWorld, buffScale, CONSTELLATIONS, lavaY, platformsAt, ringBounds, ringUp, ROCK_DEFS, sceneAt, STAIRS_UP_TICK } from "../src/game/arena";
import { CLASS_ULT, SLOT1_COST, SPECIAL_KINDS, STYLE_INFO, ULT_COST } from "../src/game/moves";
import { poseFor } from "../src/game/poses";
import { AVERAGE_BUILD, buildFor, solveStick } from "../src/game/stickman";
import { ARENA, createMatch, deriveDef, EMPTY_INPUT, resumeMatch, snapshot, step, TICK_HZ, type BossSpec, type FighterStats, type Input, type Match } from "../src/game/sim";
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
  // ...and the marks keep counting in the second form.
  x.m.fighters[1].hp = 100;
  run(x, 45);
  x.m.fighters[0].x = x.m.fighters[1].x - 90;
  x.m.defs[1].dodge = 0;
  x.ib.attack++;
  for (let i = 0; i < 16 && x.m.fighters[0].marks === 0; i++) run(x, 1);
  assert.ok(x.m.fighters[0].marks >= 1, "the second form stopped marking");
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

// An S + L pressed during hit-stun is queued (like the side skill) and the ultimate starts the moment the fighter recovers,
// if the meter is full then; a plain L in hit-stun is still lost, a stale queue never fires later, a held fighter can't queue.
{
  const reeling = (energy: number, block: boolean) => {
    const x = fight(fighter("Fighter"), fighter("Fighter"), 400);
    const f = x.m.fighters[0];
    Object.assign(f, { action: "hit", t: 0, stun: 20, energy });
    x.ia.block = block;
    x.ia.special++;
    run(x, 1);
    x.ia.block = false;
    return { x, f };
  };
  const { x, f } = reeling(100, true);
  assert.ok(f.ultQ && f.action === "hit", "the press during hit-stun wasn't queued");
  run(x, 25);
  assert.ok((f.action as string) === "special" && f.ult, "the queued ultimate never started"); // (the earlier assert narrowed action to "hit")
  assert.ok(f.energy < 20, "the queued ultimate should spend the meter");
  assert.ok(!f.ultQ, "the queue should be used up");
  const plain = reeling(100, false);
  assert.ok(!plain.f.ultQ, "a plain L must not queue an ultimate");
  run(plain.x, 25);
  assert.notEqual(plain.f.action as string, "special", "a lost L press fired later");
  const low = reeling(60, true);
  run(low.x, 25);
  assert.ok(!(low.f.action === "special" && low.f.ult) && !low.f.ultQ, "an ultimate with a half meter should be dropped, and the queue cleared");
  // The meter is checked when they recover, not when they pressed: if it was drained meanwhile, nothing fires.
  const y = reeling(100, true);
  y.f.energy = 60; // the meter dropped before they recovered (say, the opponent stole it)
  run(y.x, 25);
  assert.notEqual(y.f.action as string, "special", "the ultimate fired without a full meter");
  // A fighter held by an ultimate can't queue anything.
  const z = fight(fighter("Fighter", { ultKind: "slash" }), fighter("Fighter"), 110);
  z.m.fighters[0].energy = 100;
  z.ia.block = true;
  z.ia.special++;
  run(z, 1);
  z.ia.block = false;
  const held = z.m.fighters[1];
  for (let i = 0; i < 40 && !held.locked; i++) run(z, 1);
  assert.ok(held.locked, "setup: slash ultimate should lock");
  held.energy = 100;
  z.ib.block = true;
  z.ib.special++;
  run(z, 1);
  assert.ok(!held.ultQ, "a held fighter queued an ultimate");
}

// ------------------------------------------------------------------ Arena 1 (src/game/arena.ts)

// A normal match must be exactly what it was before the arena existed: the hash of every snapshot of three scripted
// fights (a fixed button-masher) was taken on main before the arena change.
{
  const h = createHash("sha1");
  for (const [a, b] of [["Sword", "Mace"], ["Tank", "Attacker"], ["Fighter", "Sword"]]) {
    let s = 12345;
    const rnd = () => ((s = (Math.imul(s, 1103515245) + 12345) >>> 0) / 4294967296);
    const ia = { ...EMPTY_INPUT }, ib = { ...EMPTY_INPUT };
    const m = createMatch(fighter(a), fighter(b), [ia, ib]);
    for (let t = 0; t < 9000 && m.phase !== "matchEnd"; t++) {
      for (const i of [ia, ib]) {
        if (t % 6 === 0) {
          i.left = rnd() < 0.3; i.right = rnd() < 0.4; i.block = rnd() < 0.2;
          if (rnd() < 0.2) i.jump++;
          if (rnd() < 0.3) i.attack++;
          if (rnd() < 0.2) i.kick++;
          if (rnd() < 0.1) i.special++;
          if (rnd() < 0.05) i.skill++;
        }
      }
      step(m, [ia, ib]);
      h.update(JSON.stringify(snapshot(m)));
    }
    assert.equal(m.arena, undefined, "a normal match has no arena");
  }
  assert.equal(h.digest("hex"), "fe00bfdbb4caa1fdc13558383757b18f07496ef2", "arena off must leave a normal match's snapshots unchanged");
}

// An arena match already in the fight phase at `tick`, fighters at x0 / x1 on the floor, random hazards off unless asked.
// The story (the guided pauses) is marked as told up to `story`: "none" (the default: nothing interrupts a test that jumps to a scene),
// "climb" (the ceremony is over, the climb pause at scene 5 is still to come).
function arena(tick: number, x0 = 300, x1 = 660, hazards = false, story: "none" | "climb" = "none") {
  const ia = { ...EMPTY_INPUT }, ib = { ...EMPTY_INPUT };
  const m = createMatch(fighter("Fighter"), fighter("Fighter"), [ia, ib], { arena: "inferno" });
  for (const d of m.defs) d.dodge = 0;
  m.arena!.beat = story === "climb" ? ARENA_STORY_IDS.indexOf("climb") : ARENA_STORY_LENGTH;
  for (let i = 0; i < 3 * TICK_HZ; i++) step(m, [ia, ib]);
  assert.equal(m.phase, "fight");
  m.timer = ARENA_TUNE.matchTicks - tick;
  if (!hazards) m.arena!.next = [1e9, 1e9];
  m.fighters[0].x = x0;
  m.fighters[1].x = x1;
  return { m, ia, ib };
}

// The arena is one 5:00 round with a bigger health pool; the five scenes change at the exact ticks and announce themselves.
{
  const { m, ia, ib } = arena(0);
  m.arena!.next = [1e9, 1e9];
  assert.equal(m.timer, ARENA_TUNE.matchTicks);
  assert.equal(m.defs[0].maxHp, 200 * ARENA_TUNE.hpMul);
  const seen: [number, number][] = []; // [scene number, match tick it was announced on]
  let last = 0;
  for (let t = 0; t < 9100; t++) {
    step(m, [ia, ib]);
    if (m.freeze || m.slow) continue;
    for (const e of m.events) if (e.id > last) { last = e.id; if (e.type === "arena" && e.kind === "scene") seen.push([e.n!, arenaTick(m) - 1]); }
  }
  assert.deepEqual(seen, [[1, 0], [2, 1800], [3, 3600], [4, 6300], [5, 9000]], "scenes must change at 0, 30, 60, 105 and 150 s");
  assert.deepEqual([0, 1799, 1800, 3599, 3600, 6299, 6300, 8999, 9000, 17999].map(sceneAt), [0, 0, 1, 1, 2, 2, 3, 3, 4, 4]);
  // With the story on, scene 5 begins with a guided pause: its announcement comes on the pause's first tick, at the same match tick.
  const S = arena(8990, 300, 660, false, "climb");
  S.m.arena!.scene = 3;
  let phase5 = -1;
  for (let t = 0; t < 40; t++) {
    run(S, 1);
    if (phase5 < 0 && S.m.events.some((e) => e.type === "arena" && e.kind === "scene" && e.n === 5)) phase5 = arenaTick(S.m);
  }
  assert.equal(phase5, 9000, "scene 5 is announced when 9000 ticks have been played");
  assert.equal(S.m.phase, "cue");
}

// Platforms are real: you land on top, you can't fall through one at any speed, you jump up through one and drop down with S + jump.
{
  const T = STAIRS_UP_TICK + 30;
  const s1 = platformsAt(T).find((p) => p.id === 1)!, c = platformsAt(T).find((p) => p.kind === "final")!;
  assert.equal(s1.state, "up");
  const { m, ia, ib } = arena(T, s1.x + 40, 480);
  const f = m.fighters[0];
  f.y = 100;
  f.vy = 0;
  run({ m, ia, ib }, 60);
  assert.ok(f.grounded && f.y === s1.top, `fell to ${f.y} instead of landing on the step at ${s1.top}`);
  // Maximum fall speed: a fighter dropped at 60 px/tick (far past any real fall) still lands on the platform.
  f.y = -300;
  f.vy = 60;
  run({ m, ia, ib }, 40);
  assert.ok(f.grounded && f.y === s1.top, "tunnelled through a platform at a high fall speed");
  // One-way: from the floor, a jump goes up through the step and lands on it.
  f.y = ARENA.ground;
  f.vy = 0;
  f.grounded = true;
  run({ m, ia, ib }, 3);
  ia.jump++;
  run({ m, ia, ib }, 70);
  assert.ok(f.grounded && f.y === s1.top, "a jump from below should come up through the platform and land on it");
  // S + jump drops through to the floor.
  ia.block = true;
  ia.jump++;
  run({ m, ia, ib }, 2);
  ia.block = false;
  run({ m, ia, ib }, 40);
  assert.ok(f.grounded && f.y === ARENA.ground, `S + jump should drop to the floor, stood at ${f.y}`);
  // The final platform holds both fighters, and walking off its edge falls.
  m.fighters[1].x = 520;
  m.fighters[1].y = 0;
  f.x = c.x + c.w - 10;
  f.y = c.top;
  f.grounded = true;
  run({ m, ia, ib }, 30);
  assert.equal(m.fighters[1].y, c.top, "the second fighter lands on the final platform");
  assert.ok(f.y === c.top, "still on the platform");
  ia.right = true;
  run({ m, ia, ib }, 40);
  assert.ok(f.y > c.top, "walking off the edge should fall");
  ia.right = false;
}

// A rock that rises under a fighter carries them up: no crush, no tunnelling, no trap.
{
  const r = ROCK_DEFS[0];
  const { m, ia, ib } = arena(r.rise - 5, r.x + 40, 780);
  const f = m.fighters[0];
  let lowest = 0;
  run({ m, ia, ib }, 5 + r.dur + 5);
  for (let t = 0; t < 30; t++) {
    run({ m, ia, ib }, 1);
    lowest = Math.max(lowest, f.y);
  }
  assert.ok(f.grounded && f.y === r.top, `a rising rock should carry the fighter to its top (${r.top}), got ${f.y}`);
  assert.ok(lowest <= ARENA.ground, "the fighter must never end up below the floor");
  // The warning comes first: dust and a rumble for at least 2 s before anything rises.
  for (const d of ROCK_DEFS) assert.ok(d.rise - d.warn >= 2 * TICK_HZ, `rock ${d.id} warns less than 2 s ahead`);
  assert.ok(r.rise - r.warn >= 2 * TICK_HZ);
  assert.equal(platformsAt(r.warn - 1)[0].state, "hidden");
  assert.equal(platformsAt(r.warn)[0].state, "warn");
  assert.equal(platformsAt(r.rise - 1)[0].state, "warn");
  assert.equal(platformsAt(r.rise)[0].state, "rising");
}

// Guided pause (the "cue" phase): scene 5 begins with "Get up there!". The clock and the fight hold still, nobody can attack,
// the staircase keeps rising on the world clock, and the pause ends when both fighters stand on the final platform.
{
  const S = arena(8990, 300, 660, false, "climb");
  const { m, ia } = S;
  m.projectiles.push({ id: 9500, owner: 0, kind: "orb", x: 400, y: 400, vx: 5, r: 10, dmg: 30, life: 50 });
  Object.assign(m.fighters[1], { action: "attack", t: 3, move: "jab" as never });
  for (let t = 0; t < 9; t++) {
    run(S, 1);
    assert.equal(m.phase, "fight", "the pause must not start before 9000 ticks have been played");
  }
  run(S, 1);
  assert.equal(m.phase, "cue");
  assert.equal(arenaTick(m), 9000);
  assert.equal(m.cue!.id, "climb");
  assert.equal(m.cue!.text, "GET UP THERE!");
  assert.equal(m.arena!.beat, ARENA_STORY_IDS.indexOf("climb") + 1, "a beat is played once");
  assert.equal(m.projectiles.length, 0, "what was in flight stops when a pause begins");
  assert.equal(m.fighters[1].action, "idle");
  const f = m.fighters[0], g = m.fighters[1];
  const timer = m.timer, hp = [f.hp, g.hp], w0 = arenaWorld(m), p0 = m.arena!.pause;
  // Nobody can attack, guard or cast in a pause (and nothing is left queued for when the fight resumes).
  f.energy = 100;
  ia.attack++; ia.kick++; ia.special++; ia.skill++; ia.block = true;
  run(S, 6);
  assert.equal(f.action, "idle");
  assert.equal(f.blocking, false);
  assert.equal(f.skillT, 0, "a side skill was used in a pause");
  assert.equal(f.energy, 100, "the meter must not move in a pause");
  ia.block = false;
  // They can walk and jump (there is a mark to go to).
  const x0 = f.x;
  ia.right = true;
  run(S, 20);
  assert.ok(f.x > x0 + 20, "walking works in a pause");
  ia.right = false;
  ia.jump++;
  run(S, 3);
  assert.ok(f.y < ARENA.ground, "jumping works in a pause");
  run(S, 60);
  // The clock holds; the world moves on (the stairs rise while the fight is stopped).
  assert.equal(m.timer, timer, "the match clock must hold in a pause");
  assert.equal(arenaTick(m), 9000);
  assert.equal(arenaWorld(m), w0 + (m.arena!.pause - p0));
  assert.equal(m.arena!.pause - p0, 89, "the world clock counts the pause");
  assert.equal(platformsAt(arenaWorld(m)).find((p) => p.id === 1)!.state, "up", "step 1 should have risen during the pause");
  assert.deepEqual([f.hp, g.hp], hp, "no damage in a pause");
  assert.ok(m.events.some((e) => e.type === "arena" && e.kind === "cue"), "the pause announces itself");
  // Both on the final platform: the pause ends (after a short linger) and the fight resumes where it stopped.
  while (arenaWorld(m) < STAIRS_UP_TICK + 2) run(S, 1);
  assert.equal(m.phase, "cue", "the pause must wait for the fighters");
  const c = platformsAt(arenaWorld(m)).find((p) => p.kind === "final")!;
  assert.equal(c.state, "up");
  Object.assign(f, { x: 400, y: c.top, vx: 0, vy: 0, grounded: true });
  Object.assign(g, { x: 560, y: c.top, vx: 0, vy: 0, grounded: true });
  run(S, 1);
  assert.deepEqual(m.cue!.done, [true, true]);
  ia.right = true;
  run(S, 5);
  assert.equal(f.x, 400, "someone in place is held there until the other arrives");
  ia.right = false;
  run(S, ARENA_TUNE.cue.hold + 2);
  assert.equal(m.phase, "cue");
  assert.equal(m.cue!.id, "marks", "the climb leads into the ring's marks");
  assert.equal(m.events.filter((e) => e.type === "arena" && e.kind === "warp").length, 0, "nobody needed lifting");
  assert.equal(m.timer, timer, "the clock is still held");
}

// A pause that nobody finishes times out and lifts whoever is still below onto the platform.
{
  const S = arena(8990, 300, 660, false, "climb");
  run(S, 12);
  assert.equal(S.m.phase, "cue");
  run(S, ARENA_TUNE.cue.climb - 20);
  assert.equal(S.m.phase, "cue", "the pause waits for the timeout");
  run(S, 40);
  assert.equal(S.m.phase, "cue");
  assert.equal(S.m.cue!.id, "marks");
  const c = platformsAt(arenaWorld(S.m)).find((p) => p.kind === "final")!;
  for (const f of S.m.fighters) assert.ok(f.y === c.top && f.x >= c.x && f.x <= c.x + c.w, "a straggler is put on the final platform");
  assert.equal(S.m.events.filter((e) => e.type === "arena" && e.kind === "warp").length, 2);
}

// A snapshot taken in a pause survives JSON and the resumed match carries on identically.
{
  const S = arena(8990, 300, 660, false, "climb");
  run(S, 250);
  const snap = JSON.parse(JSON.stringify(snapshot(S.m)));
  assert.equal(snap.phase, "cue");
  assert.equal(snap.cue.id, "climb");
  const b = resumeMatch(snap, fighter("Fighter"), fighter("Fighter"), [{ ...S.ia }, { ...S.ib }]);
  for (const d of b.defs) d.dodge = 0;
  S.ia.right = true;
  const ib = { ...S.ia };
  for (let t = 0; t < 400; t++) {
    step(S.m, [S.ia, S.ib]);
    step(b, [ib, { ...S.ib }]);
  }
  assert.deepEqual(JSON.parse(JSON.stringify(snapshot(b).cue ?? null)), JSON.parse(JSON.stringify(snapshot(S.m).cue ?? null)), "a resumed pause diverged");
  assert.deepEqual(JSON.parse(JSON.stringify(snapshot(b).arena)), JSON.parse(JSON.stringify(snapshot(S.m).arena)));
  assert.deepEqual([b.fighters[0].x, b.fighters[0].y], [S.m.fighters[0].x, S.m.fighters[0].y]);
}

// Telegraph first, damage second: a crack does nothing while it glows, a meteor nothing before its marker runs out.
{
  const T = 3700;
  const { m, ia, ib } = arena(T, 500, 800);
  const hp = m.fighters[0].hp;
  m.arena!.cracks.push({ id: 9001, x: 500, w: 60, born: T, glow: ARENA_TUNE.crack.glow, end: T + ARENA_TUNE.crack.glow + ARENA_TUNE.crack.live });
  run({ m, ia, ib }, ARENA_TUNE.crack.glow - 1);
  assert.equal(m.fighters[0].hp, hp, "a glowing crack must not hurt");
  assert.equal(m.arena!.envDmg[0], 0);
  run({ m, ia, ib }, 3);
  assert.ok(m.fighters[0].hp < hp, "a leaking crack must hurt someone standing in it");
  assert.ok(m.arena!.weak[0] > 0, "lava contact weakens the next hits");
  const M = arena(7000, 500, 800);
  const mhp = M.m.fighters[0].hp;
  M.m.arena!.meteors.push({ id: 9002, x: 500, born: 7000, hit: 7000 + ARENA_TUNE.meteor.warn });
  run(M, ARENA_TUNE.meteor.warn - 1);
  assert.equal(M.m.fighters[0].hp, mhp, "a meteor must not hurt before it lands");
  run(M, 3);
  assert.ok(M.m.fighters[0].hp < mhp, "a meteor must hurt someone standing under it");
  assert.equal(M.m.arena!.meteors.length, 0);
  // One blast never hurts both fighters on the same tick: the nearer one takes it.
  const B = arena(7000, 500, 520);
  B.m.arena!.meteors.push({ id: 9003, x: 505, born: 7000, hit: 7010 });
  run(B, 20);
  assert.ok(B.m.arena!.envDmg[0] > 0 && B.m.arena!.envDmg[1] === 0, "a meteor hurt both fighters at once");
  // Its marker lasts >= 1 s and a crack glows >= 1.5 s (the numbers the sheet asks for).
  assert.ok(ARENA_TUNE.meteor.warn >= TICK_HZ && ARENA_TUNE.crack.glow >= 1.5 * TICK_HZ);
}

// Spawned cracks and meteors keep their promises over a whole scene: never under a fighter, at most 2 cracks, a safe strip of 200 px.
{
  const { m, ia, ib } = arena(3590, 200, 800, true);
  let spawned = 0;
  for (let t = 0; t < 2800; t++) {
    const before = new Set(m.arena!.cracks.map((c) => c.id));
    run({ m, ia, ib }, 1);
    for (const c of m.arena!.cracks) if (!before.has(c.id)) {
      spawned++;
      for (const f of m.fighters) assert.ok(Math.abs(f.x - c.x) >= 35 + c.w / 2 + ARENA_TUNE.crack.clear, "a crack spawned under or next to a fighter");
    }
    assert.ok(m.arena!.cracks.length <= ARENA_TUNE.crack.max, "more than 2 crack zones at once");
    const edges = m.arena!.cracks.map((c) => [c.x - c.w / 2, c.x + c.w / 2]).sort((p, q) => p[0] - q[0]);
    let at = ARENA.wall, best = 0;
    for (const [l, r] of edges) { best = Math.max(best, l - at); at = Math.max(at, r); }
    best = Math.max(best, ARENA.w - ARENA.wall - at);
    assert.ok(best >= ARENA_TUNE.crack.safe, "no safe strip left on the floor");
  }
  assert.ok(spawned >= 4, `only ${spawned} cracks in scene 3`);
}

// Lava: it stays under the final platform until 5:00, someone who stays in it is put back on a platform after a short delay,
// the damage is capped per 10 s and never knocks anyone out, and the weakness is capped and wears off.
{
  const c = platformsAt(STAIRS_UP_TICK + 1).find((p) => p.kind === "final")!;
  assert.ok(lavaY(ARENA_TUNE.matchTicks) > c.top + ARENA_TUNE.lava.margin, "lava must stay below the final platform until 5:00");
  assert.ok(lavaY(STAIRS_UP_TICK + 10 * TICK_HZ) > ARENA.ground, "lava must not reach the floor until the stairs have stood 10 s");
  const T = 15500; // the floor is under lava (and step 1 soon); the test plays on to ~17400, inside the 18000 ticks of the match
  const { m, ia, ib } = arena(T, 480, 700);
  const f = m.fighters[0];
  const pool = m.defs[0].maxHp;
  const rescue = ARENA_TUNE.lava.rescue;
  ARENA_TUNE.lava.rescue = 1e9; // first: no rescue, to see the cap
  f.hp = 60;
  const dealt: number[] = [];
  for (let t = 0; t < 1500; t++) {
    const before = m.arena!.envDmg[0];
    run({ m, ia, ib }, 1);
    dealt.push(m.arena!.envDmg[0] - before);
  }
  const win = 600;
  let worst = 0, sum = 0;
  for (let i = 0; i < dealt.length; i++) {
    sum += dealt[i];
    if (i >= win) sum -= dealt[i - win];
    worst = Math.max(worst, sum);
  }
  assert.ok(worst <= Math.round(ARENA_TUNE.env.cap * pool), `${worst} lava damage in 10 s (cap ${ARENA_TUNE.env.cap * pool})`);
  assert.ok(worst > 0, "standing in lava must hurt");
  assert.equal(f.hp, 1, "the environment takes health down to 1 but never delivers a knockout");
  assert.notEqual(f.action, "ko");
  assert.ok(m.arena!.weak[0] <= ARENA_TUNE.weak.max + 1e-9 && m.arena!.weak[0] > 0, "weakness is capped");
  // Rescue.
  ARENA_TUNE.lava.rescue = rescue;
  f.y = ARENA.ground;
  f.x = 480;
  run({ m, ia, ib }, rescue + 3);
  assert.ok(f.y < ARENA.ground && m.arena!.immune[0] > 0, "someone in lava is put back on a platform after the delay");
  assert.ok(Math.abs(f.y - c.top) < 0.5 || platformsAt(T).some((p) => Math.abs(p.top - f.y) < 0.5), "the rescue lands on a platform top");
  assert.ok(f.y < lavaY(T) - ARENA_TUNE.lava.margin, "the rescue spot is safe from the lava");
  // The weakness wears off once out of contact.
  run({ m, ia, ib }, ARENA_TUNE.weak.after + Math.ceil(ARENA_TUNE.weak.max / ARENA_TUNE.weak.recover) + 5);
  assert.equal(m.arena!.weak[0], 0, "weakness should wear off");
  // Standing on the final platform is safe from the lava to the end.
  const F = arena(17900, 480, 520);
  F.m.fighters[0].y = c.top;
  F.m.fighters[1].y = c.top;
  run(F, 90);
  assert.equal(F.m.arena!.envDmg[0] + F.m.arena!.envDmg[1], 0, "the final platform must stay out of the lava");
}

// Heat (scene 2) hurts both fighters the same, a little, and only in scene 2.
{
  const { m, ia, ib } = arena(1790);
  run({ m, ia, ib }, 10);
  assert.equal(m.arena!.envDmg[0] + m.arena!.envDmg[1], 0, "no heat before scene 2");
  run({ m, ia, ib }, 3 * ARENA_TUNE.heat.every);
  assert.ok(m.arena!.envDmg[0] > 0 && m.arena!.envDmg[0] === m.arena!.envDmg[1], "heat is the same for both");
  const after = m.arena!.envDmg[0];
  m.timer = ARENA_TUNE.matchTicks - 3700;
  run({ m, ia, ib }, 3 * ARENA_TUNE.heat.every);
  assert.equal(m.arena!.envDmg[0], after, "heat is a scene 2 thing");
}

// A knockout outranks the schedule: nothing from the arena lands after it, whichever tick it falls on.
{
  for (let d = 0; d <= 14; d++) {
    const T = 7000;
    const { m, ia, ib } = arena(T, 400, 470);
    const v = m.fighters[1];
    v.hp = 1;
    v.vx = 0;
    ia.attack++; // a jab is coming
    m.arena!.meteors.push({ id: 9100, x: 470, born: T, hit: T + d });
    m.arena!.cracks.push({ id: 9101, x: 470, w: 60, born: T - 500, glow: 100, end: T + 5000 });
    let koAt = -1, hurtAfter = 0;
    for (let t = 0; t < 60; t++) {
      const e0 = m.arena!.envDmg[1];
      run({ m, ia, ib }, 1);
      if (koAt < 0 && v.action === "ko") koAt = t;
      if (koAt >= 0 && t > koAt) hurtAfter += m.arena!.envDmg[1] - e0;
    }
    assert.ok(koAt >= 0, "setup: the jab should KO a 1 HP fighter");
    assert.equal(hurtAfter, 0, `environment damage after the KO (meteor at +${d})`);
    assert.equal(m.arena!.meteors.length + m.arena!.cracks.length, 0, "no hazard may outlive the match");
    assert.equal(m.roundWinner, 0);
    assert.equal(m.roundReason, "ko");
  }
}

// The clock decides at 5:00: higher health wins, equal health is a draw (matchWinner null); one round only.
{
  for (const [h0, h1, winner] of [[900, 400, 0], [300, 800, 1], [500, 500, null]] as const) {
    const { m, ia, ib } = arena(0);
    m.fighters[0].hp = h0;
    m.fighters[1].hp = h1;
    m.timer = 5;
    run({ m, ia, ib }, 10);
    assert.equal(m.phase, "roundEnd");
    assert.equal(m.roundReason, "time");
    assert.equal(m.roundWinner, winner);
    run({ m, ia, ib }, 3 * TICK_HZ);
    assert.equal(m.phase, "matchEnd", "an arena fight is one round");
    assert.equal(m.matchWinner, winner);
    assert.equal(m.round, 1);
    run({ m, ia, ib }, 10);
    assert.equal(m.arena!.cracks.length + m.arena!.meteors.length, 0, "no hazards after the match ends");
  }
}

// An arena snapshot survives JSON (the relay and the guest) and a resumed match carries on exactly like the original.
{
  const { m, ia, ib } = arena(3590, 200, 800, true);
  run({ m, ia, ib }, 900);
  assert.ok(m.arena!.cracks.length > 0, "setup: a crack should be live");
  const snap = JSON.parse(JSON.stringify(snapshot(m)));
  assert.equal(snap.arena.id, "inferno");
  assert.ok(JSON.stringify(snap.arena).length < 600, `the arena state is ${JSON.stringify(snap.arena).length} bytes: snapshots go out 60 times a second`);
  const b = resumeMatch(snap, fighter("Fighter"), fighter("Fighter"), [{ ...ia }, { ...ib }]);
  for (const d of b.defs) d.dodge = 0;
  for (let t = 0; t < 400; t++) {
    step(m, [ia, ib]);
    step(b, [{ ...ib, ...EMPTY_INPUT }, { ...EMPTY_INPUT }]);
  }
  assert.deepEqual(JSON.parse(JSON.stringify(snapshot(b).arena)), JSON.parse(JSON.stringify(snapshot(m).arena)), "a resumed arena fight diverged");
}

// The weather changes slowly (the sheet: about 8-10 s, not 2 s), and the heatwave builds, holds in scene 2 and settles to a lower level.
{
  const F = ARENA_TUNE.weather.fade;
  assert.ok(F >= 8 * TICK_HZ && F <= 10 * TICK_HZ, `the weather fade is ${F / TICK_HZ} s`);
  const sc = ARENA_TUNE.scenes;
  assert.equal(heatAt(0), 0);
  assert.equal(heatAt(sc[1] - 1), 0, "no heat before scene 2");
  let prev = 0;
  for (let t = sc[1]; t <= sc[1] + F; t += 30) {
    assert.ok(heatAt(t) >= prev - 1e-9, "the heat builds without dipping");
    prev = heatAt(t);
  }
  assert.ok(heatAt(sc[1] + 20) < 0.05 && heatAt(sc[1] + F) > 0.99, "the heatwave comes in over the fade, not at once");
  assert.ok(heatAt(sc[2] - 1) > 0.99, "it holds through scene 2");
  assert.ok(heatAt(sc[2] + F) < 0.5 && heatAt(sc[2] + F) > 0.4 && heatAt(sc[4] + 5000) === heatAt(sc[2] + F), "then it settles to a lower level and stays there");
}

// The opening ceremony: before any fighting, each fighter locks a constellation (left / right move the cursor one place per press, punch locks,
// a taken one can't be locked twice, the cursor skips it, whoever hasn't locked when the time runs out gets the one under the cursor).
{
  const ia = { ...EMPTY_INPUT }, ib = { ...EMPTY_INPUT };
  const m = createMatch(fighter("Fighter"), fighter("Fighter"), [ia, ib], { arena: "inferno" });
  const C = ARENA_TUNE.ceremony;
  assert.equal(m.phase, "intro");
  run({ m, ia, ib }, C.intro - 1);
  assert.equal(m.phase, "intro");
  run({ m, ia, ib }, 1);
  assert.equal(m.phase, "cue");
  assert.equal(m.cue!.id, "open");
  assert.equal(m.cue!.text, "THE STARS WAKE");
  const a = m.arena!;
  assert.deepEqual([a.pick[0], a.pick[1]], [null, null]);
  // Pressing in the first beat does nothing (the stars are only waking): no lock, no cursor move.
  ia.attack++; ia.right = true;
  run({ m, ia, ib }, 3);
  ia.right = false;
  assert.deepEqual(a.pick, [null, null]);
  assert.deepEqual(a.cur, [0, 2], "the cursor must not move before the pick");
  run({ m, ia, ib }, C.open);
  assert.equal(m.cue!.id, "pick");
  const E = ARENA_TUNE.matchTicks;
  assert.equal(m.timer, E, "no fighting clock runs in the ceremony");
  // One press moves the cursor one place; a held key doesn't repeat; left goes back; it wraps round.
  ia.right = true;
  run({ m, ia, ib }, 30);
  assert.equal(a.cur[0], 1, "a held key moves the cursor once");
  ia.right = false;
  run({ m, ia, ib }, 2);
  ia.left = true;
  run({ m, ia, ib }, 2);
  ia.left = false;
  assert.equal(a.cur[0], 0);
  run({ m, ia, ib }, 2);
  ia.left = true;
  run({ m, ia, ib }, 2);
  ia.left = false;
  assert.equal(a.cur[0], CONSTELLATIONS.length - 1, "the list wraps");
  // Both press punch on the same tick with the cursors on the same constellation: P1 gets it, P2's cursor moves on.
  a.cur[0] = 1;
  a.cur[1] = 1;
  ia.attack++;
  ib.attack++;
  run({ m, ia, ib }, 1);
  assert.equal(a.pick[0], CONSTELLATIONS[1], "P1 wins a tie");
  assert.equal(a.pick[1], null, "P2 can't take what P1 just locked");
  assert.notEqual(a.cur[1], 1, "P2's cursor moves off the taken one");
  assert.ok(m.events.some((e) => e.type === "arena" && e.kind === "star" && e.slot === 0), "a lock announces itself");
  // A locked fighter's cursor and presses do nothing more; the other's cursor skips the taken one.
  ia.right = true;
  ia.attack++;
  a.cur[1] = 0;
  ib.right = true;
  run({ m, ia, ib }, 2);
  ib.right = false;
  ia.right = false;
  assert.equal(a.pick[0], CONSTELLATIONS[1]);
  assert.equal(a.cur[1], 2, "the cursor skips the constellation the other fighter took");
  run({ m, ia, ib }, 2);
  // Nobody can attack during the ceremony: the fighters stand where they were.
  assert.equal(m.fighters[0].action, "idle");
  // P2 doesn't press: the pick times out and P2 gets the one under the cursor.
  const t0 = m.phaseT;
  run({ m, ia, ib }, C.pick - t0 + 2);
  assert.equal(a.pick[1], CONSTELLATIONS[2], "an unlocked fighter gets the constellation under the cursor at the end");
  assert.notEqual(a.pick[0], a.pick[1], "two fighters never share a constellation");
  assert.equal(m.cue!.id, "settle", "the pick ends and the stars settle");
  run({ m, ia, ib }, C.settle - 10);
  assert.equal(m.phase, "cue");
  run({ m, ia, ib }, 12);
  assert.equal(m.phase, "fight", "the fight starts after the settle");
  assert.ok(m.timer >= E - 12, "the match clock starts only now");
  // In the whole ceremony nobody lost a point of health and the meter stayed empty (a few ticks of the fight have passed by now).
  assert.deepEqual(m.fighters.map((f) => f.hp), [m.defs[0].maxHp, m.defs[1].maxHp]);
  assert.ok(m.fighters.every((f) => f.energy < 1), "the meter must not fill during the ceremony");
  // The pick is in every snapshot, and a resumed match keeps it.
  const snap = JSON.parse(JSON.stringify(snapshot(m)));
  assert.deepEqual(snap.arena.pick, [CONSTELLATIONS[1], CONSTELLATIONS[2]]);
  const b = resumeMatch(snap, fighter("Fighter"), fighter("Fighter"), [{ ...ia }, { ...ib }]);
  assert.deepEqual(b.arena!.pick, a.pick);
}

// Both lock quickly: the pick doesn't wait for its timeout, it ends after the short linger.
{
  const ia = { ...EMPTY_INPUT }, ib = { ...EMPTY_INPUT };
  const m = createMatch(fighter("Fighter"), fighter("Fighter"), [ia, ib], { arena: "inferno" });
  run({ m, ia, ib }, ARENA_TUNE.ceremony.intro + ARENA_TUNE.ceremony.open + 1);
  assert.equal(m.cue!.id, "pick");
  ia.attack++;
  ib.attack++;
  run({ m, ia, ib }, 1);
  assert.deepEqual(m.cue!.done, [true, true]);
  run({ m, ia, ib }, ARENA_TUNE.ceremony.lock + 1);
  assert.equal(m.cue!.id, "settle");
  assert.ok(m.arena!.pick[0] && m.arena!.pick[1] && m.arena!.pick[0] !== m.arena!.pick[1]);
}

// The ceremony takes about 15 s at the most (the sheet's number), whatever the players do.
{
  const C = ARENA_TUNE.ceremony;
  const longest = C.intro + C.open + C.pick + C.lock + C.settle;
  assert.ok(longest <= 16 * TICK_HZ, `the ceremony can take ${(longest / TICK_HZ).toFixed(1)} s`);
}

// What each constellation grants (the numbers are ARENA_TUNE.stars). `with` gives a fighter a constellation in a match already in the fight.
{
  const S = ARENA_TUNE.stars;
  const star = (tick: number, slot0: (typeof CONSTELLATIONS)[number] | null, slot1: (typeof CONSTELLATIONS)[number] | null = null, x0 = 300, x1 = 660) => {
    const x = arena(tick, x0, x1);
    x.m.arena!.pick = [slot0, slot1];
    return x;
  };
  // Phoenix: lava and cracks hurt 60% less.
  const crack = (pick: (typeof CONSTELLATIONS)[number] | null) => {
    const x = star(3700, pick, null, 500, 800);
    x.m.arena!.cracks.push({ id: 9601, x: 500, w: 60, born: 3700, glow: 0, end: 9999 });
    run(x, 90);
    return x.m.arena!.envDmg[0];
  };
  const plain = crack(null), phoenix = crack("phoenix");
  assert.ok(plain > 0 && Math.abs(phoenix / plain - S.phoenix.lava) < 0.12, `Phoenix took ${phoenix} of ${plain} from a crack (want x${S.phoenix.lava})`);
  // Tortoise: the cap on environment damage is halved, scorch is capped at 10%.
  const rescue0 = ARENA_TUNE.lava.rescue;
  const lava = (pick: (typeof CONSTELLATIONS)[number] | null) => {
    const x = star(15500, pick, null, 480, 700);
    x.m.fighters[0].hp = 3000;
    x.m.fighters[0].y = ARENA.ground;
    ARENA_TUNE.lava.rescue = 1e9;
    const dealt: number[] = [];
    for (let t = 0; t < 1400; t++) {
      const before = x.m.arena!.envDmg[0];
      run(x, 1);
      dealt.push(x.m.arena!.envDmg[0] - before);
    }
    ARENA_TUNE.lava.rescue = rescue0;
    let worst = 0, sum = 0;
    for (let i = 0; i < dealt.length; i++) { sum += dealt[i]; if (i >= 600) sum -= dealt[i - 600]; worst = Math.max(worst, sum); }
    return { worst, weak: x.m.arena!.weak[0], pool: x.m.defs[0].maxHp };
  };
  const l0 = lava(null), l1 = lava("tortoise");
  assert.ok(l0.worst > 0 && l1.worst <= Math.round(ARENA_TUNE.env.cap * S.tortoise.cap * l1.pool), `Tortoise took ${l1.worst} in 10 s (cap ${ARENA_TUNE.env.cap * S.tortoise.cap * l1.pool})`);
  assert.ok(l1.worst < l0.worst * 0.7, "Tortoise should take clearly less than everyone else in lava");
  assert.ok(l1.weak <= S.tortoise.weak + 1e-9 && l0.weak > S.tortoise.weak, `Tortoise scorch ${l1.weak} (cap ${S.tortoise.weak}), others ${l0.weak}`);
  // Hare: more jump and air control, all match, stacked on scene 5's boost.
  {
    const y = star(1000, "hare", null);
    const b = arenaBoost(y.m, 0), n = arenaBoost(y.m, 1);
    assert.deepEqual([b.jump, b.air, n.jump, n.air], [S.hare.jump, S.hare.air, 1, 1]);
    const apex = (x: ReturnType<typeof star>) => {
      const f = x.m.fighters[0];
      x.ia.jump++;
      let top = f.y;
      for (let t = 0; t < 80; t++) { run(x, 1); top = Math.min(top, f.y); if (t > 3 && f.grounded) break; }
      return ARENA.ground - top;
    };
    const hare = apex(y), base = apex(star(1000, null, null));
    assert.ok(hare / base > S.hare.jump ** 2 - 0.05, `Hare jumps ${hare} against ${base}`);
    const five = star(9500, "hare", null);
    assert.ok(Math.abs(arenaBoost(five.m, 0).jump - S.hare.jump * ARENA_TUNE.boost.jump) < 1e-9, "the Hare's jump stacks with scene 5's");
  }
  // Serpent: +10% on a scorched foe, nothing on a clean one.
  {
    const hit = (pick: (typeof CONSTELLATIONS)[number] | null, scorched: number) => {
      const x = star(2000, pick, null, 480, 520);
      x.m.defs[0].punch *= 20; // (a big hit: damage is rounded to whole points, which would blur a 10% difference)
      x.m.arena!.weak[1] = scorched;
      x.m.fighters[1].blocking = false;
      x.ia.attack++;
      run(x, 20);
      return x.m.defs[1].maxHp - x.m.fighters[1].hp;
    };
    const clean = hit(null, 0), cleanS = hit("serpent", 0), burnt = hit(null, 0.1), burntS = hit("serpent", 0.1);
    assert.ok(clean > 0 && Math.abs(cleanS - clean) < 1e-9, "the Serpent's bonus needs a scorched foe");
    assert.ok(Math.abs(burntS / burnt - S.serpent.scorched) < 0.01 && Math.abs(burnt - clean) < 1e-9, `Serpent dealt ${burntS} against ${burnt} on a scorched foe`);
  }
  // Comet: the special meter fills 15% faster.
  {
    const e = (pick: (typeof CONSTELLATIONS)[number] | null) => {
      const x = star(2000, pick, null);
      run(x, 600);
      return x.m.fighters[0].energy;
    };
    const base = e(null), comet = e("comet");
    assert.ok(base > 0 && Math.abs(comet / base - S.comet.energy) < 0.02, `Comet meter ${comet} against ${base}`);
  }
}

// The ring (scene 5): after the climb the walls rise, each fighter walks to a mark (the one standing further left takes the left one, so they
// face each other from opposite sides), the stars answer with a buff per fighter, then the fight; the walls are solid.
{
  const S = arena(8990, 300, 660, false, "climb");
  const { m, ia, ib } = S;
  run(S, 12);
  while (arenaWorld(m) < STAIRS_UP_TICK + 2) run(S, 1);
  const fin = platformsAt(arenaWorld(m)).find((p) => p.kind === "final")!;
  assert.equal(fin.w, 480, "the final platform is bigger than it was (420)");
  const cx = fin.x + fin.w / 2, T = ARENA_TUNE.marks;
  // Slot 0 is the one on the right this time.
  Object.assign(m.fighters[0], { x: 560, y: fin.top, vx: 0, vy: 0, grounded: true });
  Object.assign(m.fighters[1], { x: 400, y: fin.top, vx: 0, vy: 0, grounded: true });
  assert.equal(m.arena!.ring, 0, "no ring before the climb is done");
  run(S, ARENA_TUNE.cue.hold + 3);
  assert.equal(m.cue!.id, "marks");
  assert.equal(m.cue!.text, "TAKE YOUR MARKS");
  assert.ok(m.arena!.ring > 0, "the walls begin to rise with the marks");
  assert.deepEqual(m.cue!.target!.map((t) => t.x), [cx + T.gap, cx - T.gap], "the fighter standing further left takes the left mark");
  assert.ok(m.cue!.target!.every((t) => t.y === fin.top));
  // The walls are solid only once they have risen; a pause is not a place to be shoved into one.
  assert.equal(ringUp(m), false);
  // They walk to the marks (the computer's way: straight along the platform).
  ia.right = true;
  ib.left = true;
  run(S, 10);
  ia.right = false;
  ib.left = false;
  assert.deepEqual(m.cue!.done, [true, true], "both are on their marks");
  assert.ok(Math.abs(m.fighters[0].x - (cx + T.gap)) <= T.r && Math.abs(m.fighters[1].x - (cx - T.gap)) <= T.r);
  const timer = m.timer;
  run(S, T.hold + 3);
  assert.equal(m.cue!.id, "reveal");
  assert.equal(m.cue!.text, "THE STARS ANSWER");
  const buff = [...m.arena!.buff];
  assert.ok(buff.every((p) => Number.isInteger(p) && p >= ARENA_TUNE.buff.min && p <= ARENA_TUNE.buff.max), `a buff of ${buff} is outside ${ARENA_TUNE.buff.min}-${ARENA_TUNE.buff.max}%`);
  assert.equal(m.events.filter((e) => e.type === "arena" && e.kind === "buff").length, 2, "one roll per fighter");
  assert.equal(m.timer, timer, "the clock is held through the whole ring entry");
  ia.attack++; ib.special++; ia.block = true;
  run(S, ARENA_TUNE.buff.until + 2);
  ia.block = false;
  assert.equal(m.phase, "fight", "then the fight");
  assert.equal(m.cue, undefined);
  assert.deepEqual(m.arena!.buff, buff, "the buff stays for the fight");
  assert.equal(m.fighters[0].action, "idle", "a press made during the ring entry must not fire when the fight resumes");
  const t1 = m.timer;
  run(S, 5);
  assert.equal(m.timer, t1 - 5, "the clock runs again");
  assert.ok(ringUp(m), "the walls are solid in the fight");
  // Solid walls: no one leaves the platform. A shove, a held walk, a launch and a drop attempt all stop at the walls.
  const { lo, hi } = ringBounds();
  const f = m.fighters[0], g = m.fighters[1];
  ia.right = true;
  run(S, 200);
  ia.right = false;
  assert.ok(f.x <= hi + 1e-9 && f.y === fin.top, `walked out of the ring: x ${f.x} y ${f.y}`);
  f.vx = 60;
  run(S, 10);
  assert.ok(f.x <= hi + 1e-9 && f.y === fin.top, "a launch must stop at the wall");
  ib.left = true;
  run(S, 200);
  ib.left = false;
  assert.ok(g.x >= lo - 1e-9 && g.y === fin.top);
  ia.block = true;
  ia.jump++;
  run(S, 40);
  ia.block = false;
  assert.equal(f.y, fin.top, "S + jump must not drop a fighter out of the ring");
  // A masher fights on for 40 s: nobody ever leaves.
  let s = 777;
  const rnd = () => ((s = (Math.imul(s, 1103515245) + 12345) >>> 0) / 4294967296);
  for (let t = 0; t < 2400 && m.phase === "fight"; t++) {
    for (const i of [ia, ib]) if (t % 6 === 0) {
      i.left = rnd() < 0.4; i.right = rnd() < 0.4; i.block = rnd() < 0.15;
      if (rnd() < 0.3) i.jump++;
      if (rnd() < 0.5) i.attack++;
      if (rnd() < 0.3) i.kick++;
      if (rnd() < 0.15) i.special++;
    }
    run(S, 1);
    for (const x of m.fighters) assert.ok(x.x >= lo - 1e-9 && x.x <= hi + 1e-9 && x.y <= fin.top + 1e-9, `fighter ${x.slot} left the ring at tick ${t} (x ${x.x} y ${x.y})`);
  }
}

// The plausibility roll is 10-50%, an integer, one per fighter, different from match to match (the seed) and the same for the same seed.
{
  const roll = (seed: number) => {
    const ia = { ...EMPTY_INPUT }, ib = { ...EMPTY_INPUT };
    const m = createMatch(fighter("Fighter"), fighter("Fighter"), [ia, ib], { arena: "inferno", seed });
    m.arena!.beat = ARENA_STORY_IDS.indexOf("reveal"); // (straight to the stars answering)
    run({ m, ia, ib }, ARENA_TUNE.ceremony.intro + 2);
    assert.equal(m.cue!.id, "reveal");
    return [...m.arena!.buff];
  };
  const all: number[] = [];
  let same = 0;
  for (let seed = 1; seed <= 500; seed++) {
    const b = roll(seed * 2654435761);
    all.push(...b);
    if (b[0] === b[1]) same++;
  }
  assert.deepEqual(roll(12345), roll(12345), "the same seed must roll the same");
  assert.equal(Math.min(...all), ARENA_TUNE.buff.min, "the lowest roll should reach 10%");
  assert.equal(Math.max(...all), ARENA_TUNE.buff.max, "the highest roll should reach 50%");
  const mean = all.reduce((a, b) => a + b, 0) / all.length;
  assert.ok(Math.abs(mean - 30) < 1.5, `the mean roll is ${mean}%`);
  assert.ok(same < 500 * 0.08, `${same} of 500 matches gave both fighters the same roll: the two rolls aren't independent`);
  assert.ok(new Set(all).size >= 35, "the rolls cover the range");
  assert.equal(buffScale(10), ARENA_TUNE.buff.look[0]);
  assert.equal(buffScale(50), ARENA_TUNE.buff.look[1]);
  assert.ok(Math.abs(buffScale(30) - 1.15) < 1e-9 && buffScale(0) === 1, "a buffed fighter is drawn 1.1x-1.2x bigger, an unbuffed one at 1");
  // Without a seed every roll is the same each match (the default tests rely on).
  assert.deepEqual(roll(0), roll(0));
}

// The buff is the admin buff's two halves: what the fighter deals x(1 + p), what they take / (1 + p).
{
  const dmg = (buff: [number, number], from: 0 | 1) => {
    const x = arena(2000, 480, 520);
    x.m.defs[from].punch *= 20; // (a big hit: damage is rounded to whole points)
    x.m.arena!.buff = buff;
    x.m.fighters[1 - from].blocking = false;
    (from === 0 ? x.ia : x.ib).attack++;
    run(x, 20);
    return x.m.defs[1 - from].maxHp - x.m.fighters[1 - from].hp;
  };
  const base = dmg([0, 0], 0);
  assert.ok(base > 0);
  assert.ok(Math.abs(dmg([50, 0], 0) / base - 1.5) < 0.01, "+50% for the attacker");
  assert.ok(Math.abs(dmg([0, 50], 0) / base - 1 / 1.5) < 0.01, "+50% for the victim takes a third off");
  assert.ok(Math.abs(dmg([50, 10], 0) / base - 1.5 / 1.1) < 0.01, "both: dealt x1.5, taken / 1.1");
  assert.ok(Math.abs(dmg([30, 30], 0) / base - 1) < 0.01, "equal buffs cancel");
  assert.ok(Math.abs(dmg([10, 50], 1) / base - 1.5 / 1.1) < 0.01, "and the other way round (slot 1 attacking)");
}

// The ring entry survives a snapshot: a resumed match is in the same beat with the same buffs and walls.
{
  const S = arena(8990, 300, 660, false, "climb");
  run(S, 12);
  while (arenaWorld(S.m) < STAIRS_UP_TICK + 2) run(S, 1);
  const fin = platformsAt(arenaWorld(S.m)).find((p) => p.kind === "final")!;
  Object.assign(S.m.fighters[0], { x: 400, y: fin.top, vx: 0, vy: 0, grounded: true });
  Object.assign(S.m.fighters[1], { x: 560, y: fin.top, vx: 0, vy: 0, grounded: true });
  run(S, ARENA_TUNE.cue.hold + 3 + 20);
  const snap = JSON.parse(JSON.stringify(snapshot(S.m)));
  assert.equal(snap.cue.id, "marks");
  assert.ok(snap.arena.ring > 0 && JSON.stringify(snap.arena).length < 800, `the arena state is ${JSON.stringify(snap.arena).length} bytes`);
  const b = resumeMatch(snap, fighter("Fighter"), fighter("Fighter"), [{ ...S.ia }, { ...S.ib }]);
  for (const d of b.defs) d.dodge = 0;
  for (let t = 0; t < 700; t++) {
    S.ia.left = S.ia.right = false;
    step(S.m, [S.ia, S.ib]);
    step(b, [{ ...S.ia }, { ...S.ib }]);
  }
  assert.deepEqual(JSON.parse(JSON.stringify(snapshot(b).arena)), JSON.parse(JSON.stringify(snapshot(S.m).arena)), "a resumed ring entry diverged");
  assert.equal(b.phase, S.m.phase);
}

// Different seeds give different luck all through the fight (cracks land elsewhere), the same seed the same.
{
  const first = (seed: number) => {
    const ia = { ...EMPTY_INPUT }, ib = { ...EMPTY_INPUT };
    const m = createMatch(fighter("Fighter"), fighter("Fighter"), [ia, ib], { arena: "inferno", seed });
    m.arena!.beat = ARENA_STORY_LENGTH;
    run({ m, ia, ib }, 200);
    m.timer = ARENA_TUNE.matchTicks - 3590;
    m.fighters[0].x = 200;
    m.fighters[1].x = 800;
    const xs: number[] = [];
    for (let t = 0; t < 1500 && xs.length < 3; t++) {
      const n = m.arena!.cracks.length;
      run({ m, ia, ib }, 1);
      if (m.arena!.cracks.length > n) xs.push(m.arena!.cracks[m.arena!.cracks.length - 1].x);
    }
    return xs;
  };
  assert.deepEqual(first(5), first(5));
  assert.notDeepEqual(first(5), first(6), "two seeds put the cracks in the same places");
  assert.equal(JSON.parse(JSON.stringify(snapshot(createMatch(fighter("Fighter"), fighter("Fighter"), [{ ...EMPTY_INPUT }, { ...EMPTY_INPUT }], { arena: "inferno", seed: 99 })))).arena.seed, 99);
}

console.log("check-sim: all good");
