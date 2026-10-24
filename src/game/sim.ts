// Authoritative real-time fight simulation. Pure and framework-free: the game
// server steps it at TICK_HZ and broadcasts snapshots; clients only render.

import { clampStats, ELEMENTS, HP, normClass, type CharacterClass } from "../lib/stats";
import { CLASS_CHAIN, CLASS_CHAIN_POWER, CLASS_TUNE, COMBO_WINDOW, ELEMENT_TUNE, itemOf, MOVES, SKILL_INFO, skillOf, SKILL_TUNE, SLOT1_COST, SPECIAL_INFO, SPECIAL_TUNE, specialOf, STYLE_INFO, STYLE_POWER, STYLE_TUNE, styleOf, ULT_COST, ultOf, type MoveName, type SideSkill, type SpecialKind, type Style } from "./moves";

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
const SUPER_FREEZE = 16; // dramatic pause when an ultimate starts
const SLOT1_FREEZE = 6; // the first special is quick: it must not stall the fight
const KO_SLOWMO = 54; // slow-motion ticks after a knockout blow
const PASSIVE_ENERGY = 0.05; // per tick → a full meter in ~33s without fighting
const BLAST = { speed: 9, r: 10, range: 110 }; // Attacker punch projectile
// Ultimate hit-lock: the first unblocked hit holds the opponent `gap` px in front of the attacker for `ticks`
// (echo hits every `every` ticks), and the end launches them. Beam and barrage already hit several times, so they
// hold for their own length instead.
export const LOCK = { gap: 60, ticks: 42, every: 7, launch: 12 };
const MULTI_HIT: SpecialKind[] = ["beam", "barrage"];

export type Slot = 0 | 1;

// agi/iq/element/item: InkFight 2.0 (src/lib/stats.ts); missing on old data → 70 / NONE / class item.
export type FighterStats = {
  hp: number; atk: number; def: number; spd: number; agi?: number; iq?: number;
  class: string; specialKind?: string | null; ultKind?: string | null; style?: string | null; element?: string | null; item?: string | null; sideSkill?: string | null; buff?: boolean;
};

// How a drawing's stats become game physics. Every stat matters in play.
export type FighterDef = {
  maxHp: number; // HP stat directly
  speed: number; // SPD → walk speed (px/tick)
  jump: number; // AGI → jump velocity
  air: number; // AGI → air control (px/tick² of drift while airborne)
  stun: number; // AGI → ticks of hit-stun (agile fighters recover sooner)
  punch: number; // STR → physical damage per unit of move power, vs a 70-DUR target
  magic: number; // IQ → the same for magic hits (blast and ranged specials)
  armor: number; // DUR → multiplier on damage taken, vs a 70-STR attacker
  blockReduce: number; // DUR → fraction of damage a block absorbs
  cooldown: number; // SPD → ticks between combos
  tempo: number; // SPD → speed of punches/kicks (1 = normal)
  energyMul: number; // IQ (and Attacker) → faster special meter
  dodge: number; // AGI → chance to slip a normal hit (not while reeling or airborne)
  crit: number; // IQ → chance that a chain finisher is an Ink Flash (×1.5 damage)
  special: SpecialKind; // slot 1 (L)
  ult: SpecialKind; // slot 2 (S + L)
  skill: SideSkill;
  skillCd: number; // IQ → ticks between side skills
  style: Style;
  cls: CharacterClass;
  item: string;
  element: string; // one of ELEMENTS
};

// Spans per stat (see scripts/balance.ts: one stat alone should win 50-60% against an all-70 fighter).
export const TUNE = { SPEED_SPAN: 3, AGI_SPEED: 1, STR_EXP: 1.2093, DUR_EXP: 0.9269, IQ_EXP: 1.8058, SPD_COOLDOWN: 8, TEMPO_GAIN: 0.0047, JUMP_SPAN: 6, AIR_SPAN: 0.5, STUN_SPAN: 8, BLOCK_SPAN: 0.05, IQ_ENERGY: 0.01, DODGE_SPAN: 0.4648 };
// Class traits (see the class list in src/lib/stats.ts), tuned with scripts/balance.ts like TUNE.
export const TRAIT = { SWORD_REACH: 20, MACE_STUN: 6, TANK_BLOCK: 0.7, TANK_PUSH: 6, TANK_GUARD_WALK: 0.4, MACE_ARMOR_LEAD: 2, MACE_BREAK: 0.625, ATTACKER_ENERGY: 1, SPECIAL_IQ: 1, BACKWALK: 0.8, MACE_POISE: 0, BLAST_MULT: 0.6, FIGHTER_TEMPO: 1.15, BLADE: 1.15, BUBBLE_PUSH: 7, BUBBLE_HITS: 2, REFLECT: 0.5, SLOT1_SCALE: 0.55, ULT_SCALE: 1, ECHO_MULT: 0.35, FINALE_MULT: 1 };
// Admin buff (set by the server, see buffOn in src/lib/auth.ts): deals more, takes less.
const BUFF = { dealt: 1.3, taken: 0.75 };

