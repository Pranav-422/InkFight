// Arena 1, Inferno Crater: one 5-minute fight on a volcanic floor that gets worse in five scenes (the spec is
// docs/design/arena-1/spec.md, the task sheet docs/tasks/arena-1.md). Everything here is a pure function of the match
// clock plus the small ArenaState kept on the Match (it goes into every Snapshot), so both players' browsers and the
// relay fallback see the same scene, platforms and hazards. No Math.random, no Date: rolls come from the sim's roll().
//
// Opt-in: createMatch(a, b, inputs, { arena: "inferno" }). Without it nothing here runs and a match is exactly the
// normal best-of-3.

import { CLASSES } from "../lib/stats";
import { MOVES } from "./moves";
import type { ConstellationId } from "./protocol";
import { ARENA, BODY, TICK_HZ } from "./space";
import type { Cue, Fighter, Input, Mark, Match, Slot } from "./sim";

export const ARENAS = ["inferno"] as const;
export type ArenaId = (typeof ARENAS)[number];
export const ARENA_INFO: Record<ArenaId, { name: string; short: string }> = {
  inferno: { name: "Inferno Crater", short: "Arena 1" },
};
export const isArenaId = (v: unknown): v is ArenaId => typeof v === "string" && (ARENAS as readonly string[]).includes(v);

const S = TICK_HZ;
const CLASS_ORDER = CLASSES as readonly string[];

// Every number of the mode lives here. Damage is a fraction of the fighter's health pool (see hpMul) so the same table
// works whatever the pool is. The spec leaves all of these open ("do not hardcode assumed values as final"): they are
// starting values, tuned with scripts/arena.ts.
export const ARENA_TUNE = {
  matchTicks: 300 * S, // the match clock: 5:00, never paused by a scene change
  scenes: [0, 30 * S, 60 * S, 105 * S, 150 * S] as const, // start tick of scenes 1-5 (30, 30, 45, 45, 150 seconds)
  // A normal fight is over in about 30 seconds, which would never reach scene 3. The arena pool is bigger so a fight
  // takes minutes (every hit counts the same relative to it: class balance is unchanged). HP bars show a fraction.
  hpMul: 18,
  // The long fight shifts some class matchups (the same Sword steps back from a Tank for minutes, a Tank's guard pays off
  // over a long pool), and class factors alone can't fix a matchup that goes in a circle. So the arena trims damage per
  // matchup: "A-B" (in CLASSES order) is the factor on what A deals to B; B deals to A the inverse. Found with
  // `npx tsx scripts/arena.ts --tune`; 1 = no change. Normal fights have no trims.
  matchup: { "Sword-Mace": 1.022, "Sword-Tank": 1, "Sword-Attacker": 1.1, "Sword-Fighter": 1.033, "Mace-Tank": 0.995, "Mace-Attacker": 1.037, "Mace-Fighter": 1.004, "Tank-Attacker": 0.95, "Tank-Fighter": 0.939, "Attacker-Fighter": 0.987 } as Record<string, number>,
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
  // Guided pauses (Match.cue): the fight and the clock hold still while everyone is told where to go. `climb`: how long the
  // "Get up there!" pause waits for both fighters to reach the final platform before it lifts whoever is still below.
  // `hold`: ticks both fighters linger once they are in place, so the arrival reads.
  cue: { climb: 25 * S, hold: 30 },
  // Weather: the sky, light and ash change over `fade` ticks (9 s) when a scene begins, not in a cut (the drawing reads it: arenaRender.ts).
  weather: { fade: 9 * S },
  // The ring (scene 5): once both fighters are up, walls rise `inset` px inside the final platform's edges over `rise` ticks and become solid
  // `lock` ticks after they start (nobody falls off mid-fight); the fighters are drawn `scale` times their size there (a drawing change only:
  // the hitboxes stay) so the platform reads as an arena. `marks`: the stand-here marks, `gap` px either side of the centre, `r` wide.
  ring: { inset: 18, rise: 60, lock: 120, scale: 0.88 },
  marks: { gap: 95, r: 14, until: 10 * S, hold: 80 },
  // The stars answer (scene 5, after the marks): each fighter's plausibility roll, `min`..`max` percent, becomes a damage buff: what they deal
  // x(1 + p), what they take / (1 + p) (the admin buff's two halves, 1.3 and 0.75, for p = 30%). The buffed fighter is drawn `look` (at the
  // smallest roll .. at the biggest) times bigger. `until`: how long the pause lasts, `at`: when each fighter's roll is shown inside it.
  buff: { min: 10, max: 50, look: [1.1, 1.2] as [number, number], until: 270, at: [60, 150] as [number, number] },
  // The ending (a knockout, or the clock when the health isn't equal): the fight is over, the result is decided, and the winner kicks the loser off the
  // ring into the lava. `wait`: ticks the fall and the "K.O.!" are left to read; the winner then walks to `gap` px from the loser at `walk` px a tick and
  // throws a roundhouse; the loser flies off at a vertical speed of `vy` (the horizontal one is whatever clears the nearest edge) and falls into the lava,
  // sinking at `sink` px a tick; then the loser's constellation streaks across the sky for `star` ticks while the weather clears, `after` ticks of calm
  // sky, and the result shows. `draw`: an equal-health timeout has no kick, only the calm. `drift`: how far sideways (px) a loser on the floor flies
  // before falling off the front of the slab into the lake, `inset`: how far from each wall the lake is in full view (the cliffs cover its ends:
  // nobody lands nearer a wall than that, unless they were already there). On the ring they fly clear of its edge instead. `deep`: how far below the
  // surface (px) the feet are when the splash fires: the body spins about its middle, 70 px up, so that is when it meets the lava.
  ending: { wait: 60, walk: 3.4, gap: 74, vy: -12, drift: 130, inset: 190, deep: 60, sink: 1.6, star: 170, after: 110, draw: 240 },
  // The opening ceremony, before any fighting (about 15 s at the longest): the arena's title card (`intro`), the stars waking
  // (`open`), each fighter locking a constellation (`pick`, then `lock` ticks to read the stamp once both have), and the two
  // chosen ones settling in the sky (`settle`). A fighter who hasn't locked when `pick` runs out gets the one under the cursor.
  ceremony: { intro: 90, open: 120, pick: 540, lock: 45, settle: 120 },
  // What each constellation grants for the whole fight (the numbers the sheet asks for; the rest of the rules stay as they are).
  stars: {
    phoenix: { lava: 0.4 }, // lava and cracks deal this share of their damage: 60% less (lava adaptation, spec section 6)
    hare: { jump: 1.15, air: 1.3 }, // jump and air control, all match (they stack with scene 5's boost)
    tortoise: { cap: 0.5, weak: 0.1 }, // the environment-damage cap is halved and scorch can't weaken hits by more than 10%
    serpent: { scorched: 1.1 }, // hits on a scorched opponent (weakened by lava or a crack) deal +10%
    comet: { energy: 1.15 }, // the special meter fills 15% faster
  },
};

