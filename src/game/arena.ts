// Arena 1, Inferno Crater: one 5-minute fight on a volcanic floor that gets worse in five scenes (the spec is
// docs/design/arena-1/spec.md, the task sheet docs/tasks/arena-1.md). Everything here is a pure function of the match
// clock plus the small ArenaState kept on the Match (it goes into every Snapshot), so both players' browsers and the
// relay fallback see the same scene, platforms and hazards. No Math.random, no Date: rolls come from the sim's roll().
//
// Opt-in: createMatch(a, b, inputs, { arena: "inferno" }). Without it nothing here runs and a match is exactly the
// normal best-of-3.

import { ARENA, BODY, TICK_HZ } from "./space";
import type { Fighter, Match, Slot } from "./sim";

export const ARENAS = ["inferno"] as const;
export type ArenaId = (typeof ARENAS)[number];
export const ARENA_INFO: Record<ArenaId, { name: string; short: string }> = {
  inferno: { name: "Inferno Crater", short: "Arena 1" },
};
export const isArenaId = (v: unknown): v is ArenaId => typeof v === "string" && (ARENAS as readonly string[]).includes(v);

const S = TICK_HZ;

// Every number of the mode lives here. Damage is a fraction of the fighter's health pool (see hpMul) so the same table
// works whatever the pool is. The spec leaves all of these open ("do not hardcode assumed values as final"): they are
// starting values, tuned with scripts/arena.ts.
export const ARENA_TUNE = {
  matchTicks: 300 * S, // the match clock: 5:00, never paused by a scene change
  scenes: [0, 30 * S, 60 * S, 105 * S, 150 * S] as const, // start tick of scenes 1-5 (30, 30, 45, 45, 150 seconds)
  // A normal fight is over in about 30 seconds, which would never reach scene 3. The arena pool is bigger so a fight
  // takes minutes (every hit counts the same relative to it: class balance is unchanged). HP bars show a fraction.
  hpMul: 18,
  // The long fight shifts the class matchup (a Tank's guard and armor pay off over minutes), so the arena has its own damage
  // factor per class, on top of CLASS_TUNE. Found with `npx tsx scripts/arena.ts --tune`; 1 = no change.
  classTune: { Sword: 1.044, Mace: 1.021, Tank: 0.92, Attacker: 0.998, Fighter: 1.013 } as Record<string, number>,
  // Scene 2, Heatwave: both fighters lose a sliver of health on a slow beat. Small, symmetrical, capped like every hazard.
  heat: { every: 150, dmg: 0.004 },
  // Scene 3, Ground Fracture: crack zones on the floor. A zone glows `glow` ticks (harmless) before it leaks, then leaks
  // for `live` ticks. At most `max` zones exist at once (glowing or leaking); they never spawn within `clear` px of a
  // fighter or `gap` px of each other, and a safe strip of `safe` px always stays. Spawn rate, width and damage grow
  // through the scene (arrays: start → end of the scene). Width stays under what the weakest jumper clears in the air.
  crack: { glow: 100, live: 420, max: 2, every: [540, 240], width: [50, 70], dmg: [0.006, 0.01], hit: 30, clear: 90, gap: 60, safe: 200 },
  // Scene 4, Volcanic Warning: a marker on the floor for `warn` ticks, then a rock lands with radius `r`. At most `max`
  // at once, impacts `apart` ticks apart and `sep` px apart, and one blast never hurts both fighters (the nearer one takes it).
  // `near`: how far from a fighter a targeted meteor may land. No new ones in the last `stop` ticks: the staircase warns then.
  meteor: { warn: 84, r: 44, reach: 20, height: 90, dmg: 0.025, knock: 6, max: 2, every: [360, 200], sep: 220, apart: 30, near: 120, stop: 8700 },
  // Scene 5: lava rises from below the floor at `rate` px per tick, reaches the floor after the staircase has stood 10+ s,
  // and ends below the final platform. A fighter in lava takes `dmg` every `hit` ticks; after `rescue` ticks they are set
  // on the nearest safe platform (top at least `margin` above the lava) and shrug off lava and cracks for `immune` ticks.
  lava: { start: ARENA.ground + 60, rate: 0.025, hit: 30, dmg: 0.012, rescue: 75, margin: 30, immune: 120, depth: 6 },
  // Lava and cracks weaken the next hits a fighter deals by `step` each time, up to `max`; it wears off `recover` per
  // tick after `after` ticks out of contact. So nobody is ever more than max weaker, and it always fades.
  weak: { step: 0.04, max: 0.25, after: 90, recover: 0.25 / 240 },
  // Environment damage to one fighter never exceeds `cap` of their pool in any 10 seconds (11 one-second buckets), and it
  // never takes the last point of health: the environment can't deliver a knockout.
  env: { cap: 0.08 },
  // Scene 5 only: the climb gets easier. The staircase itself is built for the weakest jumper without this.
  boost: { jump: 1.12, air: 1.5 },
  dropTicks: 14, // S + jump on a platform: ignore platforms this long (fall through)
};