// Everyone has HP 200; the drawing only splits a fixed budget (src/lib/stats.ts), and
// old fighters are rebalanced into it here. 70 is "average" for every stat.
export function deriveDef(s: FighterStats): FighterDef {
  const f = clampStats(s);
  const t = (v: number) => (v - 40) / 60; // 40..100 → 0..1
  const cls = normClass(s.class);
  const buff = s.buff ? BUFF : { dealt: 1, taken: 1 };
  // Damage = move power × (attacker STR or IQ / 70)^E ÷ (defender DUR / 70)^E, one exponent per stat so the
  // tuner can price each on its own (DUR guards against everything, STR only boosts normals). TUNE is read live.
  const ratio = (v: number, e: number) => Math.pow(v / 70, e);
  const base = 10 * buff.dealt * (CLASS_TUNE[cls] ?? 1); // a jab-to-straight lands 7-14 of 200 HP
  return {
    maxHp: HP,
    // Ranges tuned with scripts/balance.ts so a point of any stat is worth about the same.
    speed: 3 + t(f.spd) * TUNE.SPEED_SPAN + t(f.agi) * TUNE.AGI_SPEED, // footwork: speed and agility share it
    jump: 13 + t(f.agi) * TUNE.JUMP_SPAN,
    air: 0.2 + t(f.agi) * TUNE.AIR_SPAN,
    stun: HITSTUN - t(f.agi) * TUNE.STUN_SPAN,
    punch: base * ratio(f.atk, TUNE.STR_EXP),
    magic: base * ratio(f.iq, TUNE.IQ_EXP),
    tempo: 1 + (f.spd - 70) * TUNE.TEMPO_GAIN, // fast fighters' punches and kicks play out quicker
    armor: buff.taken / ratio(f.def, TUNE.DUR_EXP),
    blockReduce: cls === "Tank" ? TRAIT.TANK_BLOCK : 0.55 + t(f.def) * TUNE.BLOCK_SPAN,
    cooldown: Math.round(26 - t(f.spd) * TUNE.SPD_COOLDOWN),
    dodge: t(f.agi) * TUNE.DODGE_SPAN,
    crit: 0.03 + Math.max(0, f.iq - 60) * 0.003,
    // Bounded: a meter that fills 2-3x faster than the opponent's turns every fight into a special spam.
    energyMul: Math.min(1.2, Math.max(0.85, 1 + (f.iq - 70) * TUNE.IQ_ENERGY)) * (cls === "Attacker" ? TRAIT.ATTACKER_ENERGY : 1),
    special: specialOf(s.specialKind, s.class),
    ult: ultOf(s.ultKind, s.class),
    skill: skillOf(s.sideSkill, s.class),
    skillCd: Math.round(SKILL_INFO[skillOf(s.sideSkill, s.class)].cd * TICK_HZ * (1 - (f.iq - 70) * 0.006)),
    style: styleOf(s.style, s.class),
    cls,
    item: itemOf(s.item, cls),
    element: (ELEMENTS as readonly string[]).includes(s.element ?? "") ? s.element! : "NONE",
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
  skill: number; // side skill
};

export const EMPTY_INPUT: Input = { left: false, right: false, block: false, jump: 0, attack: 0, kick: 0, special: 0, skill: 0 };

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
  hitN: number; // multi-hit specials: hits so far (meteor: the tick it landed); punches: blast fired
  tempoAcc: number; // fractional ticks owed by tempo != 1
  stun: number; // ticks the current hit-stun lasts (agility, Mace, electric)
  crossT: number; // ticks left in which a punch/kick switch counts as a cross-combo (Fighter)
  fast: boolean; // this move plays ×1.15 faster (Fighter cross-combo)
  status: { kind: string; t: number; n: number } | null; // element effect: kind, ticks left, damage owed
  mix: boolean; // this move is a mix finisher (punch, punch, kick)
  skillCd: number; // ticks until the side skill is ready again
  skillT: number; // ticks left of the side skill's effect
  bubble: number; // ink bubble: hits it can still absorb
  ult: boolean; // the special in progress is the ultimate (S + L), not slot 1
  ultEnd: number; // attacker: special tick at which a hit-lock ends (0: the move's own length)
  locked: boolean; // victim: held in place by an ultimate until it ends
  skillQ: boolean; // a skill press made while reeling: used the moment it can be, not lost
  seen: { jump: number; attack: number; kick: number; special: number; skill: number };
};

export type Projectile = { id: number; owner: Slot; kind: SpecialKind | "blast"; x: number; y: number; vx: number; r: number; dmg: number; life: number; ult?: boolean };