// ------------------------------------------------------------------ constellations

export const CONSTELLATIONS: readonly ConstellationId[] = ["phoenix", "hare", "tortoise", "serpent", "comet"];
const pct = (v: number) => `${Math.round(Math.abs(v - 1) * 100)}%`;
// What a constellation is called and what it grants, written from ARENA_TUNE so the text can't drift from the numbers.
export function starInfo(id: ConstellationId): { name: string; skill: string } {
  const T = ARENA_TUNE.stars;
  switch (id) {
    case "phoenix":
      return { name: "Phoenix", skill: `Lava & cracks hurt ${Math.round((1 - T.phoenix.lava) * 100)}% less` };
    case "hare":
      return { name: "Hare", skill: `Jump +${pct(T.hare.jump)}, air control +${pct(T.hare.air)}` };
    case "tortoise":
      return { name: "Tortoise", skill: `Hazard cap halved, scorch max ${Math.round(T.tortoise.weak * 100)}%` };
    case "serpent":
      return { name: "Serpent", skill: `+${pct(T.serpent.scorched)} damage on scorched foes` };
    case "comet":
      return { name: "Comet", skill: `Special meter fills ${pct(T.comet.energy)} faster` };
  }
}

// ------------------------------------------------------------------ scenes

export const SCENE_NAMES = ["ARRIVAL", "HEATWAVE", "GROUND FRACTURE", "VOLCANIC WARNING", "ELEVATED FINAL ARENA"] as const;

export function sceneAt(tick: number): number {
  const s = ARENA_TUNE.scenes;
  for (let i = s.length - 1; i > 0; i--) if (tick >= s[i]) return i;
  return 0;
}

// Ticks of fight played so far. The timer only runs in the fight phase, so this is the match clock.
export const arenaTick = (m: Pick<Match, "timer">) => ARENA_TUNE.matchTicks - m.timer;
// The world clock drives what moves by itself (the rising staircase, the lava). It runs whenever the world moves, in a fight and in a
// guided pause, while the match clock above runs only in a fight: so it is the match clock plus the ticks spent paused.
export const arenaWorld = (m: Pick<Match, "timer" | "arena">) => arenaTick(m) + (m.arena?.pause ?? 0);

// ------------------------------------------------------------------ platforms

export type PlatformState = "hidden" | "warn" | "rising" | "up";
// x is the left edge of the support (a fighter's centre must be inside [x, x + w]). Every platform is one-way: jump up
// through it from below, land on top, hold S + jump to drop down. `dest` is the final top, `riseT` ticks into the rise.
export type Platform = { id: number; kind: "step" | "final"; x: number; w: number; top: number; dest: number; state: PlatformState; riseT: number };

