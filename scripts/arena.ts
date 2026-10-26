// Arena 1 (Inferno Crater) checks: the staircase is built within what the weakest jumper can do (asserted from the sim's own
// numbers and by real jumps through step()), the telegraphs and hazard limits hold, and the computer plays the mode.
//   npx tsx scripts/arena.ts [fights per class pair, default 300: about 5 minutes]
//   npx tsx scripts/arena.ts --tune [fights per pair]   find ARENA_TUNE.matchup (src/game/arena.ts): the arena's per-matchup damage trims
//   npx tsx scripts/arena.ts --quick   only the layout and the climb (a minute), while developing
// Prints the platform layout as ASCII at each stage, then the CPU numbers. Exits 1 on a failed assert or a missed target:
// >= 95% of the fighters still fighting 10 s after the staircase stands reach the final platform, hazards deal 5-25% of all damage (scenes 2-4; scene 5 is a duel in the ring),
// every class pair is 35-65%, every fight ends (KO or the clock), and the same seed gives the same fights.

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { ARENA_STORY_IDS, ARENA_TUNE, arenaTick, arenaWorld, lavaY, platformsAt, ringBounds, ringUp, ROCK_DEFS, SCENE_NAMES, sceneAt, STAIRS_UP_TICK } from "../src/game/arena";
import { cpuThink, newBrain } from "../src/game/cpu";
import { nextHop } from "../src/game/arenaNav";
import { CLASS_ITEM, CLASS_SPECIAL, CLASS_STYLE, MOVES } from "../src/game/moves";
import { createMatch, deriveDef, EMPTY_INPUT, GRAVITY, snapshot, step, TICK_HZ, TRAIT, type FighterStats, type Match } from "../src/game/sim";
import { ARENA, BODY } from "../src/game/space";
import { CLASSES, ruleStats } from "../src/lib/stats";

const QUICK = process.argv.includes("--quick"); // the layout and the climb only (about 20 s), not the computer fights
const args = process.argv.slice(2).filter((a) => a !== "--quick");
const TUNING = args[0] === "--tune";
const N = Number((TUNING ? args[1] : args[0]) ?? (TUNING ? 60 : 300)); // (300 fights per pair: +-6%; at 100 a fair pair now and then reads 65%+)
const T = ARENA_TUNE;
let failed = false;
const fail = (msg: string) => {
  failed = true;
  console.log(`FAIL: ${msg}`);
};

let seed = 20261025;
const seedRandom = (s: number) => {
  seed = s;
};
Math.random = () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

const neutral = { size: "medium", pose: "neutral", dominant_colors: [] } as const;
const kit = (cls: string): FighterStats => ({ ...ruleStats(cls, { ...neutral, dominant_colors: [] }), class: cls, item: CLASS_ITEM[cls], style: CLASS_STYLE[cls], specialKind: CLASS_SPECIAL[cls] });
// The weakest jumper and walker the game allows: AGI 40, SPD 40 (the other 270 points on STR, DUR, IQ, so nothing is rebalanced).
const weak: FighterStats = { hp: 200, atk: 90, def: 90, iq: 90, spd: 40, agi: 40, class: "Fighter" };

// ------------------------------------------------------------------ the weakest fighter's reach, measured in the sim

function measure(stats: FighterStats) {
  const ia = { ...EMPTY_INPUT }, ib = { ...EMPTY_INPUT };
  const m = createMatch(stats, kit("Fighter"), [ia, ib]);
  for (let i = 0; i < 4 * TICK_HZ; i++) step(m, [ia, ib]);
  const f = m.fighters[0];
  f.x = 200;
  ia.jump++;
  let apex = 0, ticks = 0;
  const x0 = f.x;
  for (let i = 0; i < 200; i++) {
    step(m, [ia, ib]);
    apex = Math.max(apex, ARENA.ground - f.y);
    ticks++;
    if (i > 2 && f.grounded) break;
  }
  // Air distance of a standing jump with no air control: speed * ticks is for a running one, so take the smaller of the two.
  const def = deriveDef(stats);
  return { apex, ticks, running: f.x - x0, standing: 0, def, air: def.speed * ticks };
}
const w = measure(weak);
console.log(`weakest fighter (AGI 40, SPD 40): jump apex ${w.apex.toFixed(1)} px, ${w.ticks} ticks in the air, ${w.air.toFixed(0)} px sideways at walking speed`);
assert.equal(GRAVITY, 0.75);
const MAX_RISE = Math.min(75, 0.65 * w.apex);
const MAX_GAP = Math.min(70, 0.7 * w.air);
const MIN_STEP = 70;

