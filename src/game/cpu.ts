// Computer opponent. Reads the match like a player would (with a reaction delay,
// so it isn't frame-perfect) and drives the same Input a human would send.

import { arenaNav, cueNav, guardEdges, type NavMemory } from "./arenaNav";
import { MOVES, SLOT1_COST, SPECIAL_INFO, ULT_COST, type SpecialKind } from "./moves";
import { ARENA, BLAST_REACH, BODY, holds, moveReach, type Input, type Match, type Slot } from "./sim";

export type Level = "easy" | "normal" | "hard";

// skill: how often it uses its side skill when the moment comes. ult: how often it saves its meter for the
// ultimate (100) instead of spending half on slot 1 (50).
export type Knobs = { react: number; block: number; aggro: number; dodge: number; think: number; skill: number; ult: number };
const LEVELS: Record<Level, Knobs> = {
  easy: { react: 24, block: 0.15, aggro: 0.35, dodge: 0.2, think: 14, skill: 0, ult: 0.2 },
  normal: { react: 14, block: 0.42, aggro: 0.6, dodge: 0.5, think: 8, skill: 0.5, ult: 0.4 },
  hard: { react: 7, block: 0.72, aggro: 0.85, dodge: 0.8, think: 4, skill: 1, ult: 0.5 },
};

// How close it must be before a special is worth throwing: ranged ones from afar, the rest up close.
const RANGE: Partial<Record<SpecialKind, number>> = { teleport: 400, meteor: 300, spiral: 300, shatter: 110, counter: 170, dash_slash: 260, pull: 330, remote_detonation: 480 };
const specialRange = (kind: SpecialKind) => RANGE[kind] ?? (SPECIAL_INFO[kind].ranged ? 650 : 170);

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
  skillUse: number; // chance to use the side skill when the moment comes (scripts/balance.ts sets 0 to price a skill)
  knobs?: Partial<Knobs>; // a dungeon boss's own knobs over its level's (src/game/dungeon.ts)
  ultUse: number; // chance that it saves up for the ultimate (scripts/balance.ts sets 1 / 0 to price the ultimate)
  saving: boolean; // rolled after every special: this meter goes to the ultimate, slot 1 stays unused
  nav: NavMemory; // arena fights: the jump it is flying (src/game/arenaNav.ts)
};

export const newBrain = (level: Level, knobs?: Partial<Knobs>): CpuBrain => {
  const ult = knobs?.ult ?? LEVELS[level].ult;
  return { level, tick: 0, history: [], blockUntil: 0, nextThink: 0, reactedTo: "", guardFor: "", retreatUntil: 0, stepBack: null, skillUse: knobs?.skill ?? LEVELS[level].skill, ultUse: ult, saving: Math.random() < ult, knobs, nav: {} };
};

export function cpuThink(m: Match, slot: Slot, brain: CpuBrain, input: Input) {
  // A guided pause: walk to the mark, nothing else (src/game/arenaNav.ts).
  if (m.arena && m.phase === "cue") {
    cueNav(m, slot, m.defs[slot], brain.nav, input);
    return;
  }
  // Arena fight: hazards and the climb take over the movement when they must; otherwise it fights as usual, but never walks off a platform.
  if (m.arena && !holds(m) && m.phase === "fight" && m.fighters[slot].action !== "ko" && arenaNav(m, slot, m.defs[slot], brain.nav, input)) return;
  fight(m, slot, brain, input);
  if (m.arena && m.phase === "fight") guardEdges(m, slot, input);
}