const HIDDEN_TOP = ARENA.ground + 70; // below the floor: nothing can stand on it yet
// The staircase, mirrored around the centre. Each rise is 66-67 px (the weakest jumper clears 69), each gap 10-15 px,
// every step 70+ px wide, and the final platform is 480 px wide (it was 420: the ring needs room) with its top 200 px above the old floor.
// warn: the dust ring and rumble start (telegraph, at least 2 s); rise: it starts to come up; dur: how long it takes.
// Times are on the world clock (arenaWorld): the match clock plus the ticks spent in guided pauses, because the stairs
// rise while the "Get up there!" pause holds the match clock still. The whole staircase stands 6.5 s after scene 5 begins.
const ROCKS = [
  { id: 1, kind: "step", x: 65, w: 80, top: 414, warn: 8700, rise: 9000, dur: 60 },
  { id: 2, kind: "step", x: 815, w: 80, top: 414, warn: 8700, rise: 9000, dur: 60 },
  { id: 3, kind: "step", x: 160, w: 70, top: 347, warn: 9000, rise: 9150, dur: 60 },
  { id: 4, kind: "step", x: 730, w: 70, top: 347, warn: 9000, rise: 9150, dur: 60 },
  { id: 5, kind: "final", x: 240, w: 480, top: 280, warn: 9150, rise: 9300, dur: 90 },
] as const;
const FINAL = ROCKS[ROCKS.length - 1];
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

// Can a fighter land on it now? A step may be landed on while it rises (a fighter on top is carried up, never crushed); the final
// platform only once it has risen: it comes up through the middle of the floor, and carrying everyone standing there would make the
// climb pointless. (A fighter on the floor under it just sees it rise behind them, then jumps up through it or takes the stairs.)
export const landable = (p: Platform) => p.state === "up" || (p.state === "rising" && p.kind === "step");

// The lava surface (y, grows downward) at a world tick. Below the floor until scene 5, then it rises; it stops 35 px under the
// final platform, which it never reaches however long the pauses were.
const FINAL_TOP = FINAL.top;
export const lavaY = (world: number) => Math.max(FINAL_TOP + 35, world < ARENA_TUNE.scenes[4] ? ARENA_TUNE.lava.start : ARENA_TUNE.lava.start - ARENA_TUNE.lava.rate * (world - ARENA_TUNE.scenes[4]));

// A platform a fighter can be sent to: standing, with its top clear of the lava.
const safePlatform = (p: Platform, world: number) => landable(p) && p.top < lavaY(world) - ARENA_TUNE.lava.margin;

// The platform a fighter stands on (feet on its top), or null on the floor / in the air.
export function standingOn(m: Pick<Match, "timer" | "arena">, f: Pick<Fighter, "x" | "y">): Platform | null {
  if (!m.arena) return null;
  for (const p of platformsAt(arenaWorld(m))) if (landable(p) && Math.abs(f.y - p.top) < 0.5 && f.x >= p.x && f.x <= p.x + p.w) return p;
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
  pause: number; // ticks spent in guided pauses since the fight began (see arenaWorld)
  beat: number; // how many of the story's beats (ARENA_STORY) have been played
  pick: [ConstellationId | null, ConstellationId | null]; // each fighter's locked constellation (null until they lock one)
  cur: [number, number]; // each fighter's cursor in the ceremony's list (index into CONSTELLATIONS)
  dir: [number, number]; // the direction each fighter held last tick (a press moves the cursor once)
  seed: number; // the match's seed (a number the host picks): every roll of the arena mixes it in, so no two matches roll alike
  ring: number; // ticks since the ring began to rise (0: no ring yet); the walls are solid from ARENA_TUNE.ring.lock
  buff: [number, number]; // each fighter's plausibility buff in percent (0 until the stars answer)
  side: [number, number]; // 0 / 1: which end of the ring's sky each fighter's constellation hangs over (the side they stand on)
  end: Ending | null; // the scripted ending, once the result is decided
};

// The scripted ending, planned `wait` ticks after the result (when everyone has settled). All times are ticks into the round-end phase.
export type Ending = {
  w: Slot; // the winner: walks over and kicks
  l: Slot | -1; // the loser: kicked off the ring (-1: a draw, nobody is)
  planned: boolean;
  d: number; // the way the loser is kicked: -1 left, 1 right (away from the winner)
  spot: number; // where the winner stands to kick
  kickAt: number;
  hitAt: number; // the boot lands
  splashAt: number; // the loser reaches the lava
  until: number; // the result shows
  x0: number;
  y0: number; // where the loser was kicked from
  vx: number;
  lava: number; // the surface they fall into
};