// ------------------------------------------------------------------ the layout (one stage at a time, as an ASCII picture)

function ascii(tick: number): string {
  const cols = 96, cw = ARENA.w / cols, y0 = 200, y1 = 540, rh = 20;
  const rows = Array.from({ length: (y1 - y0) / rh }, () => new Array(cols).fill(" "));
  const put = (x: number, y: number, ch: string) => {
    const r = Math.floor((y - y0) / rh), c = Math.floor(x / cw);
    if (r >= 0 && r < rows.length && c >= 0 && c < cols) rows[r][c] = ch;
  };
  for (let x = 0; x < ARENA.w; x += cw) put(x, ARENA.ground, "#");
  for (let x = 0; x < ARENA.wall; x += cw) for (let y = y0; y < y1; y += rh) {
    put(x, y, "|");
    put(ARENA.w - 1 - x, y, "|");
  }
  for (const p of platformsAt(tick)) {
    if (p.state === "hidden") continue;
    for (let x = p.x; x < p.x + p.w; x += cw) put(x, p.state === "warn" ? ARENA.ground : p.top, p.state === "warn" ? ":" : "=");
    put(p.x + p.w / 2, p.state === "warn" ? ARENA.ground + rh : p.top + rh, String(p.id));
  }
  const lava = lavaY(tick);
  for (let y = lava; y < y1; y += rh) for (let x = ARENA.wall; x < ARENA.w - ARENA.wall; x += cw) if (rows[Math.floor((y - y0) / rh)]?.[Math.floor(x / cw)] === " ") put(x, y, "~");
  return rows.map((r, i) => `${String(y0 + i * rh).padStart(3)} ${r.join("")}`).join("\n");
}
// (world ticks: the match clock plus the time spent in guided pauses; the staircase rises on it)
for (const [label, tick] of [["scene 1-4: the floor", 0], ["scene 4, 5 s before the stairs: dust where they will rise", 8760], ["scene 5, step 1 rising", 9030], ["scene 5, steps 1 up, 2 and the final platform warn", 9200], ["scene 5, everything up", STAIRS_UP_TICK + 30], ["5:00, lava at its highest", T.matchTicks]] as const) {
  console.log(`\n${label} (tick ${tick}, ${(tick / TICK_HZ).toFixed(0)} s, lava y ${lavaY(tick).toFixed(0)})`);
  console.log(ascii(tick));
}

// ------------------------------------------------------------------ asserts on the layout

