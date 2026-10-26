// How the computer plays an arena fight (called from cpu.ts): step out of glowing cracks and meteor markers, and in scene 5
// climb the staircase to the final platform. The climb is a breadth-first search over the platforms that stand, where an edge
// A → B exists if a jump planned with this fighter's own numbers (deriveDef jump / speed / air control, the scene-5 boost)
// lands on B. The plan is found by replaying the sim's jump physics, so it is right for an AGI-40 fighter and for an AGI-100 one.

import { ARENA_TUNE, arenaBoost, arenaWorld, CONSTELLATIONS, platformsAt, ROCK_DEFS, standingOn, type Platform } from "./arena";
import { ARENA, BODY } from "./space";
import { GRAVITY, type FighterDef, type Input, type Match, type Slot } from "./sim";

const FLOOR = 0; // node id of the floor; platforms use their own ids (1-5)
const FINAL = ROCK_DEFS.find((r) => r.kind === "final")!.id;

type Node = { id: number; top: number; x0: number; x1: number }; // x0..x1: where a fighter's centre can stand
export type Hop = { from: number; to: number; x: number; dir: -1 | 1; hold: number }; // takeoff x, air-control direction, ticks of air control

const floorNode: Node = { id: FLOOR, top: ARENA.ground, x0: ARENA.wall + BODY.w / 2, x1: ARENA.w - ARENA.wall - BODY.w / 2 };
const nodeOf = (p: Platform): Node => ({ id: p.id, top: p.top, x0: p.x, x1: p.x + p.w });

// Where a jump from `x` on a surface at `fromTop` lands: the highest surface crossed on the way down. A standing takeoff
// (no run-up, so the plan doesn't depend on the walk speed or the back-walk penalty), then `hold` ticks of air control towards `dir`.
function landing(nodes: Node[], fromTop: number, x0: number, v0: number, air: number, cap: number, dir: -1 | 1, hold: number): { id: number; x: number } | null {
  let x = x0, y = fromTop, vx = 0, vy = -v0;
  for (let t = 0; t < 240; t++) {
    if (t >= 1 && t <= hold) {
      const nv = vx + dir * air;
      if (Math.abs(nv) <= cap || Math.abs(nv) < Math.abs(vx)) vx = nv;
    }
    const py = y;
    vy += GRAVITY;
    x += vx;
    y += vy;
    x = Math.min(ARENA.w - ARENA.wall - BODY.w / 2, Math.max(ARENA.wall + BODY.w / 2, x));
    if (t === 0 || vy <= 0) continue; // still on the way up (or the takeoff tick)
    let best: Node | null = null;
    for (const n of nodes) if (x >= n.x0 && x <= n.x1 && py <= n.top + 0.01 && y >= n.top - 0.01 && (!best || n.top < best.top)) best = n;
    if (best) return { id: best.id, x };
  }
  return null;
}

// Every takeoff on `from` that lands on `to` with room to spare (±4 px of takeoff error and 6 px from either edge): the best plan for
// each takeoff x (the one furthest from either edge, then the shortest air-control burst). Empty when `to` can't be reached.
export function planHops(def: FighterDef, boost: { jump: number; air: number }, nodes: Node[], from: Node, to: Node): (Hop & { margin: number })[] {
  if (to.top >= from.top) return [];
  const v0 = def.jump * boost.jump, air = def.air * boost.air, cap = def.speed * 1.3;
  const dirs: (-1 | 1)[] = to.x0 + to.x1 >= from.x0 + from.x1 ? [1, -1] : [-1, 1];
  const out: (Hop & { margin: number })[] = [];
  for (let x = Math.ceil(from.x0 + 4); x <= from.x1 - 4; x += 3) {
    let best: (Hop & { margin: number }) | null = null;
    for (const dir of dirs) {
      for (let hold = 0; hold <= 40; hold++) {
        let margin = Infinity;
        for (const e of [-4, 0, 4]) {
          const l = landing(nodes, from.top, x + e, v0, air, cap, dir, hold);
          if (!l || l.id !== to.id) { margin = -1; break; }
          margin = Math.min(margin, l.x - to.x0, to.x1 - l.x);
        }
        if (margin < 6) continue;
        if (!best || margin > best.margin + 0.5 || (Math.abs(margin - best.margin) <= 0.5 && hold < best.hold)) best = { from: from.id, to: to.id, x, dir, hold, margin };
      }
    }
    if (best) out.push(best);
  }
  return out;
}

// The takeoff to use from `x`: among the comfortable plans (margin within reach of the best one, or 25 px), the one nearest to x. So
// two fighters going the same way don't both queue for the single best spot (they would push each other away from it for ever).
export function pickHop(plans: (Hop & { margin: number })[], x: number): Hop | null {
  if (!plans.length) return null;
  const ok = Math.min(25, Math.max(...plans.map((p) => p.margin)));
  const near = plans.filter((p) => p.margin >= ok).reduce((a, b) => (Math.abs(b.x - x) < Math.abs(a.x - x) || (Math.abs(b.x - x) === Math.abs(a.x - x) && b.hold < a.hold) ? b : a));
  return { from: near.from, to: near.to, x: near.x, dir: near.dir, hold: near.hold };
}