export function newArena(id: ArenaId, seed = 0): ArenaState {
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
    pause: 0,
    beat: 0,
    pick: [null, null],
    cur: [0, 2],
    dir: [0, 0],
    seed,
    ring: 0,
    buff: [0, 0],
    side: [0, 1],
    end: null,
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
  pick: [a.pick[0], a.pick[1]],
  cur: [...a.cur],
  dir: [...a.dir],
  buff: [a.buff[0], a.buff[1]],
  side: [a.side[0], a.side[1]],
  end: a.end && { ...a.end },
});

// The arena's damage trim for a class hitting another (ARENA_TUNE.matchup).
export function matchupFactor(att: string, vic: string): number {
  const i = CLASS_ORDER.indexOf(att), j = CLASS_ORDER.indexOf(vic);
  if (i < 0 || j < 0 || i === j) return 1;
  return i < j ? (ARENA_TUNE.matchup[`${att}-${vic}`] ?? 1) : 1 / (ARENA_TUNE.matchup[`${vic}-${att}`] ?? 1);
}

// Jump and air-control multipliers for a fighter: scene 5's boost, and the Hare's own on top of it. (1 / 1 outside an arena.)
export function arenaBoost(m: Match, slot: Slot): { jump: number; air: number } {
  const scene5 = m.arena && sceneAt(arenaTick(m)) === 4 ? ARENA_TUNE.boost : { jump: 1, air: 1 };
  if (m.arena?.pick[slot] !== "hare") return scene5;
  return { jump: scene5.jump * ARENA_TUNE.stars.hare.jump, air: scene5.air * ARENA_TUNE.stars.hare.air };
}

// The arena's say in how hard a hit lands: the attacker's scorch weakness (lava and cracks), the class matchup trim, the
// Serpent's bonus on a scorched foe, the plausibility buffs. Everything is 1 when nothing applies.
export function arenaDamageFactor(m: Match, att: Fighter, vic: Fighter): number {
  const a = m.arena!;
  const serpent = a.pick[att.slot] === "serpent" && a.weak[vic.slot] > 0 ? ARENA_TUNE.stars.serpent.scorched : 1;
  const buff = (1 + a.buff[att.slot] / 100) / (1 + a.buff[vic.slot] / 100); // what the stars gave each: dealt up, taken down
  return (1 - a.weak[att.slot]) * matchupFactor(m.defs[att.slot].cls, m.defs[vic.slot].cls) * serpent * buff;
}

// The Comet's faster special meter (1 for everyone else and outside an arena).
export const arenaEnergyMul = (m: Match, slot: Slot) => (m.arena?.pick[slot] === "comet" ? ARENA_TUNE.stars.comet.energy : 1);

// Where a falling fighter lands: the floor, or the highest platform top it crossed this tick. `prevY` is the feet before
// the move, so even at a fall speed of 60 px/tick it can't pass through a platform (it checks the crossing, not the end
// point). A rising rock that comes up under feet lifts them: the fighter is carried, never crushed or trapped.
export function arenaSurface(m: Match, f: Fighter, prevY: number): number | null {
  const a = m.arena!;
  let top: number | null = f.y >= ARENA.ground ? ARENA.ground : null;
  if (a.drop[f.slot] > 0) return top;
  const world = arenaWorld(m);
  const now = platformsAt(world);
  const before = platformsAt(Math.max(0, world - 1)).map((p) => p.top); // (copy: the cache holds one tick)
  for (let i = 0; i < now.length; i++) {
    const p = now[i];
    if (!landable(p) || f.x < p.x || f.x > p.x + p.w) continue;
    if (prevY <= before[i] + 0.01 && f.y >= p.top - 0.01 && (top === null || p.top < top)) top = p.top;
  }
  return top;
}

// The ring on the final platform: walls inside its edges, solid once they have risen. A fighter at or above the platform can't cross them
// (so nobody is knocked off mid-fight), and can't drop through the platform either.
export const ringUp = (m: Pick<Match, "arena">) => !!m.arena && m.arena.ring >= ARENA_TUNE.ring.lock;
// Where a fighter's centre may be inside the ring (and the posts' x for the drawing: `lo - BODY.w / 2` and `hi + BODY.w / 2`).
export const ringBounds = () => ({ lo: FINAL.x + ARENA_TUNE.ring.inset + BODY.w / 2, hi: FINAL.x + FINAL.w - ARENA_TUNE.ring.inset - BODY.w / 2 });
export function arenaRingClamp(m: Match, f: Fighter) {
  if (!ringUp(m) || f.y > FINAL.top + 1) return;
  const { lo, hi } = ringBounds();
  if (f.x < lo) {
    f.x = lo;
    if (f.vx < 0) f.vx = 0;
  } else if (f.x > hi) {
    f.x = hi;
    if (f.vx > 0) f.vx = 0;
  }
}
export const arenaCanDrop = (m: Match, f: Fighter) => {
  const p = standingOn(m, f);
  return !!p && !(ringUp(m) && p.kind === "final");
};

