// Authoritative real-time fight simulation. Pure and framework-free: the game
// server steps it at TICK_HZ and broadcasts snapshots; clients only render.

import { clampStats, HP } from "../lib/stats";
import { COMBO_WINDOW, MOVES, SPECIAL_TUNE, specialOf, STYLE_INFO, STYLE_POWER, STYLE_TUNE, styleOf, type MoveName, type SpecialKind, type Style } from "./moves";

export type { SpecialKind } from "./moves";

export const TICK_HZ = 60;
export const ARENA = { w: 960, h: 540, ground: 480, wall: 30 };
export const BODY = { w: 70, h: 170 };

const GRAVITY = 0.75;
const ROUND_TICKS = 60 * TICK_HZ;
const INTRO_TICKS = 2.5 * TICK_HZ;
const ROUND_END_TICKS = 2.5 * TICK_HZ;
export const WINS_NEEDED = 2;

const HITSTUN = 16;
const SUPER_FREEZE = 16; // dramatic pause when a special starts
const KO_SLOWMO = 54; // slow-motion ticks after a knockout blow
const PASSIVE_ENERGY = 0.05; // per tick → a full meter in ~33s without fighting

export type Slot = 0 | 1;

export type FighterStats = { hp: number; atk: number; def: number; spd: number; class: string; specialKind?: string | null; style?: string | null };

// How a drawing's stats become game physics. Every stat matters in play.
export type FighterDef = {
  maxHp: number; // HP stat directly
  speed: number; // SPD → walk speed (px/tick)
  jump: number; // SPD → jump velocity
  punch: number; // ATK → base hit damage
  armor: number; // DEF → multiplier on damage taken
  blockReduce: number; // DEF → fraction of damage a block absorbs
  cooldown: number; // SPD → ticks between combos
  tempo: number; // SPD → speed of punches/kicks (1 = normal)
  special: SpecialKind;
  style: Style;
};

export const TUNE = { DUR_SPAN: 180, SPD_COOLDOWN: 14, ATK_SPAN: 120, TEMPO_SPAN: 800 };
const { DUR_SPAN, SPD_COOLDOWN, ATK_SPAN, TEMPO_SPAN } = TUNE;

// Everyone has HP 200; the drawing only splits a fixed budget (src/lib/stats.ts), and
// old fighters are rebalanced into it here. 70 is "average" for every stat.
export function deriveDef(s: FighterStats): FighterDef {
  const f = clampStats(s);
  const t = (v: number) => (v - 40) / 60; // 40..100 → 0..1
  return {
    maxHp: HP,
    // Ranges tuned with scripts/balance.ts so a point of any stat is worth about the same.
    speed: 3 + t(f.spd) * 3.4,
    jump: 13.5 + t(f.spd) * 2.5,
    punch: 10 * (1 + (f.atk - 70) / ATK_SPAN), // a jab-to-straight lands 7-14 of 200 HP
    tempo: 1 + (f.spd - 70) / TEMPO_SPAN, // fast fighters' punches and kicks play out quicker
    armor: 1 - (f.def - 70) / DUR_SPAN, // durability: damage-taken multiplier
    blockReduce: 0.55 + t(f.def) * 0.25,
    cooldown: Math.round(26 - t(f.spd) * SPD_COOLDOWN),
    special: specialOf(s.specialKind, s.class),
    style: styleOf(s.style, s.class),
  };
}

export type Input = {
  left: boolean;
  right: boolean;
  block: boolean;
  // Press counters, not booleans: a quick tap between two network packets still registers.
  jump: number;
  attack: number; // punch
  kick: number;
  special: number;
};

export const EMPTY_INPUT: Input = { left: false, right: false, block: false, jump: 0, attack: 0, kick: 0, special: 0 };

export type Action = "idle" | "attack" | "kick" | "special" | "hit" | "ko";

