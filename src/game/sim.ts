// Authoritative real-time fight simulation. Pure and framework-free: the game
// server steps it at TICK_HZ and broadcasts snapshots; clients only render.

export const TICK_HZ = 60;
export const ARENA = { w: 960, h: 540, ground: 480, wall: 30 };
export const BODY = { w: 70, h: 170 };

const GRAVITY = 0.75;
const ROUND_TICKS = 60 * TICK_HZ;
const INTRO_TICKS = 2.5 * TICK_HZ;
const ROUND_END_TICKS = 2.5 * TICK_HZ;
export const WINS_NEEDED = 2;

const ATTACK = { duration: 18, activeFrom: 6, activeTo: 11, reach: 70 };
const HITSTUN = 16;
const PASSIVE_ENERGY = 0.05; // per tick → a full meter in ~33s without fighting

export type Slot = 0 | 1;
export type SpecialKind = "bolt" | "arrow" | "orb" | "slash" | "charge" | "uppercut";

export type FighterStats = { hp: number; atk: number; def: number; spd: number; class: string };

// How a drawing's stats become game physics. Every stat matters in play.
export type FighterDef = {
  maxHp: number; // HP stat directly
  speed: number; // SPD → walk speed (px/tick)
  jump: number; // SPD → jump velocity
  punch: number; // ATK → base hit damage
  armor: number; // DEF → multiplier on damage taken
  blockReduce: number; // DEF → fraction of damage a block absorbs
  cooldown: number; // SPD → ticks between attacks
  special: SpecialKind;
};

const CLASS_SPECIAL: Record<string, SpecialKind> = {
  Mage: "bolt",
  Ranger: "arrow",
  Caster: "orb",
  Warrior: "slash",
  Tank: "charge",
  Brawler: "uppercut",
};

export function deriveDef(s: FighterStats): FighterDef {
  const t = (v: number) => (v - 40) / 50; // 40..90 → 0..1
  return {
    maxHp: s.hp,
    speed: 3.4 + t(s.spd) * 2.2,
    jump: 13.5 + t(s.spd) * 2.5,
    punch: 4 + t(s.atk) * 6,
    armor: 1 - t(s.def) * 0.3,
    blockReduce: 0.55 + t(s.def) * 0.35,
    cooldown: Math.round(24 - t(s.spd) * 7),
    special: CLASS_SPECIAL[s.class] ?? "uppercut",
  };
}

export type Input = {
  left: boolean;
  right: boolean;
  block: boolean;
  // Press counters, not booleans: a quick tap between two network packets still registers.
  jump: number;
  attack: number;
  special: number;
};

export const EMPTY_INPUT: Input = { left: false, right: false, block: false, jump: 0, attack: 0, special: 0 };

export type Action = "idle" | "attack" | "special" | "hit" | "ko";

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
  seen: { jump: number; attack: number; special: number };
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
  };
  emit(m, { type: "round", round: 1 });
  return m;
}

type NewEvent = GameEvent extends infer E ? (E extends GameEvent ? Omit<E, "id"> : never) : never;