// ------------------------------------------------------------------ scenes

export const SCENE_NAMES = ["ARRIVAL", "HEATWAVE", "GROUND FRACTURE", "VOLCANIC WARNING", "ELEVATED FINAL ARENA"] as const;

export function sceneAt(tick: number): number {
  const s = ARENA_TUNE.scenes;
  for (let i = s.length - 1; i > 0; i--) if (tick >= s[i]) return i;
  return 0;
}

// Ticks of fight played so far. The timer only runs in the fight phase, so this is the match clock.
export const arenaTick = (m: Pick<Match, "timer">) => ARENA_TUNE.matchTicks - m.timer;

// ------------------------------------------------------------------ platforms

export type PlatformState = "hidden" | "warn" | "rising" | "up";
// x is the left edge of the support (a fighter's centre must be inside [x, x + w]). Every platform is one-way: jump up
// through it from below, land on top, hold S + jump to drop down. `dest` is the final top, `riseT` ticks into the rise.
export type Platform = { id: number; kind: "step" | "final"; x: number; w: number; top: number; dest: number; state: PlatformState; riseT: number };

const HIDDEN_TOP = ARENA.ground + 70; // below the floor: nothing can stand on it yet
// The staircase, mirrored around the centre. Each rise is 66-67 px (the weakest jumper clears 69), each gap 10-15 px,
// every step 70+ px wide, and the final platform is 420 px wide with its top 200 px above the old floor.
// warn: the dust ring and rumble start (telegraph, at least 2 s); rise: it starts to come up; dur: how long it takes.
const ROCKS = [
  { id: 1, kind: "step", x: 95, w: 80, top: 414, warn: 8700, rise: 9000, dur: 60 },
  { id: 2, kind: "step", x: 785, w: 80, top: 414, warn: 8700, rise: 9000, dur: 60 },
  { id: 3, kind: "step", x: 190, w: 70, top: 347, warn: 9300, rise: 9480, dur: 60 },
  { id: 4, kind: "step", x: 700, w: 70, top: 347, warn: 9300, rise: 9480, dur: 60 },
  { id: 5, kind: "final", x: 270, w: 420, top: 280, warn: 9840, rise: 10020, dur: 90 },
] as const;
export const ROCK_DEFS = ROCKS;
export const STAIRS_UP_TICK = Math.max(...ROCKS.map((r) => r.rise + r.dur)); // the whole staircase stands from here

const rockAt = (r: (typeof ROCKS)[number], tick: number): Platform => {
  const base = { id: r.id, kind: r.kind, x: r.x, w: r.w, dest: r.top };
  if (tick < r.warn) return { ...base, top: HIDDEN_TOP, state: "hidden", riseT: 0 };
  if (tick < r.rise) return { ...base, top: HIDDEN_TOP, state: "warn", riseT: 0 };
  if (tick < r.rise + r.dur) {
    const p = (tick - r.rise) / r.dur;
    return { ...base, top: HIDDEN_TOP + (r.top - HIDDEN_TOP) * (1 - (1 - p) * (1 - p)), state: "rising", riseT: tick - r.rise };
  }
  return { ...base, top: r.top, state: "up", riseT: r.dur };
};