export type Fighter = {
  slot: Slot;
  x: number;
  y: number; // feet
  vx: number;
  vy: number;
  facing: 1 | -1;
  grounded: boolean;
  moving: boolean;
  blocking: boolean;
  hp: number;
  energy: number;
  action: Action;
  t: number; // ticks into current action
  cooldown: number;
  armorTicks: number;
  landed: boolean; // current swing already connected
  move: MoveName | null; // which punch/kick of the style's chain
  combo: number; // index in the chain
  comboT: number; // ticks left to continue the chain
  buffer: "attack" | "kick" | null; // press made late in a move, fired when it ends
  hitN: number; // multi-hit specials: hits so far (meteor: the tick it landed)
  tempoAcc: number; // fractional ticks owed by tempo != 1
  seen: { jump: number; attack: number; kick: number; special: number };
};

export type Projectile = { id: number; owner: Slot; kind: SpecialKind; x: number; y: number; vx: number; r: number; dmg: number };

export type GameEvent =
  | { id: number; type: "hit"; x: number; y: number; dmg: number; blocked: boolean; special: boolean; by: Slot }
  | { id: number; type: "special"; by: Slot; kind: SpecialKind }
  | { id: number; type: "ko"; loser: Slot }
  | { id: number; type: "round"; round: number };

export type Phase = "intro" | "fight" | "roundEnd" | "matchEnd";

export type Match = {
  phase: Phase;
  phaseT: number;
  round: number;
  timer: number; // ticks left in round
  wins: [number, number];
  roundWinner: Slot | null; // null on draw
  matchWinner: Slot | null;
  roundReason: "ko" | "time" | null;
  fighters: [Fighter, Fighter];
  projectiles: Projectile[];
  events: GameEvent[]; // recent, capped; clients dedupe by id
  nextId: number;
  defs: [FighterDef, FighterDef];
  // Totals for the battle record.
  damage: [number, number];
  freeze: number; // hit-stop: ticks the whole fight holds still on impact
  slow: number; // slow-motion ticks after a KO
};

function spawn(slot: Slot, def: FighterDef, seen: Fighter["seen"]): Fighter {
  return {
    slot,
    x: slot === 0 ? ARENA.w * 0.28 : ARENA.w * 0.72,
    y: ARENA.ground,
    vx: 0,
    vy: 0,
    facing: slot === 0 ? 1 : -1,
    grounded: true,
    moving: false,
    blocking: false,
    hp: def.maxHp,
    energy: 0,
    action: "idle",
    t: 0,
    cooldown: 0,
    armorTicks: 0,
    landed: false,
    move: null,
    combo: 0,
    comboT: 0,
    buffer: null,
    hitN: 0,
    tempoAcc: 0,
    seen: { ...seen },
  };
}

export function createMatch(a: FighterStats, b: FighterStats, inputs: [Input, Input]): Match {
  const defs: [FighterDef, FighterDef] = [deriveDef(a), deriveDef(b)];
  const m: Match = {
    phase: "intro",
    phaseT: 0,
    round: 1,
    timer: ROUND_TICKS,
    wins: [0, 0],
    roundWinner: null,
    matchWinner: null,
    roundReason: null,
    fighters: [spawn(0, defs[0], inputs[0]), spawn(1, defs[1], inputs[1])],
    projectiles: [],
    events: [],
    nextId: 1,
    defs,
    damage: [0, 0],
    freeze: 0,
    slow: 0,
  };
  emit(m, { type: "round", round: 1 });
  return m;
}

type NewEvent = GameEvent extends infer E ? (E extends GameEvent ? Omit<E, "id"> : never) : never;

function emit(m: Match, e: NewEvent) {
  m.events.push({ ...e, id: m.nextId++ } as GameEvent);
  if (m.events.length > 16) m.events.splice(0, m.events.length - 16); // sent 60×/s, so keep it small
}

const overlaps = (ax1: number, ax2: number, ay1: number, ay2: number, b: Fighter) =>
  Math.max(ax1, ax2) > b.x - BODY.w / 2 &&
  Math.min(ax1, ax2) < b.x + BODY.w / 2 &&
  ay2 > b.y - BODY.h &&
  ay1 < b.y;

