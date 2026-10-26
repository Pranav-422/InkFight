// How each dungeon boss plays, the way its inspiration would (the one-identity rule, docs/changes/sprint-8-bosses.md). The generic brain in cpu.ts
// still defends (blocks a threat it has noticed, hops projectiles) and throws specials when they are worth it; a persona takes over the rest:
// where to stand, when to walk in, which button to press. It returns true when it has decided the tick.
// Nothing here is used by a player's computer opponent: a persona is set only through a boss's BossRun (src/game/dungeon.ts).

import type { CpuBrain, Knobs } from "./cpu";
import { SLOT1_COST } from "./moves";
import { BODY, moveReach, TIME_STOP, type Fighter, type Input, type Match, type Slot } from "./sim";

export const PERSONA_IDS = ["brawler", "grappler", "boxer", "counterer", "sheathed", "swordsman", "poker", "zoner", "charger", "timekeeper"] as const;
export type PersonaId = (typeof PERSONA_IDS)[number];

export type AiCtx = {
  m: Match;
  slot: Slot;
  me: Fighter;
  op: Fighter;
  input: Input;
  brain: CpuBrain;
  L: Knobs;
  dist: number;
  toward: "left" | "right";
  away: "left" | "right";
  punchReach: number; // centre-to-centre distance at which its punches land
  kickReach: number;
  reach: number; // the longer of the two
  cornered: boolean;
};

// Presses the button that continues a string it is in the middle of, else starts one. `kick`: how often a fresh swing is a kick.
function swing(c: AiCtx, kick = 0) {
  const { me, input, dist, kickReach } = c;
  if (me.action === "attack") input.attack++;
  else if (me.action === "kick") input.kick++;
  else if (kick > 0 && dist <= kickReach && Math.random() < kick) input.kick++;
  else input.attack++;
}

// Walks in until a swing reaches, then swings. `aggro`: how often it starts a string when it is in range.
function press(c: AiCtx, kick = 0) {
  if (c.dist > c.reach) c.input[c.toward] = true;
  else if (c.me.action === "attack" || c.me.action === "kick" || Math.random() < c.L.aggro) swing(c, kick);
}

// Reflexes: what a persona does the instant the moment comes, not at the next think (a counter has to start before the blow lands, a draw is only a
// draw if it is fast). Returns true when it has pressed something.
export const REFLEXES: Partial<Record<PersonaId, (c: AiCtx) => boolean>> = {
  // Pale Ogre: the moment a swing starts that would reach him, he takes the counter stance (once per swing).
  counterer: (c) => {
    const { me, op, m, slot, dist, brain, input } = c;
    if ((op.action !== "attack" && op.action !== "kick") || me.action !== "idle" || me.energy < SLOT1_COST) return false;
    const id = hash(`${op.action}:${brain.tick - op.t}`); // (the tick the swing began)
    if (brain.ps.swingId === id) return false; // already looked at this one
    brain.ps.swingId = id;
    if (dist > BODY.w / 2 + moveReach(m.defs[1 - slot], op.action) + 10 || Math.random() > 0.9) return false;
    input.special++;
    return true;
  },
  // Yellow Streak: armed and you are inside his dash: he draws at once.
  sheathed: (c) => {
    const { me, dist, input } = c;
    if (me.action !== "idle" || (me.pv.still ?? 0) < 20 || dist > DASH || me.cooldown > 0) return false;
    input.attack++;
    return true;
  },
};
const hash = (s: string) => [...s].reduce((h, ch) => (Math.imul(h, 31) + ch.charCodeAt(0)) | 0, 7);
const DASH = 215; // Yellow Streak's draw reaches about this far