function fight(m: Match, slot: Slot, brain: CpuBrain, input: Input) {
  const L = brain.knobs ? { ...LEVELS[brain.level], ...brain.knobs } : LEVELS[brain.level];
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
  const skillReady = me.skillCd === 0 && Math.random() < brain.skillUse;
  // Defend: block a threatening move it has "noticed", once per enemy attack. Melee threatens within
  // the opponent's reach; a ranged special (a beam crosses the arena, and can't be jumped) from anywhere.
  const opReach = BODY.w / 2 + Math.max(moveReach(opDef, "attack"), moveReach(opDef, "kick")) + 40;
  const threat =
    ((seen === "attack" || seen === "kick") && dist < opReach) || (seen === "special" && (SPECIAL_INFO[op.ult ? opDef.ult : opDef.special].ranged || dist < 300));
  const attackId = `${op.action}:${brain.tick - op.t}`;
  if (threat && brain.reactedTo !== attackId) {
    brain.reactedTo = attackId;
    brain.guardFor = Math.random() < L.block + (m.defs[slot].cls === "Tank" ? 0.1 : 0) ? attackId : ""; // tanks guard more
    // A low sweep goes under a guard: jump it instead.
    if (brain.guardFor && op.move && MOVES[op.move].low && op.action === "kick" && me.grounded) {
      brain.guardFor = "";
      input.jump++;
    }
    if (brain.guardFor) brain.blockUntil = brain.tick + 22;
    // Iron poise answers an attack: trade through it.
    if (skillReady && Math.random() < L.aggro && myDef.skill === "poise") input.skill++;
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
  // Reflect shield while guarding a melee attack; ink bubble when someone closes in or fires at it.
  if (skillReady && Math.random() < L.aggro * 0.2) {
    if (myDef.skill === "reflect" && blocking && (op.action === "attack" || op.action === "kick") && dist < opReach) input.skill++;
    if (myDef.skill === "bubble" && (dist < 150 || incoming)) input.skill++;
    // Slip-weave is a read, like a player's: it goes up when the opponent is close enough to swing, not in
    // reaction to a swing (reacting inside a 7-tick window would be frame-perfect, which no human is).
    if (myDef.skill === "weave" && !blocking && dist < opReach && op.action === "idle") input.skill++;
  }
  if (blocking) {
    input.left = input.right = false;
    // A tank walks in behind its guard (towards a zoner, or anyone out of reach).
    if (m.defs[slot].cls === "Tank" && dist > BODY.w / 2 + moveReach(m.defs[slot], "attack")) input[toward] = true;
    return;
  }

  if (brain.tick < brain.nextThink) return;
  brain.nextThink = brain.tick + L.think + Math.floor(Math.random() * L.think);

  // Specials as soon as they're useful: the ultimate (S + L) with a full meter, slot 1 from half a meter unless
  // it is saving up. Teleport and meteor reach from mid-range; the rest need to be close.
  // A counter stance is only worth taking when a swing is coming; a grab needs them on the ground.
  // It doesn't press while reeling: a player's S + L then is queued (sim.ts), the CPU just waits for its moment.
  const reelFree = me.action !== "hit";
  const worth = (kind: SpecialKind) => (kind === "counter" ? (op.action === "attack" || op.action === "kick") && dist < opReach : kind === "shatter" ? op.grounded : true);
  if (me.energy >= ULT_COST && me.grounded && reelFree && dist < specialRange(myDef.ult) && worth(myDef.ult) && Math.random() < L.aggro) {
    input.block = true;
    input.special++;
    brain.saving = Math.random() < brain.ultUse;
    return;
  }
  if (me.energy >= SLOT1_COST && !brain.saving && reelFree && dist < specialRange(myDef.special) && worth(myDef.special) && Math.random() < L.aggro) {
    input.special++;
    brain.saving = Math.random() < brain.ultUse;
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
  // Air: an agile fighter jumps in; once airborne it swings (or dive-kicks) when in range.
  if (!me.grounded) {
    if (dist < punchReach + 20 && me.action === "idle") input[Math.random() < 0.5 ? "kick" : "attack"]++;
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
    // Element blade before a swing.
    if (myDef.skill === "blade" && skillReady && Math.random() < 0.3) input.skill++;
    // In range: keep pressing the same button so the style's combo chains;
    // kick when only the kick reaches (or now and then). A turtle gets swept; the edge of range gets a roundhouse.
    if (me.action === "attack" || me.action === "kick") input[me.action === "kick" ? "kick" : "attack"]++;
    else if (op.blocking && dist <= kickReach && Math.random() < 0.3) {
      input.block = true; // down+K
      input.kick++;
    } else if (dist > punchReach || (dist <= kickReach && Math.random() < 0.3)) {
      if (dist > punchReach && Math.random() < 0.5) input[toward] = true; // toward+K
      input.kick++;
    } else input.attack++;
  } else if (Math.random() < 0.3) {
    input[away] = true; // feint back
  }
}
