// Computer opponent. Reads the match like a player would (with a reaction delay,
// so it isn't frame-perfect) and drives the same Input a human would send.

import { BODY, type Input, type Match, type Slot } from "./sim";

export type Level = "easy" | "normal" | "hard";

const LEVELS: Record<Level, { react: number; block: number; aggro: number; dodge: number; think: number }> = {
  easy: { react: 24, block: 0.15, aggro: 0.35, dodge: 0.2, think: 14 },
  normal: { react: 14, block: 0.42, aggro: 0.6, dodge: 0.5, think: 8 },
  hard: { react: 7, block: 0.72, aggro: 0.85, dodge: 0.8, think: 4 },
};

export type CpuBrain = {
  level: Level;
  tick: number;
  history: string[]; // opponent action per tick, for delayed reactions
  blockUntil: number;
  nextThink: number;
  reactedTo: number; // tick when the opponent's current attack started (decide to block once per attack)
  retreatUntil: number;
};

export const newBrain = (level: Level): CpuBrain => ({ level, tick: 0, history: [], blockUntil: 0, nextThink: 0, reactedTo: -1, retreatUntil: 0 });

export function cpuThink(m: Match, slot: Slot, brain: CpuBrain, input: Input) {
  const L = LEVELS[brain.level];
  const me = m.fighters[slot];
  const op = m.fighters[1 - slot];
  brain.tick++;
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

  // Defend: block a threatening move it has "noticed", once per enemy attack.
  const threat = (seen === "attack" || seen === "kick" || seen === "special") && dist < 190;
  const attackStart = brain.tick - op.t;
  if (threat && brain.reactedTo !== attackStart) {
    brain.reactedTo = attackStart;
    if (Math.random() < L.block) brain.blockUntil = brain.tick + 22;
  }
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
    return;
  }

  if (brain.tick < brain.nextThink) return;
  brain.nextThink = brain.tick + L.think + Math.floor(Math.random() * L.think);

  // Special as soon as it's useful.
  const kind = m.defs[slot].special;
  const ranged = kind === "bolt" || kind === "arrow" || kind === "orb";
  if (me.energy >= 100 && (ranged ? dist < 650 : dist < 170) && Math.random() < L.aggro) {
    input.special++;
    return;
  }

  // Spacing: back off now and then when hurt.
  if (me.hp / m.defs[slot].maxHp < 0.3 && Math.random() < 0.15) brain.retreatUntil = brain.tick + 30;
  const retreat = brain.retreatUntil > brain.tick;

  const reach = BODY.w / 2 + 70;
  input.left = input.right = false;
  if (retreat) {
    input[away] = true;
  } else if (dist > reach - 5) {
    input[toward] = true;
    if (Math.random() < 0.04) input.jump++;
  } else if (Math.random() < L.aggro) {
    // In range: mostly punches, kicks when slightly further out.
    if (dist > reach - 25 || Math.random() < 0.3) input.kick++;
    else input.attack++;
  } else if (Math.random() < 0.3) {
    input[away] = true; // feint back
  }
}