export const PERSONAS: Record<PersonaId, (c: AiCtx) => boolean> = {
  // Brass Shin: walks you down and throws whatever is nearest, kicks most of all. Never backs off, never hops.
  brawler: (c) => {
    press(c, 0.7);
    return true;
  },

  // Crosshatch: closes in like a brawler, and the moment you turtle he takes hold (a grab goes under a guard).
  grappler: (c) => {
    if (c.dist < 110 && c.op.blocking && c.op.grounded && c.me.energy >= SLOT1_COST && c.me.cooldown === 0 && c.me.action === "idle") c.input.special++;
    else press(c, 0.25);
    return true;
  },

  // Pip Punchline: punches only. Bobs in and out at the edge of range on a beat, then steps into a string.
  boxer: (c) => {
    const { input, dist, brain, toward, away, punchReach, me } = c;
    if (dist > punchReach + 60) input[toward] = true;
    else if (me.action === "attack") input.attack++;
    else if (dist > punchReach - 4) input[Math.floor(brain.tick / 16) % 2 === 0 ? toward : away] = true; // the bob
    else if (Math.random() < c.L.aggro) input.attack++;
    return true;
  },

  // Pale Ogre: holds a little outside his own reach and waits for you. A swing is answered with the counter stance (his reflex above); a recovery or a
  // hit-stun is punished with a string; now and then, when you are close, he starts one himself; if nothing happens for a while he steps in.
  counterer: (c) => {
    const { me, op, input, dist, brain, toward, punchReach, reach } = c;
    const hold = punchReach + 22;
    const swinging = op.action === "attack" || op.action === "kick";
    const opening = op.action === "hit" || (op.action === "idle" && op.cooldown > 6);
    if (dist <= reach && !swinging && (opening || Math.random() < 0.3)) swing(c, 0.4);
    else if (dist > hold + 18) input[toward] = true;
    else if (dist < punchReach - 14 && !opening) input[c.away] = true; // a hair too close: set his feet again
    if (swinging || op.action === "hit") brain.ps.calm = brain.tick;
    else if (brain.tick - (brain.ps.calm ?? 0) > 100 && me.action === "idle") {
      brain.ps.calm = brain.tick;
      if (dist <= reach + 40) input.attack++; // the test
      else input[toward] = true;
    }
    return true;
  },

  // Yellow Streak: stands absolutely still (walking breaks the stillness that arms the blade). Armed, and with you inside his dash, he draws once and
  // is still again. If nobody comes for three seconds he walks in until he is in range, then stands.
  sheathed: (c) => {
    const { me, op, input, dist, brain, toward } = c;
    input.left = input.right = false;
    if (me.action !== "idle") {
      brain.ps.wait = 0;
      return true;
    }
    if ((me.pv.still ?? 0) >= 20 && dist <= DASH && me.cooldown === 0 && !(op.action === "special" && op.ult)) {
      input.attack++;
      brain.ps.wait = 0;
    } else if (dist > DASH + 30) {
      brain.ps.wait = (brain.ps.wait ?? 0) + 1;
      if (brain.ps.wait > 180) input[toward] = true;
    } else brain.ps.wait = 0;
    return true;
  },

  // Triple Nib: relentless. Pressure with the three-sword chain, no stepping back, almost no kicks; against a guard he cuts from behind (his special).
  swordsman: (c) => {
    if (c.op.blocking && c.dist < 200 && c.me.energy >= SLOT1_COST && c.me.cooldown === 0 && c.me.action === "idle" && Math.random() < 0.5) c.input.special++;
    else press(c, 0.08);
    return true;
  },

  // Rubber Bo: fights at the very end of his reach. Pokes from there, backs off when you crowd him (unless he is cornered), kicks when you are close.
  poker: (c) => {
    const { me, op, input, dist, away, cornered } = c;
    const poke = BODY.w / 2 + 135;
    if (dist > poke) input[c.toward] = true;
    else if (dist < BODY.w / 2 + 62 && !cornered && op.action !== "hit" && me.action === "idle") {
      input[away] = true;
      if (dist < BODY.w / 2 + 48 && Math.random() < 0.12) input.kick++; // the whip kick to make room
    } else if (me.action === "attack" || me.action === "kick" || Math.random() < c.L.aggro) swing(c, dist < BODY.w / 2 + 80 ? 0.25 : 0);
    return true;
  },

  // Asymptote: an Attacker already zones (cpu.ts holds the edge of its blast's reach and backs off from anyone who closes in), so the class's own
  // brain plays him; the persona only has to say so. Pull and the purple beam are thrown by the brain's specials.
  zoner: () => false,

  // Saffron Spike: while you are far away he stands and gathers ki (his passive fills the meter three times faster while he does); close, he fights
  // the way his school does. The beam is thrown from range by the brain as usual.
  charger: (c) => {
    const { me, op, input, dist } = c;
    if (dist > 300 && me.energy < 100 && me.action === "idle" && op.action !== "special") {
      input.left = input.right = false;
      return true;
    }
    press(c, 0.35);
    return true;
  },

  // The Overdue: knives from afar (the brain), a rush of jabs up close. With the meter full he closes to inside the stop's reach and stands there.
  timekeeper: (c) => {
    const { me, input, dist, toward } = c;
    if (me.energy >= 100 && dist > TIME_STOP.range - 25) input[toward] = true;
    else press(c, 0.2);
    return true;
  },
};