function applyHit(
  m: Match,
  att: Fighter,
  vic: Fighter,
  raw: number,
  opts: { knock: number; launch?: number; special: boolean; at: { x: number; y: number } },
) {
  if (vic.action === "ko" || m.phase !== "fight") return;
  // Mid-teleport the body isn't there.
  if (vic.action === "special" && m.defs[vic.slot].special === "teleport" && vic.t >= 3 && vic.t < 12) return;
  const dir = vic.x >= att.x ? 1 : -1;
  const facingAttacker = vic.facing === -dir;
  const blocked = vic.blocking && facingAttacker;
  const def = m.defs[vic.slot];

  let dmg = raw * def.armor;
  if (vic.armorTicks > 0) dmg *= 0.5;
  // Specials punch through a block harder than normal hits.
  if (blocked) dmg *= 1 - def.blockReduce * (opts.special ? 0.6 : 1);
  const dealt = Math.max(1, Math.round(dmg));

  vic.hp = Math.max(0, vic.hp - dealt);
  m.damage[att.slot] += dealt;
  att.energy = Math.min(100, att.energy + (blocked ? 5 : 12));
  vic.energy = Math.min(100, vic.energy + 7);

  if (blocked) {
    vic.vx = dir * opts.knock * 0.4;
  } else {
    vic.action = "hit";
    vic.t = 0;
    vic.vx = dir * opts.knock;
    if (opts.launch) {
      vic.vy = -opts.launch;
      vic.grounded = false;
    }
  }
  emit(m, { type: "hit", x: opts.at.x, y: opts.at.y, dmg: dealt, blocked, special: opts.special, by: att.slot });
  // Hit-stop sells the impact: bigger hits hold a little longer.
  m.freeze = Math.max(m.freeze, blocked ? 2 : opts.special ? 6 : Math.min(6, 2 + Math.round(dealt / 4)));

  if (vic.hp <= 0) {
    vic.action = "ko";
    vic.t = 0;
    m.slow = KO_SLOWMO;
    endRound(m, att.slot, "ko");
  }
}

function endRound(m: Match, winner: Slot | null, reason: "ko" | "time") {
  m.phase = "roundEnd";
  m.phaseT = 0;
  m.roundWinner = winner;
  m.roundReason = reason;
  if (winner !== null) {
    m.wins[winner]++;
    emit(m, { type: "ko", loser: (1 - winner) as Slot });
  }
}

function startSpecial(m: Match, f: Fighter) {
  const kind = m.defs[f.slot].special;
  f.action = "special";
  f.t = 0;
  f.landed = false;
  f.hitN = 0;
  f.energy = 0;
  if (kind === "charge") f.armorTicks = 3 * TICK_HZ;
  m.freeze = Math.max(m.freeze, SUPER_FREEZE);
  emit(m, { type: "special", by: f.slot, kind });
}

export const SPECIAL_DURATION: Record<SpecialKind, number> = {
  bolt: 28, arrow: 24, orb: 32, slash: 26, charge: 30, uppercut: 26,
  beam: 72, spiral: 44, wave: 34, teleport: 32, barrage: 50, meteor: 70,
};
// Beam timing, shared with the renderer and poses.
export const BEAM = { fireFrom: 30, fireTo: 62, every: 8 };
const PROJECTILE: Partial<Record<SpecialKind, { speed: number; r: number; mult: number; at: number; low?: boolean }>> = {
  bolt: { speed: 10, r: 16, mult: 2.4, at: 10 },
  arrow: { speed: 15, r: 10, mult: 2.6, at: 10 },
  orb: { speed: 6, r: 26, mult: 2.9, at: 10 },
  wave: { speed: 9, r: 24, mult: 2.4, at: 14, low: true },
};