// Kept for scripts: the best single takeoff (the one furthest from either edge).
export function planHop(def: FighterDef, boost: { jump: number; air: number }, nodes: Node[], from: Node, to: Node): Hop | null {
  const plans = planHops(def, boost, nodes, from, to);
  if (!plans.length) return null;
  const best = plans.reduce((a, b) => (b.margin > a.margin + 0.5 || (Math.abs(b.margin - a.margin) <= 0.5 && b.hold < a.hold) ? b : a));
  return { from: best.from, to: best.to, x: best.x, dir: best.dir, hold: best.hold };
}

const planCache = new Map<string, (Hop & { margin: number })[]>();
const planFor = (def: FighterDef, boost: { jump: number; air: number }, nodes: Node[], a: Node, b: Node) => {
  const key = `${def.jump}|${def.air}|${boost.jump}|${boost.air}|${nodes.map((n) => `${n.id}:${n.top}`).join(",")}|${a.id}>${b.id}`;
  if (!planCache.has(key)) planCache.set(key, planHops(def, boost, nodes, a, b));
  return planCache.get(key)!;
};

// The platforms a fighter can stand on now: fully risen (a rising rock is still moving). `world`: arenaWorld.
const standing = (world: number) => platformsAt(world).filter((p) => p.state === "up").map(nodeOf);

// First step of the shortest chain of jumps from `from` to `goalId` (the final platform unless told otherwise), or null.
// The nodes are tried nearest first, so of two equally short staircases a fighter takes the one on its own side.
export function nextHop(def: FighterDef, boost: { jump: number; air: number }, nodes: Node[], from: Node, goalId: number = FINAL, x = (from.x0 + from.x1) / 2): Hop | null {
  const goal = nodes.find((n) => n.id === goalId);
  if (!goal || from.id === goalId) return null;
  const centre = (n: Node) => (n.x0 + n.x1) / 2;
  const near = [...nodes].sort((p, q) => Math.abs(centre(p) - centre(from)) - Math.abs(centre(q) - centre(from)));
  const prev = new Map<number, { via: number; plans: (Hop & { margin: number })[] }>();
  const seen = new Set([from.id]);
  const queue = [from];
  while (queue.length) {
    const a = queue.shift()!;
    for (const b of near) {
      if (seen.has(b.id)) continue;
      const plans = planFor(def, boost, nodes, a, b);
      if (!plans.length) continue;
      seen.add(b.id);
      prev.set(b.id, { via: a.id, plans });
      if (b.id === goalId) {
        let at: number = b.id;
        let first = plans;
        while (prev.get(at)) {
          first = prev.get(at)!.plans;
          at = prev.get(at)!.via;
        }
        return pickHop(first, x);
      }
      queue.push(b);
    }
  }
  return null;
}

// The jump being flown (hop, hopT) and, in the ceremony, which constellation it wants and when it gets round to picking (brain.nav).
export type NavMemory = { hop?: Hop; hopT?: number; want?: number; pickT?: number; delay?: number };

// Hazard avoidance and the climb. Returns true when it set the movement for this tick (the fight logic then stands down).
export function arenaNav(m: Match, slot: Slot, def: FighterDef, mem: NavMemory, input: Input): boolean {
  const a = m.arena!;
  const me = m.fighters[slot];
  const world = arenaWorld(m);
  const T = ARENA_TUNE;
  const go = (dir: -1 | 0 | 1) => {
    input.left = dir < 0;
    input.right = dir > 0;
    input.block = false;
  };

  // Flying a planned jump: hold the air-control direction for its burst, then let go.
  if (!me.grounded && mem.hop) {
    go(mem.hopT! < mem.hop.hold ? mem.hop.dir : 0);
    mem.hopT!++;
    return true;
  }
  if (me.grounded) mem.hop = undefined;
  if (me.action !== "idle" || !me.grounded) return false;

  // Cracks: once a zone glows, leave it (and a margin of floor round it). Meteors: step out of the marker. Floor only.
  if (me.y >= ARENA.ground - 1) {
    const pad = BODY.w / 2 + 10;
    const zones = [
      ...a.cracks.map((c) => ({ x: c.x, r: c.w / 2 + pad })),
      ...a.meteors.map((mt) => ({ x: mt.x, r: T.meteor.r + T.meteor.reach + 24 })),
    ];
    const inside = zones.filter((z) => Math.abs(me.x - z.x) < z.r);
    if (inside.length) {
      const lo = floorNode.x0, hi = floorNode.x1;
      const free = (x: number) => x >= lo && x <= hi && !zones.some((z) => Math.abs(x - z.x) < z.r - 4);
      const exits = [-1, 1].map((d) => {
        let x = me.x;
        while (x >= lo && x <= hi && !free(x)) x += d * 4;
        return { d: d as -1 | 1, x, cost: Math.abs(x - me.x), ok: free(x) };
      });
      const ok = exits.filter((e) => e.ok);
      if (ok.length) {
        go(ok.reduce((p, q) => (q.cost < p.cost ? q : p)).d);
      } else {
        go(me.x < 480 ? 1 : -1); // boxed in by the walls: run through to the open side and jump the marker
        input.jump++;
      }
      return true;
    }
  }

  // Scene 5: be on the final platform. Wait until a step stands, then go up one hop at a time.
  if (world >= ROCK_DEFS[ROCK_DEFS.length - 1].warn) {
    const nodes = [floorNode, ...standing(world)];
    const under = standingOn(m, me);
    const here = under ? nodeOf(under) : me.y >= ARENA.ground - 1 ? floorNode : null;
    if (!here || here.id === FINAL) return false;
    const hop = nextHop(def, arenaBoost(m, slot), nodes, here, FINAL, me.x);
    if (!hop) return false;
    const dx = hop.x - me.x;
    if (Math.abs(dx) > Math.max(2.5, def.speed / 2)) {
      go(dx > 0 ? 1 : -1);
      return true;
    }
    go(0);
    input.jump++;
    mem.hop = hop;
    mem.hopT = 0;
    return true;
  }
  return false;
}

