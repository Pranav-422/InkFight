// Computer opponent. Reads the match like a player would (with a reaction delay,
// so it isn't frame-perfect) and drives the same Input a human would send.

import { SPECIAL_INFO } from "./moves";
import { ARENA, BLAST_REACH, BODY, holds, moveReach, type Input, type Match, type Slot } from "./sim";

export type Level = "easy" | "normal" | "hard";

const LEVELS: Record<Level, { react: number; block: number; aggro: number; dodge: number; think: number }> = {
  easy: { react: 24, block: 0.15, aggro: 0.35, dodge: 0.2, think: 14 },
  normal: { react: 14, block: 0.42, aggro: 0.6, dodge: 0.5, think: 8 },
  hard: { react: 7, block: 0.72, aggro: 0.85, dodge: 0.8, think: 4 },
};

// How often a sword steps back after a chain. Every time makes a slow class unable to ever reach it
// (Sword vs Mace 64%); never throws its reach away (32%). Tuned with scripts/balance.ts.
export const STEP_BACK = 0.5;

export type CpuBrain = {
  level: Level;
  tick: number;
  history: string[]; // opponent action per tick, for delayed reactions
  blockUntil: number;
  nextThink: number;
  reactedTo: string; // the opponent's current attack (action + start tick): decide to block once per attack
  guardFor: string; // the attack it chose to block: the guard stays up while that attack still threatens
  retreatUntil: number;
  stepBack: boolean | null; // after this chain, step back out of range? (rolled once per chain, null between chains)
};

export const newBrain = (level: Level): CpuBrain => ({ level, tick: 0, history: [], blockUntil: 0, nextThink: 0, reactedTo: "", guardFor: "", retreatUntil: 0, stepBack: null });