function updateSpecial(m: Match, f: Fighter, opp: Fighter) {
  const kind = m.defs[f.slot].special;
  const punch = m.defs[f.slot].punch * SPECIAL_TUNE[kind];
  const proj = PROJECTILE[kind];
  const t = f.t;
  const front = (reach: number, top = 1, bot = 0.15) => {
    const x1 = f.x + f.facing * (BODY.w / 2);
    return overlaps(x1 - f.facing * 20, x1 + f.facing * reach, f.y - BODY.h * top, f.y - BODY.h * bot, opp);
  };
  const hit = (mult: number, knock: number, launch = 0, y = 0.55) =>
    applyHit(m, f, opp, punch * mult, { knock, launch, special: true, at: { x: opp.x - f.facing * 20, y: opp.y - BODY.h * y } });

  if (proj) {
    if (t === proj.at) {
      m.projectiles.push({
        id: m.nextId++,
        owner: f.slot,
        kind,
        x: f.x + f.facing * (BODY.w / 2 + 10),
        y: proj.low ? f.y - proj.r : f.y - BODY.h * 0.6,
        vx: f.facing * proj.speed,
        r: proj.r,
        dmg: punch * proj.mult,
      });
    }
  } else if (kind === "slash" || kind === "charge") {
    if (t >= 4 && t <= 20) f.vx = f.facing * (kind === "slash" ? 15 : 11);
    if (!f.landed && t >= 4 && t <= 22 && front(30, 1, 0.12)) {
      f.landed = true;
      hit(kind === "slash" ? 2.6 : 2.0, 12, kind === "charge" ? 6 : 3);
    }
  } else if (kind === "uppercut") {
    if (!f.landed && t >= 8 && t <= 14 && front(80, 1, 0.18)) {
      f.landed = true;
      hit(3, 7, 15, 0.7);
    }
  } else if (kind === "beam") {
    f.vx = 0;
    // Charge, then a beam to the edge of the arena that hits every few ticks.
    if (t >= BEAM.fireFrom && t <= BEAM.fireTo && (t - BEAM.fireFrom) % BEAM.every === 0) {
      const x1 = f.x + f.facing * (BODY.w / 2);
      if (overlaps(x1, f.facing > 0 ? ARENA.w : 0, f.y - BODY.h * 0.8, f.y - BODY.h * 0.35, opp)) {
        f.hitN++;
        const last = t + BEAM.every > BEAM.fireTo;
        hit(0.85, last ? 15 : 3, last ? 6 : 0, 0.6);
      }
    }
  } else if (kind === "spiral") {
    f.vx = t >= 16 && t <= 34 ? f.facing * 14 : 0;
    if (!f.landed && t >= 16 && t <= 36 && front(40, 0.85, 0.3)) {
      f.landed = true;
      hit(3, 16, 9);
    }
  } else if (kind === "teleport") {
    if (t === 10) {
      // Reappear behind the opponent (or in front, if their back is to a wall).
      const lo = ARENA.wall + BODY.w / 2, hi = ARENA.w - ARENA.wall - BODY.w / 2;
      let x = opp.x - opp.facing * 75;
      if (x < lo || x > hi) x = opp.x + opp.facing * 75;
      f.x = Math.min(hi, Math.max(lo, x));
      f.facing = opp.x >= f.x ? 1 : -1;
      f.vx = 0;
    }
    if (!f.landed && t >= 13 && t <= 20 && front(80, 0.9, 0.3)) {
      f.landed = true;
      hit(2.6, 12, 7);
    }
  } else if (kind === "barrage") {
    f.vx = f.facing * 1.2;
    if (t >= 6 && t < 42 && t % 4 === 2 && front(85, 0.9, 0.35)) {
      f.hitN++;
      hit(0.26, 1.5);
      opp.vx = f.facing * 1.2; // keep them in front of the fists
    }
    if (!f.landed && t === 44 && front(85, 0.9, 0.3)) {
      f.landed = true;
      hit(1.0, 15, 6);
    }
  } else if (kind === "meteor") {
    if (t === 1) {
      f.vy = -16;
      f.vx = f.facing * 6;
      f.grounded = false;
    }
    if (t > 14 && !f.grounded) {
      f.vy = Math.max(f.vy, 20);
      f.vx = f.facing * 8;
      if (!f.landed && overlaps(f.x - 40, f.x + 40, f.y - BODY.h * 0.6, f.y + 10, opp)) {
        f.landed = true;
        hit(3, 12, 10, 0.4);
      }
    }
    if (t > 14 && f.grounded && f.hitN === 0) {
      f.hitN = t; // touched down: crater shockwave
      f.vx = 0;
      if (!f.landed && opp.grounded && Math.abs(opp.x - f.x) < 140) {
        f.landed = true;
        hit(1.6, 10, 6, 0.2);
      }
    }
    if ((f.hitN && t >= f.hitN + 12) || t >= SPECIAL_DURATION.meteor) f.action = "idle";
    return;
  }
  if (t >= SPECIAL_DURATION[kind]) f.action = "idle";
}