export type GameEvent =
  | { id: number; type: "hit"; x: number; y: number; dmg: number; blocked: boolean; special: boolean; by: Slot; ult?: boolean; crit?: boolean }
  | { id: number; type: "special"; by: Slot; kind: SpecialKind; ult: boolean }
  | { id: number; type: "ko"; loser: Slot }
  | { id: number; type: "round"; round: number }
  | { id: number; type: "dodge"; x: number; y: number; by: Slot } // an agile fighter slipped a hit
  | { id: number; type: "skill"; by: Slot; kind: SideSkill }
  | { id: number; type: "clash"; x: number; y: number }; // two strikes met: neither lands

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
    stun: def.stun,
    crossT: 0,
    fast: false,
    status: null,
    mix: false,
    skillCd: 0,
    skillT: 0,
    bubble: 0,
    ult: false,
    ultEnd: 0,
    locked: false,
    skillQ: false,
    seen: { jump: seen.jump, attack: seen.attack, kick: seen.kick, special: seen.special, skill: seen.skill ?? 0 },
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

// A number in [0, 1) from the match clock: the same tick always rolls the same.
function roll(m: Match, salt: number) {
  let h = Math.imul(m.round, 73856093) ^ Math.imul(m.timer, 19349663) ^ Math.imul(salt + 1, 83492791);
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
  h ^= h >>> 13;
  return (h >>> 0) / 4294967296;
}

// Element effects (strength × ELEMENT_TUNE[kind]). ELECTRIC and GRAVITY act once on the hit and
// their status only lingers for the renderer. The rest act every tick: burn and bleed in
// tickStatus, frost in updateFighter, poison in applyHit.
const STATUS_TICKS: Record<string, number> = { FIRE: 180, ELECTRIC: 30, FROST: 120, POISON: 180, BLEED: 180, GRAVITY: 30 };
const POISON_CUT = 0.15; // poisoned fighters deal 15% less
const FROST_SLOW = 0.3; // frozen fighters walk 30% slower

function infect(att: Fighter, vic: Fighter, kind: string, dir: number) {
  const k = ELEMENT_TUNE[kind] ?? 1;
  const prev = vic.status;
  const fresh = prev?.kind !== kind;
  const oneShot = kind === "ELECTRIC" || kind === "GRAVITY";
  // A repeat hit refreshes a lasting effect but doesn't re-trigger a one-shot (barrage, beam).
  if (fresh || !oneShot) vic.status = { kind, t: STATUS_TICKS[kind], n: fresh ? 0 : prev!.n };
  if (!fresh) return;
  if (kind === "ELECTRIC") vic.stun += 8 * k;
  // Pull toward the attacker, stopping at body contact.
  else if (kind === "GRAVITY") vic.x -= dir * Math.min(40 * k, Math.max(0, Math.abs(vic.x - att.x) - BODY.w * 0.8));
}

// Damage-over-time ticks. Never kills: a fighter is left at 1 HP at worst. Credited to the opponent.
function tickStatus(m: Match, f: Fighter) {
  const s = f.status!;
  if (s.kind === "FIRE") s.n += (ELEMENT_TUNE.FIRE ?? 1) / 15;
  else if (s.kind === "BLEED" && f.moving) s.n += (ELEMENT_TUNE.BLEED ?? 1) / 10;
  if (s.n >= 1) {
    s.n--;
    const d = Math.min(1, f.hp - 1);
    if (d > 0) {
      f.hp -= d;
      m.damage[1 - f.slot] += d;
    }
  }
  if (--s.t <= 0) f.status = null;
}