console.log("\nlayout asserts");
const up = platformsAt(STAIRS_UP_TICK + 1);
assert.ok(up.every((p) => p.state === "up"));
// Mirror: every platform has a twin around the centre with the same size, height and timing.
for (const r of ROCK_DEFS) {
  const twin = ROCK_DEFS.find((o) => o.x === ARENA.w - (r.x + r.w) && o.w === r.w && o.top === r.top && o.warn === r.warn && o.rise === r.rise && o.dur === r.dur);
  assert.ok(twin, `platform ${r.id} has no mirror twin`);
}
const fin = up.find((p) => p.kind === "final")!;
assert.equal(fin.x + fin.w / 2, ARENA.w / 2, "the final platform is centred");
// Rises and gaps: floor → step → step → final on each side. Each rise <= min(75, 65% of the weakest apex), each gap <= min(70,
// 70% of the weakest fighter's air distance), each step >= 70 px wide.
for (const side of [0, 1]) {
  const chain = up.filter((p) => p.kind === "step" && (p.x + p.w / 2 < ARENA.w / 2) === (side === 0)).sort((a, b) => b.top - a.top);
  let prev: { top: number; x0: number; x1: number } | null = null;
  for (const p of [...chain, fin]) {
    const rise: number = prev ? prev.top - p.top : ARENA.ground - p.top;
    assert.ok(rise > 0 && rise <= MAX_RISE + 1e-9, `rise ${rise.toFixed(1)} px to platform ${p.id} (max ${MAX_RISE.toFixed(1)})`);
    if (prev) {
      const gap = side === 0 ? p.x - prev.x1 : prev.x0 - (p.x + p.w);
      assert.ok(gap >= 0 && gap <= MAX_GAP, `gap ${gap} px before platform ${p.id} (max ${MAX_GAP.toFixed(1)})`);
    }
    if (p.kind === "step") assert.ok(p.w >= MIN_STEP, `step ${p.id} is ${p.w} px wide (min ${MIN_STEP})`);
    prev = { top: p.top, x0: p.x, x1: p.x + p.w };
  }
}
// The final platform: wide enough for twice the longest melee reach plus a body (walking, sweeps, kicks, the hit-lock at LOCK.gap), 200-240 above the floor.
const longest = Math.max(...Object.values(MOVES).map((mv) => mv.reach)) + TRAIT.SWORD_REACH; // a sword extends the punch chain
const fightDist = BODY.w + longest;
assert.ok(fin.w >= 480 && fin.w >= 2 * fightDist, `final platform ${fin.w} px (needs >= 480 (it was 420: the ring walls need room) and >= 2 x ${fightDist})`);
const ring = ringBounds();
assert.ok(ring.hi - ring.lo >= fightDist + 60, `inside the ring walls a fighter's centre has ${ring.hi - ring.lo} px, a fight needs ${fightDist + 60}`);
const height = ARENA.ground - fin.top;
assert.ok(height >= 200 && height <= 240, `final platform ${height} px above the floor`);
// Head room: no platform less than 150 px above another one's top (where they overlap in x).
for (const p of up) for (const q of up) if (p !== q && q.top < p.top && q.x < p.x + p.w && q.x + q.w > p.x) assert.ok(p.top - q.top >= 150, `platform ${q.id} is only ${p.top - q.top} px above ${p.id}`);
// Timings: every rise is telegraphed 2 s ahead and takes about a second; the lava keeps off the final platform and reaches the floor late.
for (const r of ROCK_DEFS) {
  assert.ok(r.rise - r.warn >= 2 * TICK_HZ, `platform ${r.id} warns ${(r.rise - r.warn) / TICK_HZ} s ahead`);
  assert.ok(r.dur <= 1.5 * TICK_HZ, `platform ${r.id} takes ${r.dur / TICK_HZ} s to rise`);
}
const floorReach = T.scenes[4] + (T.lava.start - ARENA.ground) / T.lava.rate;
assert.ok(floorReach >= STAIRS_UP_TICK + 10 * TICK_HZ, `lava reaches the floor at ${floorReach / TICK_HZ} s, before the stairs have stood 10 s`);
assert.ok(lavaY(T.matchTicks) >= fin.top + T.lava.margin, `lava ends ${lavaY(T.matchTicks)} (final top ${fin.top})`);
assert.ok(lavaY(T.matchTicks) < Infinity && lavaY(T.matchTicks) > fin.top, "lava stays below the final platform at 5:00");
// Telegraphs and shapes of the hazards.
assert.ok(T.crack.glow >= 1.5 * TICK_HZ, "cracks glow >= 1.5 s");
assert.ok(T.meteor.warn >= TICK_HZ, "meteor marker >= 1 s");
assert.ok(T.crack.max <= 2, "<= 2 crack zones at once");
assert.ok(T.crack.width[1] <= MAX_GAP, `a crack (${T.crack.width[1]} px) can be jumped by the weakest jumper (${MAX_GAP.toFixed(0)})`);
assert.ok(T.crack.safe >= 200, "a safe strip of >= 200 px");
assert.ok(T.crack.max * T.crack.width[1] <= 0.6 * (ARENA.w - 2 * ARENA.wall), "at least 40% of the floor is always free of cracks");
assert.deepEqual(T.scenes.map((t) => t / TICK_HZ), [0, 30, 60, 105, 150]);
assert.equal(T.matchTicks / TICK_HZ, 300);
console.log(`  rises <= ${MAX_RISE.toFixed(1)} (staircase: ${ROCK_DEFS.filter((r) => r.kind === "step").map((r) => ARENA.ground - r.top).join(", ")}), gaps <= ${MAX_GAP.toFixed(1)}, final platform ${fin.w} px wide (${2 * fightDist} needed), ${height} px up. ok`);