let cached: { tick: number; list: Platform[] } | null = null;
// The platforms at a match tick (all five, in ROCKS order). Pure; the last answer is cached because the sim, the CPU and
// the renderer all ask every tick.
export function platformsAt(tick: number): Platform[] {
  if (cached && cached.tick === tick) return cached.list;
  const list = ROCKS.map((r) => rockAt(r, tick));
  cached = { tick, list };
  return list;
}

// The lava surface (y, grows downward). Below the floor until the staircase has stood for 10 s.
export const lavaY = (tick: number) => (tick < ARENA_TUNE.scenes[4] ? ARENA_TUNE.lava.start : ARENA_TUNE.lava.start - ARENA_TUNE.lava.rate * (tick - ARENA_TUNE.scenes[4]));

// A platform a fighter can be sent to: standing, with its top clear of the lava.
const safePlatform = (p: Platform, tick: number) => (p.state === "up" || p.state === "rising") && p.top < lavaY(tick) - ARENA_TUNE.lava.margin;

// The platform a fighter stands on (feet on its top), or null on the floor / in the air.
export function standingOn(m: Pick<Match, "timer" | "arena">, f: Pick<Fighter, "x" | "y">): Platform | null {
  if (!m.arena) return null;
  for (const p of platformsAt(arenaTick(m))) if (p.state !== "hidden" && p.state !== "warn" && Math.abs(f.y - p.top) < 0.5 && f.x >= p.x && f.x <= p.x + p.w) return p;
  return null;
}

// ------------------------------------------------------------------ state

export type Crack = { id: number; x: number; w: number; born: number; glow: number; end: number };
export type Meteor = { id: number; x: number; born: number; hit: number };
export type ArenaState = {
  id: ArenaId;
  scene: number; // the last scene announced (-1: none yet)
  cracks: Crack[];
  meteors: Meteor[];
  next: [number, number]; // tick of the next crack / meteor attempt
  envDmg: [number, number]; // environment damage dealt to each fighter, whole match
  log: [number[], number[]]; // damage per one-second bucket, 11 buckets: the 10 s cap
  weak: [number, number]; // how much weaker each fighter's hits are (lava / crack contact)
  since: [number, number]; // ticks since the last contact
  contact: [number, number]; // ticks in the current crack / lava contact
  lavaT: [number, number]; // ticks in lava in a row (the rescue timer)
  immune: [number, number]; // ticks of lava / crack immunity left (after a rescue)
  drop: [number, number]; // ticks left of falling through platforms
};

export function newArena(id: ArenaId): ArenaState {
  const T = ARENA_TUNE;
  return {
    id,
    scene: -1,
    cracks: [],
    meteors: [],
    next: [T.scenes[2] + 90, T.scenes[3] + 60],
    envDmg: [0, 0],
    log: [new Array(11).fill(0), new Array(11).fill(0)],
    weak: [0, 0],
    since: [0, 0],
    contact: [0, 0],
    lavaT: [0, 0],
    immune: [0, 0],
    drop: [0, 0],
  };
}

// A copy for a Snapshot (the sim keeps mutating its own).
export const cloneArena = (a: ArenaState): ArenaState => ({
  ...a,
  cracks: a.cracks.map((c) => ({ ...c })),
  meteors: a.meteors.map((mt) => ({ ...mt })),
  next: [...a.next],
  envDmg: [...a.envDmg],
  log: [[...a.log[0]], [...a.log[1]]],
  weak: [...a.weak],
  since: [...a.since],
  contact: [...a.contact],
  lavaT: [...a.lavaT],
  immune: [...a.immune],
  drop: [...a.drop],
});