export function cpuThink(m: Match, slot: Slot, brain: CpuBrain, input: Input) {
  const L = LEVELS[brain.level];
  const me = m.fighters[slot];
  const op = m.fighters[1 - slot];
  // Hit-stop and slow-motion ticks don't advance the sim, so they don't advance the CPU either:
  // its clock, reaction delay and block window all count real sim ticks.
  if (holds(m)) return;
  brain.tick++;
  if (me.cooldown === 0) brain.stepBack = null;
  else if (brain.stepBack === null) brain.stepBack = Math.random() < STEP_BACK;
  brain.history.push(op.action);
  if (brain.history.length > 60) brain.history.shift();
  if (m.phase !== "fight" || me.action === "ko") {
    input.left = input.right = input.block = false;
    return;
  }

  const seen = brain.history[Math.max(0, brain.history.length - 1 - L.react)] ?? "idle";
  const dx = op.x - me.x;
  const dist = Math.abs(dx);
  const toward = dx >= 0 ? "right" : "left";
  const away = dx >= 0 ? "left" : "right";

  const myDef = m.defs[slot];
  const opDef = m.defs[1 - slot];
  // Defend: block a threatening move it has "noticed", once per enemy attack. Melee threatens within
  // the opponent's reach; a ranged special (a beam crosses the arena, and can't be jumped) from anywhere.
  const opReach = BODY.w / 2 + Math.max(moveReach(opDef, "attack"), moveReach(opDef, "kick")) + 40;
  const threat =
    ((seen === "attack" || seen === "kick") && dist < opReach) || (seen === "special" && (SPECIAL_INFO[opDef.special].ranged || dist < 300));
  const attackId = `${op.action}:${brain.tick - op.t}`;
  if (threat && brain.reactedTo !== attackId) {
    brain.reactedTo = attackId;
    brain.guardFor = Math.random() < L.block + (m.defs[slot].cls === "Tank" ? 0.1 : 0) ? attackId : ""; // tanks guard more
    if (brain.guardFor) brain.blockUntil = brain.tick + 22;
  }
  // Hold the guard like a player would: a beam fires after its 30-tick charge, past the first 22 ticks.
  if (threat && brain.guardFor === attackId) brain.blockUntil = Math.max(brain.blockUntil, brain.tick + 2);
  // Dodge projectiles by jumping (or block if it can't).
  const incoming = m.projectiles.find((p) => p.owner !== slot && Math.sign(p.vx) === Math.sign(me.x - p.x) && Math.abs(p.x - me.x) < 230);
  if (incoming && me.grounded && brain.blockUntil < brain.tick && Math.random() < L.dodge * 0.15) {
    if (Math.random() < 0.6) input.jump++;
    else brain.blockUntil = brain.tick + 25;
  }

  const blocking = brain.blockUntil > brain.tick;
  input.block = blocking;
  if (blocking) {
    input.left = input.right = false;
    // A tank walks in behind its guard (towards a zoner, or anyone out of reach).
    if (m.defs[slot].cls === "Tank" && dist > BODY.w / 2 + moveReach(m.defs[slot], "attack")) input[toward] = true;
    return;
  }

  if (brain.tick < brain.nextThink) return;
  brain.nextThink = brain.tick + L.think + Math.floor(Math.random() * L.think);

  // Special as soon as it's useful.
  const kind = m.defs[slot].special;
  const ranged = SPECIAL_INFO[kind].ranged;
  // Teleport and meteor reach from mid-range; the rest need to be close.
  const range = ranged ? 650 : kind === "teleport" ? 400 : kind === "meteor" || kind === "spiral" ? 300 : 170;
  if (me.energy >= 100 && dist < range && Math.random() < L.aggro) {
    input.special++;
    return;
  }

  // Spacing: back off now and then when hurt.
  if (me.hp / m.defs[slot].maxHp < 0.3 && Math.random() < 0.15) brain.retreatUntil = brain.tick + 30;
  const retreat = brain.retreatUntil > brain.tick;

  // Each class spaces itself by its own reach (a sword outranges fists).
  const punchReach = BODY.w / 2 + moveReach(myDef, "attack") - 8;
  const kickReach = BODY.w / 2 + moveReach(myDef, "kick") - 8;
  const reach = Math.max(punchReach, kickReach);
  input.left = input.right = false;
  // Air: an agile fighter jumps in with a punch; once airborne it swings when in range.
  if (!me.grounded) {
    if (dist < punchReach + 20 && me.action === "idle") input.attack++;
    input[toward] = !retreat;
    return;
  }
  const cornered = away === "left" ? me.x < ARENA.wall + 90 : me.x > ARENA.w - ARENA.wall - 90;
  // Attacker: a zoner. Holds just inside its blast's reach, backs off from anyone who closes in,
  // and when cornered jumps over the opponent instead of trading weak punches.
  if (myDef.cls === "Attacker" && !retreat) {
    if (cornered && dist < BLAST_REACH - 70) {
      input[toward] = true;
      input.jump++;
    } else if (dist < BLAST_REACH - 70) input[away] = true;
    else if (dist > BLAST_REACH - 15) input[toward] = true;
    else if (me.action === "attack" || Math.random() < L.aggro) input.attack++;
    return;
  }
  // Sword: step back out of range after a chain so the answer whiffs (only if it would: a blast outranges the sword).
  const answerReach = opDef.cls === "Attacker" ? BLAST_REACH : opReach - 40;
  if (myDef.cls === "Sword" && brain.stepBack && me.action === "idle" && dist < reach && answerReach < reach) {
    input[away] = true;
    return;
  }
  if (retreat) {
    input[away] = true;
  } else if (dist > reach) {
    input[toward] = true;
    if (dist < reach + 120 && Math.random() < 0.06) input.jump++; // the same habit for every stat line: the numbers decide, not the policy
  } else if (Math.random() < L.aggro) {
    // In range: keep pressing the same button so the style's combo chains;
    // kick when only the kick reaches (or now and then).
    if (me.action === "attack" || me.action === "kick") input[me.action === "kick" ? "kick" : "attack"]++;
    else if (dist > punchReach || (dist <= kickReach && Math.random() < 0.3)) input.kick++;
    else input.attack++;
  } else if (Math.random() < 0.3) {
    input[away] = true; // feint back
  }
}