const chainOf = (def: FighterDef, type: "attack" | "kick") => STYLE_INFO[def.style][type === "attack" ? "punch" : "kick"];

// Start the next punch/kick of this fighter's style, continuing the chain if it's still open.
function startMove(f: Fighter, def: FighterDef, type: "attack" | "kick") {
  const chain = chainOf(def, type);
  const cont = f.comboT > 0 && f.move !== null && chain.includes(f.move);
  f.combo = cont ? (f.combo + 1) % chain.length : 0;
  f.move = chain[f.combo];
  f.action = type;
  f.t = 0;
  f.landed = false;
  f.buffer = null;
  const mv = MOVES[f.move];
  if (mv.hop && f.grounded) {
    f.vy = -mv.hop;
    f.vx = f.facing * mv.lunge * 1.4;
    f.grounded = false;
  }
}

function updateFighter(m: Match, f: Fighter, opp: Fighter, input: Input) {
  const def = m.defs[f.slot];
  const pressed = (k: "jump" | "attack" | "kick" | "special") => {
    const now = input[k] ?? 0;
    const p = now !== (f.seen[k] ?? 0);
    f.seen[k] = now;
    return p;
  };
  const jumpP = pressed("jump");
  const attackP = pressed("attack");
  const kickP = pressed("kick");
  const specialP = pressed("special");
  const canAct = m.phase === "fight";

  f.cooldown = Math.max(0, f.cooldown - 1);
  f.comboT = Math.max(0, f.comboT - 1);
  f.armorTicks = Math.max(0, f.armorTicks - 1);
  f.t++;
  // Tempo: a fast fighter's punch/kick sometimes skips a tick, a slow one's sometimes holds.
  if (f.action === "attack" || f.action === "kick") {
    f.tempoAcc += def.tempo - 1;
    if (f.tempoAcc >= 1) {
      f.t++;
      f.tempoAcc--;
    } else if (f.tempoAcc <= -1) {
      f.t--;
      f.tempoAcc++;
    }
  }
  f.moving = false;

  if (f.action === "hit" && f.t >= HITSTUN) f.action = "idle";
  if ((f.action === "attack" || f.action === "kick") && f.move) {
    const type = f.action;
    const mv = MOVES[f.move];
    const x1 = f.x + f.facing * (BODY.w / 2);
    if (f.t >= mv.from && f.t <= mv.to && f.grounded) f.vx = f.facing * mv.lunge;
    const chain = chainOf(def, type);
    const finisher = chain.length > 1 && f.combo === chain.length - 1;
    if (!f.landed && f.t >= mv.from && f.t <= mv.to && overlaps(x1, x1 + f.facing * mv.reach, f.y - BODY.h * mv.top, f.y - BODY.h * mv.bot, opp)) {
      f.landed = true;
      applyHit(m, f, opp, def.punch * mv.mult * STYLE_POWER[def.style][type === "attack" ? "punch" : "kick"] * STYLE_TUNE[def.style] * (finisher ? 1.15 : 1), {
        knock: mv.knock * (finisher ? 1.4 : 1),
        launch: mv.launch,
        special: false,
        at: { x: x1 + f.facing * mv.reach * 0.7, y: f.y - (BODY.h * (mv.top + mv.bot)) / 2 },
      });
    }
    // A press after the hit frames is buffered, so the chain flows without frame-perfect timing.
    if ((attackP || kickP) && f.t > mv.to) f.buffer = attackP ? "attack" : "kick";
    if (f.t >= mv.dur) {
      const last = f.combo === chain.length - 1;
      f.action = "idle";
      f.comboT = last ? 0 : COMBO_WINDOW;
      f.cooldown = last ? def.cooldown : Math.round(def.cooldown * 0.3);
      if (f.buffer && canAct && !last && (f.buffer === "attack" || f.grounded)) {
        const next = f.buffer;
        f.cooldown = 0;
        f.facing = opp.x >= f.x ? 1 : -1;
        startMove(f, def, next);
      }
      f.buffer = null;
    }
  }
  if (f.action === "special") updateSpecial(m, f, opp);

  if (f.action === "idle" && canAct) {
    f.facing = opp.x >= f.x ? 1 : -1;
    f.blocking = input.block && f.grounded;
    if (attackP && f.cooldown === 0 && !f.blocking) {
      startMove(f, def, "attack");
    } else if (kickP && f.cooldown === 0 && !f.blocking && f.grounded) {
      startMove(f, def, "kick");
    } else if (specialP && f.energy >= 100 && !f.blocking) {
      startSpecial(m, f);
    } else {
      const dir = (input.right ? 1 : 0) - (input.left ? 1 : 0);
      if (f.grounded) f.vx = f.blocking ? 0 : dir * def.speed;
      else f.vx += dir * 0.3; // a little air control
      f.moving = dir !== 0 && !f.blocking;
      if (jumpP && f.grounded && !f.blocking) {
        f.vy = -def.jump;
        f.grounded = false;
      }
    }
  } else {
    f.blocking = false;
  }

  // Physics
  if (!canAct || f.action === "hit" || f.action === "ko" || ((f.action === "attack" || f.action === "kick") && f.grounded)) f.vx *= 0.85;
  f.vy += GRAVITY;
  f.x += f.vx;
  f.y += f.vy;
  if (f.y >= ARENA.ground) {
    f.y = ARENA.ground;
    f.vy = 0;
    f.grounded = true;
  } else {
    f.grounded = false;
  }
  f.x = Math.min(ARENA.w - ARENA.wall - BODY.w / 2, Math.max(ARENA.wall + BODY.w / 2, f.x));
  if (canAct) f.energy = Math.min(100, f.energy + PASSIVE_ENERGY);
}