export const arenaBoost = (m: Match) => (m.arena && sceneAt(arenaTick(m)) === 4 ? ARENA_TUNE.boost : { jump: 1, air: 1 });

// Where a falling fighter lands: the floor, or the highest platform top it crossed this tick. `prevY` is the feet before
// the move, so even at a fall speed of 60 px/tick it can't pass through a platform (it checks the crossing, not the end
// point). A rising rock that comes up under feet lifts them: the fighter is carried, never crushed or trapped.
export function arenaSurface(m: Match, f: Fighter, prevY: number): number | null {
  const a = m.arena!;
  let top: number | null = f.y >= ARENA.ground ? ARENA.ground : null;
  if (a.drop[f.slot] > 0) return top;
  const tick = arenaTick(m);
  const now = platformsAt(tick);
  const before = platformsAt(Math.max(0, tick - 1)).map((p) => p.top); // (copy: the cache holds one tick)
  for (let i = 0; i < now.length; i++) {
    const p = now[i];
    if ((p.state !== "rising" && p.state !== "up") || f.x < p.x || f.x > p.x + p.w) continue;
    if (prevY <= before[i] + 0.01 && f.y >= p.top - 0.01 && (top === null || p.top < top)) top = p.top;
  }
  return top;
}

// A held fighter is pinned in front of the attacker (LOCK.gap): on a platform that must stay on the platform.
export function arenaClampX(m: Match, att: Fighter, x: number): number {
  const p = standingOn(m, att);
  return p ? Math.min(p.x + p.w - 12, Math.max(p.x + 12, x)) : x;
}

// ------------------------------------------------------------------ per-tick update

type Hooks = { roll: (m: Match, salt: number) => number; emit: (m: Match, e: ArenaEvent) => void };
export type ArenaEventKind = "scene" | "crack" | "meteor" | "impact" | "rumble" | "rise" | "burn" | "rescue";
// What the renderer and the sound get through the sim's event list (it keeps the last 16, so a skipped relay snapshot loses nothing).
// scene: n = 1-5. burn: n = damage, slot. rescue: slot. The rest: x is where.
export type ArenaGameEvent = { id: number; type: "arena"; kind: ArenaEventKind; x: number; y: number; n?: number; slot?: Slot };
type ArenaEvent = Omit<ArenaGameEvent, "id">;

const lerp = (a: number, b: number, p: number) => a + (b - a) * p;
const ev = (kind: ArenaEventKind, x: number, y: number, extra: { n?: number; slot?: Slot } = {}): ArenaEvent => ({ type: "arena", kind, x, y, ...extra });

const bucketSum = (a: ArenaState, s: Slot) => a.log[s].reduce((n, v) => n + v, 0);

// Environment damage: capped per 10 s, and it never takes the last point of health. Returns what was dealt.
function envHurt(m: Match, h: Hooks, f: Fighter, frac: number, tick: number): number {
  const a = m.arena!;
  const pool = m.defs[f.slot].maxHp;
  const want = Math.max(1, Math.round(frac * pool));
  const dealt = Math.min(want, Math.round(ARENA_TUNE.env.cap * pool) - bucketSum(a, f.slot), Math.floor(f.hp) - 1);
  if (dealt <= 0) return 0;
  f.hp -= dealt;
  a.envDmg[f.slot] += dealt;
  a.log[f.slot][Math.floor(tick / S) % 11] += dealt;
  h.emit(m, ev("burn", f.x, f.y - BODY.h * 0.55, { n: dealt, slot: f.slot }));
  return dealt;
}

// Longest stretch of floor with no crack on it, between the walls.
function safestStrip(cracks: { x: number; w: number }[]): number {
  const edges = cracks.map((c) => [c.x - c.w / 2, c.x + c.w / 2]).sort((p, q) => p[0] - q[0]);
  let best = 0, at = ARENA.wall;
  for (const [l, r] of edges) {
    best = Math.max(best, l - at);
    at = Math.max(at, r);
  }
  return Math.max(best, ARENA.w - ARENA.wall - at);
}