// A held fighter is pinned in front of the attacker (LOCK.gap): on a platform that must stay on the platform (in the ring, inside its walls).
export function arenaClampX(m: Match, att: Fighter, x: number): number {
  const p = standingOn(m, att);
  if (p && ringUp(m) && p.kind === "final") {
    const { lo, hi } = ringBounds();
    return Math.min(hi, Math.max(lo, x));
  }
  return p ? Math.min(p.x + p.w - 12, Math.max(p.x + 12, x)) : x;
}

// ------------------------------------------------------------------ per-tick update

type Hooks = { roll: (m: Match, salt: number) => number; emit: (m: Match, e: ArenaEvent) => void };
export type ArenaEventKind = "scene" | "crack" | "meteor" | "impact" | "rumble" | "rise" | "burn" | "rescue" | "cue" | "warp" | "star" | "ring" | "buff" | "boot" | "splash" | "shoot";
// What the renderer and the sound get through the sim's event list (it keeps the last 16, so a skipped relay snapshot loses nothing).
// scene: n = 1-5. burn: n = damage, slot. rescue / warp: slot. cue: a guided pause began (its text is in the snapshot). star: slot locked
// constellation n (index into CONSTELLATIONS). ring: the walls start to rise. buff: slot's roll n percent (the stars answered). boot: the winner's kick
// lands (x, y: on the loser). splash: the loser hits the lava. shoot: the loser's constellation starts to fall. The rest: x is where.
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
  const cap = ARENA_TUNE.env.cap * (a.pick[f.slot] === "tortoise" ? ARENA_TUNE.stars.tortoise.cap : 1);
  const dealt = Math.min(want, Math.round(cap * pool) - bucketSum(a, f.slot), Math.floor(f.hp) - 1);
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
function rescue(m: Match, h: Hooks, f: Fighter, world: number) {
  const a = m.arena!;
  const spots = platformsAt(world).filter((p) => safePlatform(p, world));
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

// What the world does by itself on every tick it moves, in a fight and in a guided pause: announce a new scene, and the
// staircase's rumble and rise cues (on the world clock). Each world tick is visited exactly once.
function worldStep(m: Match, h: Hooks) {
  const a = m.arena!;
  const scene = sceneAt(arenaTick(m));
  if (scene !== a.scene) {
    a.scene = scene;
    h.emit(m, ev("scene", 0, 0, { n: scene + 1 }));
  }
  if (a.ring > 0 && a.ring < 60000) a.ring++;
  const world = arenaWorld(m);
  for (const r of ROCKS) {
    if (world === r.warn) h.emit(m, ev("rumble", r.x + r.w / 2, ARENA.ground));
    if (world === r.rise) h.emit(m, ev("rise", r.x + r.w / 2, ARENA.ground));
  }
}

// One tick of the arena, called from step() while the fight is on (so never after a KO, and never after the match ends).
export function arenaStep(m: Match, h: Hooks) {
  const a = m.arena!, T = ARENA_TUNE;
  const tick = arenaTick(m);
  const world = arenaWorld(m);
  const scene = sceneAt(tick);
  if (tick % S === 0) {
    const b = Math.floor(tick / S) % 11;
    a.log[0][b] = a.log[1][b] = 0;
  }
  worldStep(m, h);

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

  const lava = lavaY(world);
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
        const hurt = (inLava ? T.lava.dmg : lerp(T.crack.dmg[0], T.crack.dmg[1], Math.min(1, Math.max(0, p)))) * (a.pick[s] === "phoenix" ? T.stars.phoenix.lava : 1);
        const dealt = envHurt(m, h, f, hurt, tick);
        if (dealt > 0) a.weak[s] = Math.min(a.pick[s] === "tortoise" ? Math.min(T.weak.max, T.stars.tortoise.weak) : T.weak.max, a.weak[s] + T.weak.step);
      }
    } else {
      a.contact[s] = 0;
      if (++a.since[s] > T.weak.after) a.weak[s] = Math.max(0, a.weak[s] - T.weak.recover);
    }
    if (a.lavaT[s] >= T.lava.rescue && !f.locked) rescue(m, h, f, world);
  }
}

// ------------------------------------------------------------------ the story: guided pauses

// The match tells a story in beats, each a guided pause (Match.cue: the clock and the fight hold still and everyone is told
// where to go). `at`: the match tick the beat waits for; a beat without it follows the previous one at once. `make` builds
// the cue (and sets up whatever state it needs), `end` settles it when it is over (`timedOut`: nobody finished it).
type Beat = { id: string; at?: number; make: (m: Match, h: Hooks) => Cue; end?: (m: Match, h: Hooks, cue: Cue, timedOut: boolean) => void };