// ------------------------------------------------------------------ real jumps: the climb pause, played by the computer

// Scene 5 begins with the "Get up there!" pause: the fight stops, the staircase rises, and the pause ends when both fighters stand
// on the final platform. Here two computer fighters play it from the 8990th tick of a fight, one of them starting at x, and we
// measure how long the pause lasts. It must end because both arrived (never by lifting someone at the timeout).
console.log("\nthe climb pause with the real sim (nobody fights; both fighters are computer-driven):");
function climb(stats: FighterStats, other: FighterStats, x: number, xo: number): { ticks: number; warps: number } | null {
  const ia = { ...EMPTY_INPUT }, ib = { ...EMPTY_INPUT };
  const m = createMatch(stats, other, [ia, ib], { arena: "inferno" });
  m.arena!.beat = ARENA_STORY_IDS.indexOf("climb"); // (the opening ceremony is not what is being measured)
  for (let i = 0; i < 4 * TICK_HZ; i++) step(m, [ia, ib]);
  m.timer = T.matchTicks - 8990;
  m.arena!.next = [1e9, 1e9];
  m.fighters[0].x = x;
  m.fighters[1].x = xo;
  const brains = [newBrain("normal"), newBrain("normal")];
  let began = -1, warps = 0, seen = 0;
  for (let t = 0; t < 40 * TICK_HZ; t++) {
    cpuThink(m, 0, brains[0], ia);
    cpuThink(m, 1, brains[1], ib);
    step(m, [ia, ib]);
    for (const e of m.events) if (e.id > seen) { seen = e.id; if (e.type === "arena" && e.kind === "warp") warps++; }
    if (began < 0 && m.cue?.id === "climb") began = t;
    if (began >= 0 && m.cue?.id !== "climb") return { ticks: t - began, warps };
  }
  return null;
}
const FAR = 480; // where the other fighter starts: the middle
for (const [name, stats] of [["AGI 40 / SPD 40", weak], ["AGI 100 / SPD 100", { ...weak, spd: 100, agi: 100, atk: 50, def: 50, iq: 50 }], ["AGI 70 / SPD 40", { ...weak, agi: 70, atk: 80, def: 80, iq: 80 }]] as [string, FighterStats][]) {
  const times: string[] = [];
  for (const x of [65, 100, 150, 230, 300, 480, 650, 740, 810, 895]) {
    // Both fighters have these stats, so the other one is just as weak a climber; it starts on the opposite side from x.
    const r = climb(stats, stats, x, Math.min(895, Math.max(65, ARENA.w - x)));
    times.push(r === null ? `${x}:NO` : `${x}:${(r.ticks / TICK_HZ).toFixed(1)}s${r.warps ? `!${r.warps}` : ""}`);
    if (r === null) fail(`${name} starting at x=${x} never finishes the climb pause`);
    else if (r.warps) fail(`${name} starting at x=${x}: the climb pause timed out and lifted ${r.warps} fighter(s)`);
    else if (r.ticks >= T.cue.climb) fail(`${name} starting at x=${x}: the climb pause took the whole timeout`);
  }
  console.log(`  ${name}: ${times.join(" ")}`);
}
void FAR;
// The planner's first hop from the floor must exist for the weakest fighter on both sides.
const hop = nextHop(deriveDef(weak), { jump: 1, air: 1 }, [{ id: 0, top: ARENA.ground, x0: 65, x1: 895 }, ...platformsAt(STAIRS_UP_TICK + 1).map((p) => ({ id: p.id, top: p.top, x0: p.x, x1: p.x + p.w }))], { id: 0, top: ARENA.ground, x0: 65, x1: 895 });
assert.ok(hop, "no path from the floor to the final platform without the scene-5 boost");