function separate(a: Fighter, b: Fighter) {
  const dx = b.x - a.x;
  const overlapX = BODY.w * 0.8 - Math.abs(dx);
  const vertical = Math.abs(a.y - b.y) < BODY.h * 0.6;
  if (overlapX > 0 && vertical) {
    const push = (overlapX / 2) * (dx >= 0 ? 1 : -1);
    a.x -= push;
    b.x += push;
  }
}

function resetRound(m: Match) {
  const [a, b] = m.fighters;
  m.fighters = [spawn(0, m.defs[0], a.seen), spawn(1, m.defs[1], b.seen)];
  m.projectiles = [];
  m.round++;
  m.timer = ROUND_TICKS;
  m.phase = "intro";
  m.phaseT = 0;
  m.roundWinner = null;
  m.roundReason = null;
  emit(m, { type: "round", round: m.round });
}

export function step(m: Match, inputs: [Input, Input]) {
  if (m.phase === "matchEnd") return;
  // KO slow-motion: only every third tick advances. Hit-stop: everything holds still.
  // Presses made meanwhile aren't lost: they're counters, read on the next real tick.
  if (m.slow > 0) {
    m.slow--;
    if (m.slow % 3 !== 0) return;
  }
  if (m.freeze > 0) {
    m.freeze--;
    return;
  }
  m.phaseT++;

  if (m.phase === "intro" && m.phaseT >= INTRO_TICKS) {
    m.phase = "fight";
    m.phaseT = 0;
  }

  const [a, b] = m.fighters;
  // During intro/roundEnd, inputs are still consumed (so stale presses don't fire later) but ignored.
  updateFighter(m, a, b, inputs[0]);
  updateFighter(m, b, a, inputs[1]);
  separate(a, b);

  for (const p of m.projectiles) {
    p.x += p.vx;
    const target = m.fighters[1 - p.owner];
    if (overlaps(p.x - p.r, p.x + p.r, p.y - p.r, p.y + p.r, target)) {
      applyHit(m, m.fighters[p.owner], target, p.dmg, { knock: 9, launch: p.kind === "orb" ? 5 : p.kind === "wave" ? 9 : 0, special: true, at: { x: p.x, y: p.y } });
      p.x = -9999; // consumed
    }
  }
  m.projectiles = m.projectiles.filter((p) => p.x > -100 && p.x < ARENA.w + 100);

  if (m.phase === "fight") {
    m.timer--;
    if (m.timer <= 0) {
      const fa = a.hp / m.defs[0].maxHp;
      const fb = b.hp / m.defs[1].maxHp;
      endRound(m, fa === fb ? null : fa > fb ? 0 : 1, "time");
    }
  } else if (m.phase === "roundEnd" && m.phaseT >= ROUND_END_TICKS) {
    const champ = m.wins[0] >= WINS_NEEDED ? 0 : m.wins[1] >= WINS_NEEDED ? 1 : null;
    if (champ !== null) {
      m.phase = "matchEnd";
      m.matchWinner = champ;
    } else {
      resetRound(m);
    }
  }
}