function spawnCrack(m: Match, h: Hooks, tick: number, p: number) {
  const a = m.arena!, T = ARENA_TUNE.crack;
  if (a.cracks.length >= T.max) return;
  const w = lerp(T.width[0], T.width[1], p);
  for (let k = 0; k < 8; k++) {
    const x = ARENA.wall + 40 + h.roll(m, 300 + k * 3 + a.cracks.length) * (ARENA.w - 2 * ARENA.wall - 80);
    if (m.fighters.some((f) => Math.abs(f.x - x) < BODY.w / 2 + w / 2 + T.clear)) continue; // never under (or next to) a fighter
    if (a.cracks.some((c) => Math.abs(c.x - x) < (c.w + w) / 2 + T.gap)) continue;
    if (safestStrip([...a.cracks, { x, w }]) < T.safe) continue; // a safe strip always stays
    a.cracks.push({ id: m.nextId++, x: Math.round(x), w: Math.round(w), born: tick, glow: T.glow, end: tick + T.glow + T.live });
    h.emit(m, ev("crack", x, ARENA.ground));
    return;
  }
}

function spawnMeteor(m: Match, h: Hooks, tick: number) {
  const a = m.arena!, T = ARENA_TUNE.meteor;
  if (a.meteors.length >= T.max) return;
  for (let k = 0; k < 8; k++) {
    const near = h.roll(m, 400 + k * 4) < 0.6;
    const f = m.fighters[h.roll(m, 401 + k * 4) < 0.5 ? 0 : 1];
    const x = Math.min(ARENA.w - ARENA.wall - 40, Math.max(ARENA.wall + 40, near ? f.x + (h.roll(m, 402 + k * 4) - 0.5) * 2 * T.near : ARENA.wall + 40 + h.roll(m, 403 + k * 4) * (ARENA.w - 2 * ARENA.wall - 80)));
    const hit = tick + T.warn;
    if (a.meteors.some((o) => Math.abs(o.x - x) < T.sep || Math.abs(o.hit - hit) < T.apart)) continue;
    a.meteors.push({ id: m.nextId++, x: Math.round(x), born: tick, hit });
    h.emit(m, ev("meteor", x, ARENA.ground));
    return;
  }
}

// Nearest platform that is safe from the lava, as a spot to put a fighter back on.
function rescue(m: Match, h: Hooks, f: Fighter, tick: number) {
  const a = m.arena!;
  const spots = platformsAt(tick).filter((p) => safePlatform(p, tick));
  if (!spots.length) return;
  const gap = (p: Platform) => (f.x < p.x ? p.x - f.x : f.x > p.x + p.w ? f.x - (p.x + p.w) : 0);
  const to = spots.reduce((best, p) => (gap(p) < gap(best) ? p : best));
  f.x = Math.min(to.x + to.w - 20, Math.max(to.x + 20, f.x));
  f.y = to.top;
  f.vx = f.vy = 0;
  f.grounded = true;
  a.lavaT[f.slot] = 0;
  a.immune[f.slot] = ARENA_TUNE.lava.immune;
  h.emit(m, ev("rescue", f.x, f.y, { slot: f.slot }));
}