if (QUICK) {
  console.log(failed ? "\nSOME ARENA CHECKS FAILED" : "\nquick: layout and climb ok");
  process.exit(failed ? 1 : 0);
}

// ------------------------------------------------------------------ CPU vs CPU

type Result = { winner: number | null; ticks: number; by: "ko" | "time"; env: number; dmg: number; scene5: boolean[]; ready: boolean[]; final: boolean[]; warps: number; opening: number; picks: (string | null)[]; buff: number[]; entry: number; leftRing: number; endTicks: number; kicked: boolean; ringEnd: boolean; splashX: number; hash: string };
function play(a: FighterStats, b: FighterStats, level: "normal" | "hard" = "normal"): Result {
  const ia = { ...EMPTY_INPUT }, ib = { ...EMPTY_INPUT };
  const m: Match = createMatch(a, b, [ia, ib], { arena: "inferno", seed: Math.floor(Math.random() * 4294967296) }); // (the script's seeded Math.random: repeatable)
  const brains = [newBrain(level), newBrain(level)];
  const h = createHash("sha1");
  const scene5 = [false, false], ready = [false, false], final = [false, false];
  let ticks = 0, warps = 0, seen = 0, opening = -1, entryFrom = -1, entry = 0, leftRing = 0, endFrom = -1, splashX = NaN;
  while (m.phase !== "matchEnd" && ticks < 3 * T.matchTicks) {
    cpuThink(m, 0, brains[0], ia);
    cpuThink(m, 1, brains[1], ib);
    step(m, [ia, ib]);
    ticks++;
    if (opening < 0 && m.phase === "fight") opening = ticks; // the ceremony is over: the first blow can be struck
    if (entryFrom < 0 && m.cue?.id === "climb") entryFrom = ticks; // scene 5's story: the climb, the marks, the stars answering...
    if (entryFrom >= 0 && !entry && m.phase === "fight") entry = ticks - entryFrom; // ...and then the fight
    if (m.phase === "fight" && ringUp(m)) for (const f of m.fighters) if (f.y > fin.top + 1) leftRing++; // nobody may be below the platform in the ring
    if (endFrom < 0 && m.phase === "roundEnd") endFrom = ticks; // the fight is decided: the winner's kick, the lava, the star
    for (const e of m.events) if (e.id > seen) { seen = e.id; if (e.type === "arena" && e.kind === "warp") warps++; if (e.type === "arena" && e.kind === "splash") splashX = e.x; }
    if (m.phase === "fight" && sceneAt(arenaTick(m)) === 4) {
      for (const f of m.fighters) {
        scene5[f.slot] = true;
        if (arenaWorld(m) >= STAIRS_UP_TICK + 10 * TICK_HZ && f.action !== "ko") ready[f.slot] = true; // still fighting once the staircase has stood 10 s
        const on = platformsAt(arenaWorld(m)).find((p) => p.kind === "final" && p.state === "up" && f.grounded && Math.abs(f.y - p.top) < 0.5 && f.x >= p.x && f.x <= p.x + p.w);
        if (on) final[f.slot] = true;
      }
    }
    if (ticks % 600 === 0) h.update(JSON.stringify(snapshot(m)));
  }
  assert.equal(m.phase, "matchEnd", "an arena fight must end (KO or the clock)");
  h.update(`${m.matchWinner}:${ticks}:${m.fighters.map((f) => f.hp)}`);
  return { winner: m.matchWinner, ticks, by: m.roundReason ?? "time", env: m.arena!.envDmg[0] + m.arena!.envDmg[1], dmg: m.damage[0] + m.damage[1], scene5, ready, final, warps, opening, picks: [...m.arena!.pick], buff: [...m.arena!.buff], entry, leftRing, endTicks: endFrom < 0 ? 0 : ticks - endFrom, kicked: m.arena!.end?.planned === true, ringEnd: m.arena!.end?.lava !== ARENA.ground + 52, splashX, hash: h.digest("hex") };
}