// Never walk off the edge of the platform you stand on (a fight on the final platform is the point of scene 5).
export function guardEdges(m: Match, slot: Slot, input: Input) {
  const me = m.fighters[slot];
  const p = standingOn(m, me);
  if (!p || !me.grounded) return;
  const pad = 22;
  if (me.x <= p.x + pad) input.left = false;
  if (me.x >= p.x + p.w - pad) input.right = false;
}

// A guided pause (Match.cue): walk to the mark, climbing to it when it is up on a platform; wait when the way up isn't built yet.
// Returns after setting this tick's movement. Presses are never made: nothing but moving counts in a pause.
export function cueNav(m: Match, slot: Slot, def: FighterDef, mem: NavMemory, input: Input) {
  const c = m.cue!;
  const me = m.fighters[slot];
  const mk = c.target?.[slot];
  input.left = input.right = input.block = false;
  if (c.id === "pick") return pickNav(m, slot, mem, input);
  if (!mk || c.done[slot]) return;
  const go = (dir: -1 | 0 | 1) => {
    input.left = dir < 0;
    input.right = dir > 0;
  };
  // Flying a planned jump: hold the air-control direction for its burst, then let go.
  if (!me.grounded && mem.hop) {
    go(mem.hopT! < mem.hop.hold ? mem.hop.dir : 0);
    mem.hopT!++;
    return;
  }
  if (me.grounded) mem.hop = undefined;
  if (!me.grounded) return;
  const world = arenaWorld(m);
  const nodes = [floorNode, ...standing(world)];
  const under = standingOn(m, me);
  const here = under ? nodeOf(under) : me.y >= ARENA.ground - 1 ? floorNode : null;
  const goal = nodes.find((n) => n.top === mk.y && mk.x >= n.x0 && mk.x <= n.x1);
  if (!here || !goal) return; // (not on anything yet, or the mark's platform isn't standing yet: wait)
  if (here.id === goal.id) {
    const dx = mk.x - me.x;
    go(Math.abs(dx) > 1 ? (dx > 0 ? 1 : -1) : 0);
    return;
  }
  const hop = nextHop(def, arenaBoost(m, slot), nodes, here, goal.id, me.x);
  if (!hop) return; // the stairs aren't built far enough yet
  const dx = hop.x - me.x;
  if (Math.abs(dx) > Math.max(2.5, def.speed / 2)) {
    go(dx > 0 ? 1 : -1);
    return;
  }
  input.jump++;
  mem.hop = hop;
  mem.hopT = 0;
}

// The ceremony: the computer picks a constellation at random after a moment's thought, scrolling the list one place every 8 ticks
// (like a player's thumb) and punching to lock. If someone else takes the one it wanted, it settles for where the cursor is.
function pickNav(m: Match, slot: Slot, mem: NavMemory, input: Input) {
  const a = m.arena!;
  if (a.pick[slot]) return;
  mem.pickT = (mem.pickT ?? 0) + 1;
  if (mem.want === undefined) {
    mem.want = Math.floor(Math.random() * CONSTELLATIONS.length);
    mem.delay = 45 + Math.floor(Math.random() * 120);
  }
  if (mem.pickT < mem.delay!) return;
  if (a.pick.includes(CONSTELLATIONS[mem.want])) mem.want = a.cur[slot];
  if (a.cur[slot] !== mem.want) {
    if (mem.pickT % 8 === 0) input.right = true;
    return;
  }
  if (mem.pickT % 8 === 0) input.attack++;
}