// Put a fighter on a mark at once (a puff and a sound): what a pause does to whoever hasn't arrived when it times out.
function warp(m: Match, h: Hooks, f: Fighter, mk: { x: number; y: number; r: number }) {
  f.x = Math.min(mk.x + mk.r - 12, Math.max(mk.x - mk.r + 12, f.x));
  f.y = mk.y;
  f.vx = f.vy = 0;
  f.grounded = true;
  h.emit(m, ev("warp", f.x, f.y, { slot: f.slot }));
}

// Lock a constellation for a fighter. The other fighter's cursor moves on if it was resting there (and that is returned: a press the
// other fighter made on the same tick was for the one just taken, so it must not lock the next one).
function lockStar(m: Match, h: Hooks, slot: Slot, id: ConstellationId): boolean {
  const a = m.arena!;
  a.pick[slot] = id;
  m.cue!.done[slot] = true;
  h.emit(m, ev("star", 0, 0, { n: CONSTELLATIONS.indexOf(id), slot }));
  const other = (1 - slot) as Slot;
  if (a.pick[other] || CONSTELLATIONS[a.cur[other]] !== id) return false;
  a.cur[other] = nextFree(a, other, a.cur[other], 1);
  return true;
}

// The next constellation along `dir` that nobody has locked (the cursor skips what the other fighter took).
function nextFree(a: ArenaState, slot: Slot, from: number, dir: number): number {
  const n = CONSTELLATIONS.length;
  for (let k = 1; k <= n; k++) {
    const i = (((from + dir * k) % n) + n) % n;
    if (!a.pick.includes(CONSTELLATIONS[i])) return i;
  }
  return from;
}

// What the ceremony reads from the buttons, before the fighters consume them: left / right move the cursor one place per press,
// punch locks the constellation under it (when the other fighter hasn't taken it). Slot 0 is read first, so a tie goes to P1.
export function arenaCueInput(m: Match, inputs: [Input, Input], h: Hooks) {
  const a = m.arena!;
  if (m.cue?.id !== "pick") return;
  const bumped = [false, false]; // whose cursor the other fighter's lock just moved
  for (const f of m.fighters) {
    const s = f.slot, input = inputs[s];
    if (a.pick[s]) continue;
    const dir = (input.right ? 1 : 0) - (input.left ? 1 : 0);
    if (dir !== 0 && dir !== a.dir[s]) a.cur[s] = nextFree(a, s, a.cur[s], dir);
    a.dir[s] = dir;
    if (input.attack !== f.seen.attack && !bumped[s] && lockStar(m, h, s, CONSTELLATIONS[a.cur[s]])) bumped[1 - s] = true;
  }
}

// How much bigger a fighter with this plausibility buff (percent) is drawn: ARENA_TUNE.buff.look, by where the roll falls between min and max.
export function buffScale(p: number): number {
  const B = ARENA_TUNE.buff;
  if (p <= 0) return 1;
  return B.look[0] + (B.look[1] - B.look[0]) * Math.min(1, Math.max(0, (p - B.min) / (B.max - B.min)));
}

// A pause that sent the fighters to marks and timed out: whoever isn't on theirs is put there.
function liftStragglers(m: Match, h: Hooks, cue: Cue, timedOut: boolean) {
  if (!timedOut || !cue.target) return;
  for (const f of m.fighters) if (!cue.done[f.slot]) warp(m, h, f, cue.target[f.slot]);
}