const pairs: [string, string][] = [];
for (let i = 0; i < CLASSES.length; i++) for (let j = i; j < CLASSES.length; j++) pairs.push([CLASSES[i], CLASSES[j]]);
const firstHash: string[] = [];

if (TUNING) {
  // Matchup trims: for each pair, nudge the damage factor of the side that wins too often (a factor moves a pair's log-odds by about
  // 18 per unit of log factor, measured), a few rounds, with the hard CPU.
  const logit = (r: number) => Math.log(Math.max(0.02, Math.min(0.98, r)) / (1 - Math.max(0.02, Math.min(0.98, r))));
  for (let round = 1; round <= 3; round++) {
    seedRandom(500 + round);
    const rates: string[] = [];
    for (const [A, B] of pairs) {
      if (A === B) continue;
      let w = 0;
      for (let g = 0; g < N; g++) {
        const seat = g % 2;
        const r = seat === 0 ? play(kit(A), kit(B), "hard") : play(kit(B), kit(A), "hard");
        w += r.winner === null ? 0.5 : r.winner === seat ? 1 : 0;
      }
      const rate = w / N, key = `${A}-${B}`;
      rates.push(`${key} ${(rate * 100).toFixed(0)}%`);
      T.matchup[key] = Math.round(T.matchup[key] * Math.exp((-logit(rate) / 17.8) * 0.7) * 1000) / 1000;
    }
    console.log(`round ${round}: ${rates.join(", ")}`);
  }
  console.log(`\nmatchup: ${JSON.stringify(T.matchup)}`);
  process.exit(0);
}