function applyHit(
  m: Match,
  att: Fighter,
  vic: Fighter,
  raw: number,
  opts: { knock: number; launch?: number; special: boolean; ult?: boolean; proj?: boolean; finisher?: boolean; low?: boolean; down?: number; at: { x: number; y: number } },
) {
  if (vic.action === "ko" || m.phase !== "fight") return;
  // Mid-teleport the body isn't there.
  if (vic.action === "special" && kindOf(m, vic) === "teleport" && vic.t >= 3 && vic.t < 12) return;
  const dir = vic.x >= att.x ? 1 : -1;
  const held = vic.locked; // already held by an ultimate before this blow
  const facingAttacker = vic.facing === -dir;
  const blocked = vic.blocking && facingAttacker && !opts.low; // a low strike goes under a standing guard
  // Agility: a grounded fighter that isn't reeling sometimes slips a normal hit, even mid-swing. The
  // roll comes from the match clock, not Math.random, so the sim stays deterministic.
  const canSlip = vic.action === "idle" || vic.action === "attack" || vic.action === "kick";
  if (!blocked && !opts.special && canSlip && vic.grounded && roll(m, vic.slot) < m.defs[vic.slot].dodge) {
    vic.vx = dir * 5;
    emit(m, { type: "dodge", x: vic.x, y: vic.y - BODY.h * 0.6, by: vic.slot });
    return;
  }
  const def = m.defs[vic.slot];
  const ad = m.defs[att.slot];
  // Slip-weave: the hit is slipped and the weaver's next move comes out fast, to punish with
  // (an automatic counter stunned the attacker every time: a free win, not a read).
  if (def.skill === "weave" && vic.skillT > 0 && !opts.proj && vic.action !== "hit") {
    vic.skillT = 0;
    vic.vx = dir * 4;
    vic.fast = true;
    vic.crossT = COMBO_WINDOW;
    if (vic.action === "idle") vic.cooldown = 0;
    emit(m, { type: "dodge", x: vic.x, y: vic.y - BODY.h * 0.6, by: vic.slot });
    return;
  }
  // Ink bubble: soaks the hit and shoves a melee attacker back. A mace pops it in one blow.
  if (vic.bubble > 0 && vic.skillT > 0) {
    if (--vic.bubble === 0 || (ad.cls === "Mace" && !opts.proj)) vic.bubble = vic.skillT = 0;
    if (!opts.proj) att.vx = -dir * TRAIT.BUBBLE_PUSH;
    emit(m, { type: "hit", x: opts.at.x, y: opts.at.y, dmg: 0, blocked: true, special: opts.special, by: att.slot });
    m.freeze = Math.max(m.freeze, 3);
    return;
  }
  const blade = ad.skill === "blade" && att.skillT > 0 && !opts.special && !opts.proj;

  let dmg = raw * def.armor * (blade ? TRAIT.BLADE : 1); // raw already carries the attacker's STR/IQ (see deriveDef)
  if (att.status?.kind === "POISON") dmg *= 1 - POISON_CUT * (ELEMENT_TUNE.POISON ?? 1);
  // Ink Flash: a chain finisher that lands clean sometimes hits half again as hard (the roll comes from the match clock).
  const crit = !!opts.finisher && !opts.special && !blocked && roll(m, 10 + att.slot) < ad.crit;
  if (crit) dmg *= 1.5;
  if (vic.armorTicks > 0) dmg *= ad.cls === "Mace" ? TRAIT.MACE_BREAK : 0.5; // a mace cracks armor: ×1.25 on the halving (×1.5 made Tank vs Mace 35%)
  const full = dmg;
  // Specials punch through a block harder than normal hits.
  if (blocked) dmg *= 1 - def.blockReduce * (opts.special ? 0.6 : 1);
  const dealt = Math.max(1, Math.round(dmg));

  vic.hp = Math.max(0, vic.hp - dealt);
  m.damage[att.slot] += dealt;
  // A special's own hits don't build meter: a multi-hit (barrage, beam) would refill itself and loop.
  if (!opts.special) att.energy = Math.min(100, att.energy + (blocked ? 5 : 12) * ad.energyMul);
  vic.energy = Math.min(100, vic.energy + 7 * def.energyMul);

  // Mace: its heavy finisher doesn't flinch from normal hits (a heavy trades blows instead of being out-paced).
  const mv = vic.move ? MOVES[vic.move] : null;
  const striking = (vic.action === "attack" || vic.action === "kick") && mv !== null && vic.t >= mv.from - TRAIT.MACE_ARMOR_LEAD && vic.t <= mv.to;
  const vchain = striking ? chainOf(def, vic.action as "attack" | "kick") : [];
  const heavy = vchain[vic.combo] === vic.move && (vchain.length === 1 || vic.combo === vchain.length - 1); // the chain's finisher
  // ...and its poise shrugs off light projectiles (blasts) outside hit-stun, so a heavy can walk a zoner down.
  const poised = TRAIT.MACE_POISE > 0 && !!opts.proj && vic.action !== "hit";
  const armored =
    (!opts.special && ((def.cls === "Mace" && ((striking && heavy) || poised)) || (striking && !!mv!.armor))) || // shield bash: armor while it hits
    (def.skill === "poise" && vic.skillT > 0); // iron poise: nothing staggers
  // An ultimate that gets through the guard grabs: a melee ult is already mid-move, a projectile one pulls the
  // attacker back into it (unless they were hit meanwhile).
  const lockIt =
    !!opts.ult && !blocked && !vic.locked && vic.hp > 0 &&
    (opts.proj ? att.action === "idle" || att.action === "attack" || att.action === "kick" || (att.action === "special" && att.ult) : att.action === "special" && att.ult);
  if (blocked) {
    vic.vx = dir * opts.knock * 0.4;
    // A tank's guard shoves a melee attacker back.
    if (def.cls === "Tank" && !opts.special && !opts.proj) att.vx = -dir * TRAIT.TANK_PUSH;
    // Reflect shield: half the blocked blow bounces back (as a normal hit, so it can't loop).
    if (def.skill === "reflect" && vic.skillT > 0 && !opts.proj && att.action !== "ko") {
      const back = full * TRAIT.REFLECT / def.armor; // undo the defender's armor; the attacker's own applies
      applyHit(m, vic, att, back, { knock: 8, special: false, at: { x: att.x + dir * 20, y: att.y - BODY.h * 0.6 } });
    }
  } else if (vic.locked) {
    // held: the blows land, but nothing flinches or shoves
  } else if (lockIt) {
    lockOn(m, att, vic);
    if (opts.special && ad.element !== "NONE") infect(att, vic, ad.element, dir);
  } else if (!armored) {
    vic.action = "hit";
    vic.t = 0;
    vic.stun = def.stun + (ad.cls === "Mace" && opts.finisher ? TRAIT.MACE_STUN : 0) + (opts.down ?? 0); // Mace: only a chain finisher, a reward, not a lock
    vic.vx = dir * opts.knock;
    if (opts.launch) {
      vic.vy = -opts.launch;
      vic.grounded = false;
    }
    if (opts.special && ad.element !== "NONE" && vic.hp > 0) infect(att, vic, ad.element, dir);
    // Element blade: also sets the fighter's own element on a clean target (a free FIRE burn on every
    // element-less sword, refreshed each hit, was a permanent burn).
    else if (blade && vic.hp > 0 && !vic.status && ad.element !== "NONE") infect(att, vic, ad.element, dir);
  }
  emit(m, { type: "hit", x: opts.at.x, y: opts.at.y, dmg: dealt, blocked, special: opts.special, by: att.slot, ...(opts.ult && { ult: true }), ...(crit && { crit: true }) });
  // Hit-stop sells the impact: bigger hits hold a little longer.
  m.freeze = Math.max(m.freeze, blocked ? 2 : held ? 3 : opts.special ? 6 : Math.min(6, 2 + Math.round(dealt / 4)));

  if (vic.hp <= 0) {
    vic.locked = false;
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

const pinned = (att: Fighter) => Math.min(ARENA.w - ARENA.wall - BODY.w / 2, Math.max(ARENA.wall + BODY.w / 2, att.x + att.facing * LOCK.gap));

function lockOn(m: Match, att: Fighter, vic: Fighter) {
  const kind = m.defs[att.slot].ult;
  if (att.action !== "special") {
    // A projectile ultimate connected: the attacker steps back into the move, at its pounding phase.
    att.action = "special";
    att.ult = true;
    att.t = SPECIAL_DURATION[kind];
    att.landed = true;
    att.hitN = 0;
    att.facing = vic.x >= att.x ? 1 : -1;
  }
  att.ultEnd = MULTI_HIT.includes(kind) ? 0 : att.t + LOCK.ticks;
  vic.locked = true;
  vic.action = "hit";
  vic.t = 0;
  vic.stun = 9999;
  vic.vx = vic.vy = 0;
  vic.x = pinned(att);
}

// The hold ends. `finale`: the ultimate ran its course, so it ends with a launching blow; otherwise the attacker was
// interrupted and the victim just drops.
function releaseLock(m: Match, att: Fighter, vic: Fighter, finale: number | null) {
  vic.locked = false;
  if (vic.action === "ko") return;
  vic.action = "hit";
  vic.t = 0;
  vic.stun = m.defs[vic.slot].stun;
  if (finale === null) return;
  applyHit(m, att, vic, finale, { knock: 14, launch: LOCK.launch, special: true, ult: true, at: { x: vic.x, y: vic.y - BODY.h * 0.6 } });
}

// The special in progress: slot 1 or the ultimate.
const kindOf = (m: Match, f: Fighter): SpecialKind => (f.ult ? m.defs[f.slot].ult : m.defs[f.slot].special);

function startSpecial(m: Match, f: Fighter, ult: boolean) {
  f.ult = ult;
  const kind = kindOf(m, f);
  f.action = "special";
  f.blocking = false; // S + L: the guard drops as the move starts
  f.t = 0;
  f.landed = false;
  f.hitN = 0;
  f.energy = Math.max(0, f.energy - (ult ? ULT_COST : SLOT1_COST));
  f.ultEnd = 0;
  if (kind === "charge") f.armorTicks = 3 * TICK_HZ;
  m.freeze = Math.max(m.freeze, ult ? SUPER_FREEZE : SLOT1_FREEZE);
  emit(m, { type: "special", by: f.slot, kind, ult });
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
  const def = m.defs[f.slot];
  const kind = kindOf(m, f);
  // Specials are technique: IQ drives them (SPECIAL_IQ blends in STR for the physical ones). Normals use STR.
  // Slot 1 hits at SLOT1_SCALE of the building block (it costs half the meter); the ultimate at ULT_SCALE.
  const punch = (SPECIAL_INFO[kind].ranged ? def.magic : def.punch * (1 - TRAIT.SPECIAL_IQ) + def.magic * TRAIT.SPECIAL_IQ) * SPECIAL_TUNE[kind] * (f.ult ? TRAIT.ULT_SCALE : TRAIT.SLOT1_SCALE);
  const proj = PROJECTILE[kind];
  const t = f.t;
  const front = (reach: number, top = 1, bot = 0.15) => {
    const x1 = f.x + f.facing * (BODY.w / 2);
    return overlaps(x1 - f.facing * 20, x1 + f.facing * reach, f.y - BODY.h * top, f.y - BODY.h * bot, opp);
  };
  const hit = (mult: number, knock: number, launch = 0, y = 0.55) =>
    applyHit(m, f, opp, punch * mult, { knock, launch, special: true, ult: f.ult, at: { x: opp.x - f.facing * 20, y: opp.y - BODY.h * y } });
  // The special is over: it has run its length, and a hit-lock (ultimate) has run out too. A lock ends with a launching blow.
  const finish = () => {
    if (t < f.ultEnd) return false;
    f.action = "idle";
    f.ultEnd = 0;
    if (opp.locked) releaseLock(m, f, opp, punch * TRAIT.FINALE_MULT);
    return true;
  };
  // Hit-lock: echo blows every few ticks while the opponent is held, and the attacker plants itself once its own
  // animation has played out.
  if (f.ult && f.ultEnd && opp.locked) {
    const left = f.ultEnd - t;
    if (t >= SPECIAL_DURATION[kind]) f.vx = 0;
    if (left > 0 && left < LOCK.ticks && left % LOCK.every === 0) hit(TRAIT.ECHO_MULT, 0);
  }

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
        life: 600, // leaves the arena long before
        ult: f.ult,
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
    if ((f.hitN && t >= f.hitN + 12) || t >= SPECIAL_DURATION.meteor) finish();
    return;
  }
  if (t >= SPECIAL_DURATION[kind]) finish();
}

// J swings the class's weapon (Fighter: the style's punches); K is always the style's kicks.
const chainOf = (def: FighterDef, type: "attack" | "kick") => (type === "attack" ? (CLASS_CHAIN[def.cls] ?? STYLE_INFO[def.style].punch) : STYLE_INFO[def.style].kick);
// Damage per unit of move mult, so every chain deals about the same damage per second.
const chainPower = (def: FighterDef, type: "attack" | "kick") =>
  type === "attack" && CLASS_CHAIN[def.cls] ? CLASS_CHAIN_POWER[def.cls] : STYLE_POWER[def.style][type === "attack" ? "punch" : "kick"] * STYLE_TUNE[def.style];
const reachBonus = (def: FighterDef, type: "attack" | "kick") => (type === "attack" && def.cls === "Sword" ? TRAIT.SWORD_REACH : 0); // a sword extends the punch chain
// Longest reach past the body edge of a fighter's punch or kick chain (the CPU spaces itself by it).
export const moveReach = (def: FighterDef, type: "attack" | "kick") => Math.max(...chainOf(def, type).map((n) => MOVES[n].reach)) + reachBonus(def, type);
// Farthest centre-to-centre distance at which an Attacker's punch blast can still land.
export const BLAST_REACH = BODY.w / 2 + 10 + Math.ceil(BLAST.range / BLAST.speed) * BLAST.speed + BLAST.r + BODY.w / 2;
// True when step() will skip this tick (hit-stop, or a held KO slow-motion tick). Mirrors step().
export const holds = (m: Match) => (m.slow > 0 && (m.slow - 1) % 3 !== 0) || m.freeze > 0;

// Start the next punch/kick: an air move when airborne, `forced` for a directional one (down+K, toward+K),
// the style's mix finisher when a chain of two switches buttons, else the chain's next move.
function startMove(f: Fighter, def: FighterDef, type: "attack" | "kick", forced?: MoveName) {
  const chain = chainOf(def, type);
  const other = chainOf(def, type === "attack" ? "kick" : "attack");
  const cont = f.comboT > 0 && f.move !== null && chain[f.combo] === f.move;
  const mix = !forced && f.grounded && f.comboT > 0 && f.combo >= 1 && f.move !== null && other[f.combo] === f.move;
  // Fighter: a punch right after a kick (or the reverse) flows faster.
  f.fast = def.cls === "Fighter" && f.crossT > 0 && f.move !== null && other.includes(f.move);
  f.mix = mix;
  f.combo = cont && !forced ? (f.combo + 1) % chain.length : 0;
  f.move = !f.grounded ? (type === "kick" ? "flyingKick" : def.cls === "Sword" ? "airSlash" : "divePunch") : (forced ?? (mix ? STYLE_INFO[def.style].mix : chain[f.combo]));
  f.action = type;
  f.t = 0;
  f.landed = false;
  f.hitN = 0;
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
  const pressed = (k: "jump" | "attack" | "kick" | "special" | "skill") => {
    const now = input[k] ?? 0;
    const p = now !== (f.seen[k] ?? 0);
    f.seen[k] = now;
    return p;
  };
  const jumpP = pressed("jump");
  const attackP = pressed("attack");
  const kickP = pressed("kick");
  const specialP = pressed("special");
  const skillP = pressed("skill");
  const canAct = m.phase === "fight";

  f.cooldown = Math.max(0, f.cooldown - 1);
  f.comboT = Math.max(0, f.comboT - 1);
  f.armorTicks = Math.max(0, f.armorTicks - 1);
  f.crossT = Math.max(0, f.crossT - 1);
  f.skillCd = Math.max(0, f.skillCd - 1);
  if (f.skillT > 0 && --f.skillT === 0) f.bubble = 0;
  // Side skill: instant, usable mid-move. A press while reeling waits for the hit-stun to end.
  if (skillP && canAct && f.skillCd === 0) f.skillQ = true;
  if (f.skillQ && canAct && f.action !== "hit" && f.action !== "ko") {
    f.skillQ = false;
    f.skillCd = def.skillCd;
    f.skillT = Math.max(1, Math.round(SKILL_INFO[def.skill].dur * SKILL_TUNE[def.skill]));
    if (def.skill === "bubble") f.bubble = TRAIT.BUBBLE_HITS;
    emit(m, { type: "skill", by: f.slot, kind: def.skill });
  }
  if (canAct && f.status) tickStatus(m, f);
  f.t++;
  // Tempo: a fast fighter's punch/kick sometimes skips a tick, a slow one's sometimes holds.
  if (f.action === "attack" || f.action === "kick") {
    f.tempoAcc += def.tempo * (f.fast ? TRAIT.FIGHTER_TEMPO : 1) - 1;
    if (f.tempoAcc >= 1) {
      f.t++;
      f.tempoAcc--;
    } else if (f.tempoAcc <= -1) {
      f.t--;
      f.tempoAcc++;
    }
  }
  f.moving = false;

  // Held by an ultimate: no input, no recovery until the attacker lets go.
  if (f.locked) {
    f.action = "hit";
    f.stun = 9999;
  }
  if (f.action === "hit" && f.t >= f.stun) f.action = "idle";
  if ((f.action === "attack" || f.action === "kick") && f.move) {
    const type = f.action;
    const mv = MOVES[f.move];
    const x1 = f.x + f.facing * (BODY.w / 2);
    // A shoved-back attacker (tank block) doesn't lunge forward again.
    if (f.t >= mv.from && f.t <= mv.to && f.grounded && !(f.landed && f.vx * f.facing < 0)) f.vx = f.facing * mv.lunge;
    const chain = chainOf(def, type);
    const inChain = chain[f.combo] === f.move; // not an air, directional or mix move
    const finisher = f.mix || (inChain && chain.length > 1 && f.combo === chain.length - 1);
    const reach = mv.reach + reachBonus(def, type);
    const power = mv.mult * chainPower(def, type) * (finisher ? 1.15 : 1);
    if (mv.dive && f.t === mv.from && !f.grounded) {
      f.vx = f.facing * mv.dive[0];
      f.vy = Math.max(f.vy, mv.dive[1]);
    }
    if (!f.landed && f.t >= mv.from && f.t <= mv.to && overlaps(x1, x1 + f.facing * reach, f.y - BODY.h * mv.top, f.y - BODY.h * mv.bot, opp)) {
      f.landed = true;
      applyHit(m, f, opp, def.punch * power, {
        knock: mv.knock * (finisher ? 1.4 : 1),
        launch: mv.launch,
        special: false,
        finisher,
        low: mv.low,
        down: mv.down,
        at: { x: x1 + f.facing * reach * 0.7, y: f.y - (BODY.h * (mv.top + mv.bot)) / 2 },
      });
    }
    // Attacker: every punch also throws a short magic blast, unless the fist already landed (no double hit).
    if (type === "attack" && def.cls === "Attacker" && !f.hitN && f.t >= mv.from) {
      f.hitN = 1;
      if (!f.landed) {
        m.projectiles.push({
          id: m.nextId++,
          owner: f.slot,
          kind: "blast",
          x: x1 + f.facing * 10,
          y: f.y - BODY.h * 0.6,
          vx: f.facing * BLAST.speed,
          r: BLAST.r,
          dmg: def.magic * power * TRAIT.BLAST_MULT, // a poke: safe at range, so it hurts less than the fist
          life: Math.ceil(BLAST.range / BLAST.speed),
        });
      }
    }
    // A press after the hit frames is buffered, so the chain flows without frame-perfect timing.
    if ((attackP || kickP) && f.t > mv.to) f.buffer = attackP ? "attack" : "kick";
    if (mv.air && f.grounded && f.t > 2) f.t = Math.max(f.t, mv.dur); // an air move ends on landing
    if (f.t >= mv.dur) {
      const last = !inChain || f.combo === chain.length - 1;
      f.action = "idle";
      f.comboT = last ? 0 : COMBO_WINDOW;
      f.crossT = COMBO_WINDOW;
      f.cooldown = last ? def.cooldown : Math.round(def.cooldown * 0.3);
      if (f.buffer && canAct && !last) {
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
    const toward = (input.right ? 1 : 0) - (input.left ? 1 : 0) === f.facing;
    if (kickP && f.cooldown === 0 && f.blocking) {
      startMove(f, def, "kick", "sweep"); // down+K: a low sweep that goes under a guard
    } else if (attackP && f.cooldown === 0 && !f.blocking) {
      startMove(f, def, "attack");
    } else if (kickP && f.cooldown === 0 && f.grounded && toward && f.comboT === 0) {
      startMove(f, def, "kick", "roundhouse"); // toward+K opens with a roundhouse
    } else if (kickP && f.cooldown === 0 && !f.blocking) {
      startMove(f, def, "kick");
    } else if (specialP && f.blocking && f.energy >= ULT_COST) {
      startSpecial(m, f, true); // S + L
    } else if (specialP && f.energy >= SLOT1_COST) {
      startSpecial(m, f, false); // L (S + L without a full meter fires slot 1 too: the guard was only a modifier)
    } else {
      const dir = (input.right ? 1 : 0) - (input.left ? 1 : 0);
      const slow = f.status?.kind === "FROST" ? Math.max(0.2, 1 - FROST_SLOW * (ELEMENT_TUNE.FROST ?? 1)) : 1;
      // Walking away is slower than walking in (standard in fighting games), so nobody can kite forever.
      const back = dir !== 0 && dir !== f.facing ? TRAIT.BACKWALK : 1;
      if (f.grounded) f.vx = (f.blocking ? (def.cls === "Tank" ? TRAIT.TANK_GUARD_WALK : 0) : 1) * dir * def.speed * slow * back; // a tank can inch forward behind its shield
      else {
        // Agility = air control, capped so a hop can't fling across the arena (slowing down is always allowed).
        const nv = f.vx + dir * def.air;
        if (Math.abs(nv) <= def.speed * 1.3 || Math.abs(nv) < Math.abs(f.vx)) f.vx = nv;
      }
      f.moving = dir !== 0 && (!f.blocking || def.cls === "Tank");
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
  if (f.locked) {
    f.x = pinned(opp);
    f.vx = 0;
  }
  if (canAct) f.energy = Math.min(100, f.energy + PASSIVE_ENERGY * def.energyMul);
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

// The strike box of a punch/kick that will be in its active frames on the tick about to play (t + 1:
// updateFighter advances t, then a hit lands at once), if it hasn't connected yet.
function strikeBox(m: Match, f: Fighter): [number, number, number, number] | null {
  if ((f.action !== "attack" && f.action !== "kick") || !f.move || f.landed) return null;
  const mv = MOVES[f.move];
  if (f.t + 1 < mv.from || f.t + 1 > mv.to) return null;
  const x1 = f.x + f.facing * (BODY.w / 2);
  return [x1, x1 + f.facing * (mv.reach + reachBonus(m.defs[f.slot], f.action)), f.y - BODY.h * mv.top, f.y - BODY.h * mv.bot];
}

// Limb clash: two strikes that reach each other in the same tick cancel out (before, slot 0 always won the trade).
function clash(m: Match, a: Fighter, b: Fighter) {
  const ba = strikeBox(m, a), bb = strikeBox(m, b);
  if (!ba || !bb || !overlaps(...ba, b) || !overlaps(...bb, a)) return;
  a.landed = b.landed = true;
  m.freeze = Math.max(m.freeze, 6);
  const dir = b.x >= a.x ? 1 : -1;
  a.vx = -dir * 5;
  b.vx = dir * 5;
  for (const f of [a, b]) f.energy = Math.min(100, f.energy + (m.defs[f.slot].cls === "Fighter" ? 15 : 12) * m.defs[f.slot].energyMul);
  emit(m, { type: "clash", x: (a.x + b.x) / 2, y: Math.min(a.y, b.y) - BODY.h * 0.65 });
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
  if (m.phase === "fight") clash(m, a, b);
  // During intro/roundEnd, inputs are still consumed (so stale presses don't fire later) but ignored.
  updateFighter(m, a, b, inputs[0]);
  updateFighter(m, b, a, inputs[1]);
  // An attacker knocked out of their ultimate lets the opponent go.
  for (const f of m.fighters) {
    const v = m.fighters[1 - f.slot];
    if (v.locked && !(f.action === "special" && f.ult)) releaseLock(m, f, v, null);
  }
  separate(a, b);

  for (const p of m.projectiles) {
    p.x += p.vx;
    const target = m.fighters[1 - p.owner];
    const blast = p.kind === "blast"; // a light hit: no super-flash, no element
    if (overlaps(p.x - p.r, p.x + p.r, p.y - p.r, p.y + p.r, target)) {
      applyHit(m, m.fighters[p.owner], target, p.dmg, { knock: blast ? 5 : 9, launch: p.kind === "orb" ? 5 : p.kind === "wave" ? 9 : 0, special: !blast, ult: p.ult, proj: true, at: { x: p.x, y: p.y } });
      p.x = -9999; // consumed
    } else if (--p.life <= 0) p.x = -9999; // blast ran out of range
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
  ults: [SpecialKind, SpecialKind];
  styles: [Style, Style];
  skills: [SideSkill, SideSkill];
  skillCds: [number, number]; // full side-skill cooldown, ticks (for the console's SKILL fill)
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
    ults: [m.defs[0].ult, m.defs[1].ult],
    styles: [m.defs[0].style, m.defs[1].style],
    skills: [m.defs[0].skill, m.defs[1].skill],
    skillCds: [m.defs[0].skillCd, m.defs[1].skillCd],
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
  m.fighters = [0, 1].map((i) => ({ ...s.fighters[i], seen: { jump: inputs[i].jump, attack: inputs[i].attack, kick: inputs[i].kick, special: inputs[i].special, skill: inputs[i].skill } })) as [Fighter, Fighter];
  m.nextId = Math.max(0, ...s.events.map((e) => e.id), ...s.projectiles.map((p) => p.id)) + 1;
  return m;
}