// One tick of the arena, called from step() while the fight is on (so never after a KO, and never after the match ends).
export function arenaStep(m: Match, h: Hooks) {
  const a = m.arena!, T = ARENA_TUNE;
  const tick = arenaTick(m);
  const scene = sceneAt(tick);
  if (tick % S === 0) {
    const b = Math.floor(tick / S) % 11;
    a.log[0][b] = a.log[1][b] = 0;
  }
  if (scene !== a.scene) {
    a.scene = scene;
    h.emit(m, ev("scene", 0, 0, { n: scene + 1 }));
  }
  for (const r of ROCKS) {
    if (tick === r.warn) h.emit(m, ev("rumble", r.x + r.w / 2, ARENA.ground));
    if (tick === r.rise) h.emit(m, ev("rise", r.x + r.w / 2, ARENA.ground));
  }

  // Cracks (scene 3): one more every few seconds, faster, wider and hotter as the scene goes on.
  a.cracks = a.cracks.filter((c) => tick < c.end);
  if (scene === 2 && tick >= a.next[0]) {
    const p = (tick - T.scenes[2]) / (T.scenes[3] - T.scenes[2]);
    spawnCrack(m, h, tick, p);
    a.next[0] = tick + Math.round(lerp(T.crack.every[0], T.crack.every[1], p));
  }
  // Meteors (scene 4): a marker now, the impact `warn` ticks later.
  if (scene === 3 && tick >= a.next[1] && tick < T.meteor.stop) {
    const p = (tick - T.scenes[3]) / (T.scenes[4] - T.scenes[3]);
    spawnMeteor(m, h, tick);
    a.next[1] = tick + Math.round(lerp(T.meteor.every[0], T.meteor.every[1], p));
  }
  for (const mt of a.meteors) {
    if (tick < mt.hit) continue;
    // The blast hurts whoever stands in it and isn't high in the air, but never both fighters on the same tick: the nearer one.
    const hurt = m.fighters.filter((f) => f.action !== "ko" && Math.abs(f.x - mt.x) < T.meteor.r + T.meteor.reach && f.y > ARENA.ground - T.meteor.height);
    if (hurt.length === 2) hurt.sort((p, q) => Math.abs(p.x - mt.x) - Math.abs(q.x - mt.x)).length = 1;
    for (const f of hurt) {
      envHurt(m, h, f, T.meteor.dmg, tick);
      f.vx = (f.x >= mt.x ? 1 : -1) * T.meteor.knock;
      f.vy = Math.min(f.vy, -4);
      f.grounded = false;
    }
    h.emit(m, ev("impact", mt.x, ARENA.ground));
  }
  a.meteors = a.meteors.filter((mt) => tick < mt.hit);

  const lava = lavaY(tick);
  for (const f of m.fighters) {
    if (f.action === "ko") continue;
    const s = f.slot;
    if (a.immune[s] > 0) a.immune[s]--;
    if (a.drop[s] > 0) a.drop[s]--;
    if (scene === 1 && tick > T.scenes[1] && tick % T.heat.every === 0) envHurt(m, h, f, T.heat.dmg, tick);

    const crack = f.grounded && f.y >= ARENA.ground - 1 ? a.cracks.find((c) => tick >= c.born + c.glow && Math.abs(f.x - c.x) <= c.w / 2) : undefined;
    const inLava = f.y > lava + T.lava.depth;
    const touching = a.immune[s] === 0 && (!!crack || inLava);
    a.lavaT[s] = inLava && a.immune[s] === 0 ? a.lavaT[s] + 1 : 0;
    if (touching) {
      a.contact[s]++;
      a.since[s] = 0;
      if (a.contact[s] % (inLava ? T.lava.hit : T.crack.hit) === 1) {
        const p = crack ? (tick - T.scenes[2]) / (T.scenes[3] - T.scenes[2]) : 0;
        const dealt = envHurt(m, h, f, inLava ? T.lava.dmg : lerp(T.crack.dmg[0], T.crack.dmg[1], Math.min(1, Math.max(0, p))), tick);
        if (dealt > 0) a.weak[s] = Math.min(T.weak.max, a.weak[s] + T.weak.step);
      }
    } else {
      a.contact[s] = 0;
      if (++a.since[s] > T.weak.after) a.weak[s] = Math.max(0, a.weak[s] - T.weak.recover);
    }
    if (a.lavaT[s] >= T.lava.rescue && !f.locked) rescue(m, h, f, tick);
  }
}