// Hazards, the climb and determinism: the normal CPU, every class pair (20 fights each, a fifth of that for a class against itself), both seats.
{
  const per = (A: string, B: string) => (A === B ? 4 : 20);
  const fights = pairs.reduce((n, [A, B]) => n + per(A, B), 0);
  console.log(`\nCPU vs CPU, normal level: ${fights} arena fights over ${pairs.length} class pairs, both seats`);
  seedRandom(20261025);
  const started = Date.now();
  let ko = 0, timeout = 0, draws = 0, reached = 0, ready = 0, readyFinal = 0, envSum = 0, dmgSum = 0, ticksSum = 0, total = 0, bothReady = 0, bothFinal = 0, warpSum = 0;
  let openSum = 0, openMax = 0, dupes = 0, entrySum = 0, entryMax = 0, entryN = 0, leftRings = 0, bigger = 0, biggerWon = 0;
  let kicked = 0, kickedRing = 0, endSum = 0, endMax = 0, splashBad = 0;
  const buffs: number[] = [];
  const picked: Record<string, number> = {};
  for (const [A, B] of pairs) {
    for (let g = 0; g < per(A, B); g++) {
      const r = g % 2 === 0 ? play(kit(A), kit(B)) : play(kit(B), kit(A));
      total++;
      if (firstHash.length < 6) firstHash.push(r.hash);
      if (r.by === "ko") ko++;
      else timeout++;
      if (r.winner === null) draws++;
      warpSum += r.warps;
      if (r.entry) {
        entrySum += r.entry;
        entryMax = Math.max(entryMax, r.entry);
        entryN++;
        buffs.push(...r.buff);
        if (r.buff[0] !== r.buff[1] && r.winner !== null) {
          bigger++;
          if (r.winner === (r.buff[0] > r.buff[1] ? 0 : 1)) biggerWon++;
        }
      }
      leftRings += r.leftRing;
      // The ending: a decided fight ends with the kick and the splash (in the lake's view on the floor, clear of the platform on the ring).
      endSum += r.endTicks;
      endMax = Math.max(endMax, r.endTicks);
      if (r.kicked) {
        kicked++;
        if (r.ringEnd) kickedRing++;
        if (r.ringEnd ? !(r.splashX < fin.x - 20 || r.splashX > fin.x + fin.w + 20) : !(r.splashX >= ARENA.wall && r.splashX <= ARENA.w - ARENA.wall)) splashBad++;
      } else if (r.winner !== null) splashBad++;
      openSum += r.opening;
      openMax = Math.max(openMax, r.opening);
      if (r.picks[0] === r.picks[1]) dupes++;
      for (const p of r.picks) picked[p ?? "none"] = (picked[p ?? "none"] ?? 0) + 1;
      envSum += r.env;
      dmgSum += r.dmg;
      ticksSum += r.ticks;
      for (const s of [0, 1]) {
        if (r.scene5[s]) reached++;
        if (r.ready[s]) { ready++; if (r.final[s]) readyFinal++; }
      }
      if (r.ready[0] && r.ready[1]) { bothReady++; if (r.final[0] && r.final[1]) bothFinal++; }
    }
  }
  console.log(`  ${((Date.now() - started) / 1000).toFixed(0)} s. ended by KO ${ko}, by the clock ${timeout} (draws ${draws}); average ${(ticksSum / total / TICK_HZ).toFixed(0)} s of play (the clock holds during hit-stop)`);
  const reachRate = ready ? readyFinal / ready : 1;
  console.log(`  fighters in scene 5: ${reached}/${total * 2}; still fighting 10 s after the stairs stood: ${ready}; of those on the final platform at some point: ${(reachRate * 100).toFixed(1)}% (both fighters of a fight: ${bothReady ? ((bothFinal / bothReady) * 100).toFixed(1) : "n/a"}% of ${bothReady})`);
  const names = Object.keys(picked).sort();
  console.log(`  opening ceremony: ${(openSum / total / TICK_HZ).toFixed(1)} s on average, ${(openMax / TICK_HZ).toFixed(1)} s at the most (the sheet: first 15 s); the computer picked ${names.map((n) => `${n} ${Math.round((picked[n] / (2 * total)) * 100)}%`).join(", ")}; two fighters on one constellation: ${dupes}`);
  if (openMax > 16 * TICK_HZ) fail(`the opening ceremony took ${(openMax / TICK_HZ).toFixed(1)} s`);
  if (dupes > 0) fail(`${dupes} fights where both fighters chose the same constellation`);
  if (names.length !== 5 || names.some((n) => picked[n] < 0.1 * 2 * total || picked[n] > 0.3 * 2 * total)) fail(`the computer's constellation picks are not spread out: ${JSON.stringify(picked)}`);
  console.log(`  ring entry (the climb, the marks, the stars answering): ${(entrySum / Math.max(1, entryN) / TICK_HZ).toFixed(1)} s on average, ${(entryMax / TICK_HZ).toFixed(1)} s at the most, over ${entryN} fights`);
  const meanBuff = buffs.reduce((a, b) => a + b, 0) / Math.max(1, buffs.length);
  console.log(`  plausibility buffs: ${Math.min(...buffs)}-${Math.max(...buffs)}%, mean ${meanBuff.toFixed(1)}%; the fighter with the bigger buff won ${bigger ? Math.round((biggerWon / bigger) * 100) : 0}% of ${bigger} decided fights (swingy by design); fighters seen below the ring in a fight: ${leftRings}`);
  if (leftRings > 0) fail(`${leftRings} fighter-ticks below the ring platform in a fight: the walls leak`);
  if (buffs.length && (Math.min(...buffs) < ARENA_TUNE.buff.min || Math.max(...buffs) > ARENA_TUNE.buff.max)) fail("a buff outside 10-50%");
  console.log(`  endings: ${kicked} kicked into the lava (${kickedRing} off the ring, ${kicked - kickedRing} off the floor), ${draws} draws; the ending takes ${(endSum / total / TICK_HZ).toFixed(1)} s on average, ${(endMax / TICK_HZ).toFixed(1)} s at the most; splashes out of place or kicks missing: ${splashBad}`);
  if (splashBad > 0) fail(`${splashBad} endings without the kick, or with the loser landing out of place`);
  if (kicked + draws !== total) fail(`${total - kicked - draws} fights ended without a scripted ending`);
  if (endMax > 12 * TICK_HZ) fail(`an ending took ${(endMax / TICK_HZ).toFixed(1)} s`);
  console.log(`  fighters lifted onto the final platform by a pause timeout: ${warpSum}`);
  if (warpSum > 0) fail(`${warpSum} fighters had to be lifted by the climb pause's timeout: the computer should climb by itself`);
  const share = envSum / (envSum + dmgSum);
  console.log(`  hazards dealt ${(share * 100).toFixed(1)}% of all damage (${envSum} of ${envSum + dmgSum})`);
  if (ready === 0) fail("no fighter was still fighting 10 s after the staircase stood: the pool is too small");
  if (reachRate < 0.95) fail(`only ${(reachRate * 100).toFixed(1)}% of the fighters in scene 5 reach the final platform (need 95%)`);
  if (share < 0.05 || share > 0.25) fail(`hazards deal ${(share * 100).toFixed(1)}% of the damage (need 5-25%: scene 5 is a duel in the ring, with no hazard that can reach the fighters)`);
}