const STORY: Beat[] = [
  // The opening ceremony. The stars wake in the sky...
  { id: "open", make: () => ({ id: "open", text: "THE STARS WAKE", until: ARENA_TUNE.ceremony.open, hold: 0, done: [false, false] }) },
  // ...each fighter locks one (the cursor and the lock are read in arenaCueInput; a fighter who doesn't gets the one under the cursor)...
  {
    id: "pick",
    make: () => ({ id: "pick", text: "CHOOSE YOUR CONSTELLATION", until: ARENA_TUNE.ceremony.pick, hold: ARENA_TUNE.ceremony.lock, done: [false, false] }),
    end: (m, h) => {
      const a = m.arena!;
      for (const f of m.fighters) {
        if (a.pick[f.slot]) continue;
        if (a.pick.includes(CONSTELLATIONS[a.cur[f.slot]])) a.cur[f.slot] = nextFree(a, f.slot, a.cur[f.slot], 1);
        lockStar(m, h, f.slot, CONSTELLATIONS[a.cur[f.slot]]);
      }
    },
  },
  // ...and only the two chosen ones stay in the sky.
  { id: "settle", make: () => ({ id: "settle", text: "THE STARS ARE SET", until: ARENA_TUNE.ceremony.settle, hold: 0, done: [false, false] }) },
  // Scene 5: the staircase rises and the fight stops until both fighters are on the final platform (nobody fights on the
  // stairs). Whoever is still below after the timeout is lifted up.
  {
    id: "climb",
    at: ARENA_TUNE.scenes[4],
    make: () => {
      const mark = { x: FINAL.x + FINAL.w / 2, y: FINAL.top, r: FINAL.w / 2 - 20 };
      return { id: "climb", text: "GET UP THERE!", until: ARENA_TUNE.cue.climb, hold: ARENA_TUNE.cue.hold, target: [mark, mark], done: [false, false] };
    },
    end: (m, h, cue, timedOut) => liftStragglers(m, h, cue, timedOut),
  },
  // The ring: the walls rise and each fighter walks to a mark, the one standing further left to the left mark (so they face each other from
  // opposite sides). Whoever isn't on theirs at the timeout is put there.
  {
    id: "marks",
    make: (m, h) => {
      m.arena!.ring = 1;
      h.emit(m, ev("ring", FINAL.x + FINAL.w / 2, FINAL.top));
      const T = ARENA_TUNE.marks, cx = FINAL.x + FINAL.w / 2;
      const left = m.fighters[0].x <= m.fighters[1].x ? 0 : 1;
      m.arena!.side = left === 0 ? [0, 1] : [1, 0];
      const at = (x: number): Mark => ({ x, y: FINAL.top, r: T.r });
      const target: [Mark, Mark] = left === 0 ? [at(cx - T.gap), at(cx + T.gap)] : [at(cx + T.gap), at(cx - T.gap)];
      return { id: "marks", text: "TAKE YOUR MARKS", until: T.until, hold: T.hold, target, done: [false, false] };
    },
    end: (m, h, cue, timedOut) => liftStragglers(m, h, cue, timedOut),
  },
  // The stars answer: each fighter's constellation glows bright and the plausibility roll (one per fighter, seeded) becomes their buff. The roll is
  // taken here; the drawing shows each one a moment apart (ARENA_TUNE.buff.at).
  {
    id: "reveal",
    make: (m, h) => {
      const B = ARENA_TUNE.buff;
      for (const f of m.fighters) {
        const p = B.min + Math.floor(h.roll(m, 700 + f.slot) * (B.max - B.min + 1));
        m.arena!.buff[f.slot] = p;
        h.emit(m, ev("buff", f.x, f.y, { n: p, slot: f.slot }));
      }
      return { id: "reveal", text: "THE STARS ANSWER", until: B.until, hold: 0, done: [false, false] };
    },
  },
];
export const ARENA_STORY_LENGTH = STORY.length;
export const ARENA_STORY_IDS: readonly string[] = STORY.map((b) => b.id); // (the order the beats are told in, for tests and tools)

function begin(m: Match, h: Hooks, b: Beat): Cue {
  m.arena!.beat++;
  h.emit(m, ev("cue", 0, 0));
  return b.make(m, h);
}

// The end of the intro: the opening ceremony, if the story starts with one (it may already have been told).
export function arenaOpen(m: Match, h: Hooks): Cue | null {
  const b = STORY[m.arena!.beat];
  return b && b.at === undefined ? begin(m, h, b) : null;
}

// After a tick of the fight: is the next beat due? Returns its cue (step() then starts the pause) or null.
export function arenaBeat(m: Match, h: Hooks): Cue | null {
  const b = STORY[m.arena!.beat];
  return b && b.at !== undefined && arenaTick(m) >= b.at ? begin(m, h, b) : null;
}

// One tick of a guided pause: the world keeps moving (the stairs rise) on its own clock while the match clock holds.
export function arenaCueTick(m: Match, h: Hooks) {
  worldStep(m, h);
  if (m.timer < ARENA_TUNE.matchTicks) m.arena!.pause++; // (a pause before the first fight tick doesn't move the world)
}

// A pause is over. Settles it, then returns the beat that follows at once, or null: back to the fight.
export function arenaCueEnd(m: Match, h: Hooks, cue: Cue, timedOut: boolean): Cue | null {
  const i = STORY.findIndex((b) => b.id === cue.id);
  STORY[i]?.end?.(m, h, cue, timedOut);
  const next = STORY[m.arena!.beat];
  return next && next.at === undefined ? begin(m, h, next) : null;
}

// ------------------------------------------------------------------ the ending

const GRAV = 0.75; // (the sim's gravity: the loser's flight is a parabola under it)