// What goes over the wire (defs/seen are server-only details).
export type Snapshot = Omit<Match, "defs" | "nextId" | "fighters"> & {
  fighters: [Omit<Fighter, "seen">, Omit<Fighter, "seen">];
  maxHp: [number, number];
  specials: [SpecialKind, SpecialKind];
  styles: [Style, Style];
};

export function snapshot(m: Match): Snapshot {
  const strip = (f: Fighter): Omit<Fighter, "seen"> => {
    const copy: Partial<Fighter> = { ...f };
    delete copy.seen;
    return copy as Omit<Fighter, "seen">;
  };
  return {
    phase: m.phase,
    phaseT: m.phaseT,
    round: m.round,
    timer: m.timer,
    wins: m.wins,
    roundWinner: m.roundWinner,
    matchWinner: m.matchWinner,
    roundReason: m.roundReason,
    projectiles: m.projectiles,
    events: m.events,
    damage: m.damage,
    freeze: m.freeze,
    slow: m.slow,
    fighters: [strip(m.fighters[0]), strip(m.fighters[1])],
    maxHp: [m.defs[0].maxHp, m.defs[1].maxHp],
    specials: [m.defs[0].special, m.defs[1].special],
    styles: [m.defs[0].style, m.defs[1].style],
  };
}

// Rebuild a running match from the last snapshot a guest saw, so the fight can go on
// in the guest's browser when the host leaves. Inputs start "already seen", so nothing
// held at that moment fires twice.
export function resumeMatch(s: Snapshot, a: FighterStats, b: FighterStats, inputs: [Input, Input]): Match {
  const m = createMatch(a, b, inputs);
  Object.assign(m, {
    phase: s.phase,
    phaseT: s.phaseT,
    round: s.round,
    timer: s.timer,
    wins: [...s.wins],
    roundWinner: s.roundWinner,
    matchWinner: s.matchWinner,
    roundReason: s.roundReason,
    damage: [...s.damage],
    projectiles: s.projectiles.map((p) => ({ ...p })),
    events: [],
  });
  m.fighters = [0, 1].map((i) => ({ ...s.fighters[i], seen: { jump: inputs[i].jump, attack: inputs[i].attack, kick: inputs[i].kick, special: inputs[i].special } })) as [Fighter, Fighter];
  m.nextId = Math.max(0, ...s.events.map((e) => e.id), ...s.projectiles.map((p) => p.id)) + 1;
  return m;
}