// Class balance in the arena: the hard CPU (the one scripts/balance.ts calibrates on), N fights per pair, half in each seat.
{
  console.log(`\nCPU vs CPU, hard level: ${N} fights per class pair (±${(100 / Math.sqrt(N)).toFixed(0)}%)`);
  seedRandom(777);
  const started = Date.now();
  const rates: { k: string; rate: number }[] = [];
  for (const [A, B] of pairs) {
    if (A === B) continue;
    let w = 0;
    for (let g = 0; g < N; g++) {
      const seat = g % 2;
      const r = seat === 0 ? play(kit(A), kit(B), "hard") : play(kit(B), kit(A), "hard");
      w += r.winner === null ? 0.5 : r.winner === seat ? 1 : 0;
    }
    rates.push({ k: `${A}-${B}`, rate: w / N });
  }
  console.log(`  ${((Date.now() - started) / 1000).toFixed(0)} s. ${rates.map((r) => `${r.k} ${(r.rate * 100).toFixed(0)}%`).join(", ")}`);
  const out = rates.filter((r) => r.rate < 0.35 || r.rate > 0.65);
  console.log(`  ${out.length ? "UNFAIR" : "fair"}: every pair within ${Math.round(Math.min(...rates.map((r) => r.rate)) * 100)}-${Math.round(Math.max(...rates.map((r) => r.rate)) * 100)}% (target 35-65%)`);
  if (out.length) fail(`class pairs outside 35-65% in arena mode: ${out.map((r) => `${r.k} ${(r.rate * 100).toFixed(0)}%`).join(", ")}`);
}

// Same seed, same fights.
seedRandom(20261025);
const again: string[] = [];
outer: for (const [A, B] of pairs) {
  for (let g = 0; g < (A === B ? 4 : 20); g++) {
    if (again.length >= firstHash.length) break outer;
    again.push((g % 2 === 0 ? play(kit(A), kit(B)) : play(kit(B), kit(A))).hash);
  }
}
assert.deepEqual(again, firstHash, "the same seed gave a different arena fight");
console.log(`\ndeterminism: the first ${firstHash.length} fights replay identically`);

console.log(failed ? "\nSOME ARENA CHECKS FAILED" : `\nok: all arena checks passed (scenes: ${SCENE_NAMES.join(" > ")})`);
process.exit(failed ? 1 : 0);