// The result is decided (called from the sim's endRound): nothing is planned yet, the fall and the "K.O.!" are given time to play.
export function arenaEndBegin(m: Match, winner: Slot | null) {
  const a = m.arena!, E = ARENA_TUNE.ending;
  a.end = { w: winner ?? 0, l: winner === null ? -1 : ((1 - winner) as Slot), planned: false, d: 1, spot: 0, kickAt: 0, hitAt: 0, splashAt: 0, until: winner === null ? E.draw : E.wait + 600, x0: 0, y0: 0, vx: 0, lava: 0 };
}

// Where the lava is for this ending: in the ring, the rising lava; on the floor, the lake under the slab.
const lavaFor = (m: Match) => (m.arena!.ring > 0 ? lavaY(arenaWorld(m)) : ARENA.ground + 52);

// Plan the kick from where everyone ended up: the loser is kicked away from the winner, off the nearest end of whatever they stand on.
function planEnding(m: Match, e: Ending) {
  const E = ARENA_TUNE.ending, W = m.fighters[e.w], L = m.fighters[e.l as Slot];
  const ring = m.arena!.ring > 0;
  e.d = L.x >= W.x ? 1 : -1;
  e.x0 = L.x;
  e.y0 = L.y;
  e.spot = L.x - e.d * E.gap;
  e.lava = lavaFor(m);
  // Time in the air: the loser rises at -vy and falls under gravity to the lava.
  const air = Math.ceil((-E.vy + Math.sqrt(E.vy * E.vy + 2 * GRAV * Math.max(1, e.lava + E.deep - e.y0))) / GRAV);
  // The ring: off the edge of the platform. The floor: off the front of the slab into the lake, where it shows (the cliffs cover its ends).
  // A loser nearer a wall than that just drops.
  const exit = ring ? (e.d > 0 ? FINAL.x + FINAL.w + 70 : FINAL.x - 70) : Math.min(ARENA.w - E.inset, Math.max(E.inset, e.x0 + e.d * E.drift));
  e.vx = ring ? Math.min(22, Math.max(6, Math.abs(exit - e.x0) / air)) : Math.max(0, e.d * (exit - e.x0)) / air;
  const walk = Math.ceil(Math.max(0, Math.abs(W.x - e.spot) - 1) / E.walk);
  const kick = MOVES.roundhouse;
  e.kickAt = Math.max(E.wait, m.phaseT) + walk + 8;
  e.hitAt = e.kickAt + Math.round((kick.from + kick.to) / 2);
  e.splashAt = e.hitAt + air;
  e.until = e.splashAt + E.star + E.after;
  e.planned = true;
}

// One tick of the ending (after the fighters have moved, so what is set here is what the snapshot shows).
export function arenaEndStep(m: Match, h: Hooks) {
  const a = m.arena!, e = a.end;
  if (!e) return;
  const E = ARENA_TUNE.ending, t = m.phaseT;
  if (e.l < 0) return; // a draw: no kick, only the calm (the drawing reads end.until)
  if (!e.planned && t >= E.wait) planEnding(m, e);
  if (!e.planned) return;
  const W = m.fighters[e.w], L = m.fighters[e.l as Slot];
  if (t < e.kickAt) {
    // The winner walks to the kick.
    const dx = e.spot - W.x;
    if (Math.abs(dx) > E.walk) {
      W.x += Math.sign(dx) * E.walk;
      W.moving = true;
    } else W.x = e.spot;
    W.facing = e.d > 0 ? 1 : -1;
    if (L.action !== "ko") {
      L.action = "hit"; // (a loss on the clock: the loser reels, beaten)
      L.stun = 9999;
      L.t = 0;
    }
  }
  if (t === e.kickAt) {
    W.action = "kick";
    W.move = "roundhouse";
    W.t = 0;
    W.landed = true; // (a show, not a blow: it deals nothing)
    W.facing = e.d > 0 ? 1 : -1;
  }
  if (t === e.hitAt) {
    L.action = "ko";
    L.t = 0;
    m.freeze = Math.max(m.freeze, 8); // the boot lands: a beat of hit-stop
    h.emit(m, ev("boot", L.x, L.y - BODY.h * 0.5, { slot: L.slot }));
  }
  if (t >= e.hitAt) {
    // The loser's flight is scripted: a parabola off the edge, then into the lava and down.
    const u = Math.min(t, e.splashAt) - e.hitAt;
    L.x = e.x0 + e.d * e.vx * u;
    L.y = t < e.splashAt ? e.y0 + E.vy * u + 0.5 * GRAV * u * u : e.lava + E.deep + (t - e.splashAt) * E.sink;
    L.vx = L.vy = 0;
    L.grounded = false;
    L.action = "ko";
    if (t === e.splashAt) h.emit(m, ev("splash", L.x, e.lava, { slot: L.slot }));
    if (t === e.splashAt + 12) h.emit(m, ev("shoot", 0, 0, { slot: L.slot }));
  }
}