function emit(m: Match, e: NewEvent) {
  m.events.push({ ...e, id: m.nextId++ } as GameEvent);
  if (m.events.length > 40) m.events.splice(0, m.events.length - 40);
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

  if (vic.hp <= 0) {
    vic.action = "ko";
    vic.t = 0;
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
  f.energy = 0;
  if (kind === "charge") f.armorTicks = 3 * TICK_HZ;
  emit(m, { type: "special", by: f.slot, kind });
}

const SPECIAL_DURATION: Record<SpecialKind, number> = { bolt: 28, arrow: 24, orb: 32, slash: 26, charge: 30, uppercut: 26 };
const PROJECTILE: Partial<Record<SpecialKind, { speed: number; r: number; mult: number }>> = {
  bolt: { speed: 10, r: 16, mult: 2.4 },
  arrow: { speed: 15, r: 10, mult: 2.0 },
  orb: { speed: 6, r: 26, mult: 2.9 },
};

function updateSpecial(m: Match, f: Fighter, opp: Fighter) {
  const kind = m.defs[f.slot].special;
  const punch = m.defs[f.slot].punch;
  const proj = PROJECTILE[kind];

  if (proj && f.t === 10) {
    m.projectiles.push({
      id: m.nextId++,
      owner: f.slot,
      kind,
      x: f.x + f.facing * (BODY.w / 2 + 10),
      y: f.y - BODY.h * 0.6,
      vx: f.facing * proj.speed,
      r: proj.r,
      dmg: punch * proj.mult,
    });
  } else if (kind === "slash" || kind === "charge") {
    if (f.t >= 4 && f.t <= 20) f.vx = f.facing * (kind === "slash" ? 15 : 11);
    const reach = BODY.w / 2 + 30;
    if (!f.landed && f.t >= 4 && f.t <= 22 && overlaps(f.x, f.x + f.facing * reach, f.y - BODY.h, f.y - 20, opp)) {
      f.landed = true;
      applyHit(m, f, opp, punch * (kind === "slash" ? 2.6 : 2.0), {
        knock: 12,
        launch: kind === "charge" ? 6 : 3,
        special: true,
        at: { x: opp.x, y: opp.y - BODY.h * 0.55 },
      });
    }
  } else if (kind === "uppercut") {
    const x1 = f.x + f.facing * (BODY.w / 2);
    if (!f.landed && f.t >= 8 && f.t <= 14 && overlaps(x1, x1 + f.facing * 80, f.y - BODY.h, f.y - 30, opp)) {
      f.landed = true;
      applyHit(m, f, opp, punch * 3, { knock: 7, launch: 15, special: true, at: { x: opp.x, y: opp.y - BODY.h * 0.7 } });
    }
  }
  if (f.t >= SPECIAL_DURATION[kind]) f.action = "idle";
}

function updateFighter(m: Match, f: Fighter, opp: Fighter, input: Input) {
  const def = m.defs[f.slot];
  const pressed = (k: "jump" | "attack" | "special") => {
    const p = input[k] !== f.seen[k];
    f.seen[k] = input[k];
    return p;
  };
  const jumpP = pressed("jump");
  const attackP = pressed("attack");
  const specialP = pressed("special");
  const canAct = m.phase === "fight";

  f.cooldown = Math.max(0, f.cooldown - 1);
  f.armorTicks = Math.max(0, f.armorTicks - 1);
  f.t++;
  f.moving = false;

  if (f.action === "hit" && f.t >= HITSTUN) f.action = "idle";
  if (f.action === "attack") {
    const x1 = f.x + f.facing * (BODY.w / 2);
    if (!f.landed && f.t >= ATTACK.activeFrom && f.t <= ATTACK.activeTo && overlaps(x1, x1 + f.facing * ATTACK.reach, f.y - BODY.h * 0.85, f.y - BODY.h * 0.3, opp)) {
      f.landed = true;
      applyHit(m, f, opp, def.punch, { knock: 6, special: false, at: { x: x1 + f.facing * ATTACK.reach * 0.7, y: f.y - BODY.h * 0.6 } });
    }
    if (f.t >= ATTACK.duration) f.action = "idle";
  }
  if (f.action === "special") updateSpecial(m, f, opp);

  if (f.action === "idle" && canAct) {
    f.facing = opp.x >= f.x ? 1 : -1;
    f.blocking = input.block && f.grounded;
    if (attackP && f.cooldown === 0 && !f.blocking) {
      f.action = "attack";
      f.t = 0;
      f.landed = false;
      f.cooldown = def.cooldown;
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
  if (!canAct || f.action === "hit" || f.action === "ko" || (f.action === "attack" && f.grounded)) f.vx *= 0.85;
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
      applyHit(m, m.fighters[p.owner], target, p.dmg, { knock: 9, launch: p.kind === "orb" ? 5 : 0, special: true, at: { x: p.x, y: p.y } });
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
    fighters: [strip(m.fighters[0]), strip(m.fighters[1])],
    maxHp: [m.defs[0].maxHp, m.defs[1].maxHp],
    specials: [m.defs[0].special, m.defs[1].special],
  };
}
