// What the stickman's limbs do for each fighter state. Angles are in body space,
// facing +x: 0 = straight ahead, π/2 = down, -π/2 = up, π = behind.

import { MOVES, type MoveName } from "./moves";
import type { PoseTargets } from "./skeleton";
import { BEAM, SPECIAL_DURATION, TIME_STOP, type SpecialKind, type Snapshot } from "./sim";

type F = Snapshot["fighters"][number];

const UP = -Math.PI / 2, DOWN = Math.PI / 2, BACK = Math.PI;
const abs = (a: number) => ({ abs: a });
const rel = (a: number) => ({ rel: a });

// Guard: fists up in front of the chest.
const GUARD: PoseTargets = { upperF: abs(1.15), foreF: abs(-1.2), upperB: abs(1.5), foreB: abs(-1.0) };
const STANCE: PoseTargets = { thighF: abs(DOWN - 0.35), shinF: abs(DOWN - 0.1), thighB: abs(DOWN + 0.35), shinB: abs(DOWN + 0.15) };
const FIGHT: PoseTargets = { ...GUARD, ...STANCE };

// lunge: body shift forward. flip: mirror (mid-spin). Crouching needs no field: the renderer
// keeps the lowest foot on the floor, so bent legs lower the body.
// alpha: fade (teleport). fall: KO topple angle. hover: px off the floor (an Attacker's idle float).
export type BodyMotion = { pose: PoseTargets; lunge: number; fall: number; flip: boolean; alpha: number; hover?: number };

// Wind-up, strike and recovery poses per move. Recovery returns to the fighting stance.
// alt: the other fist, on odd beats of a chain (the Overdue's rush).
const MOVE_POSES: Record<MoveName, { wind: PoseTargets; hit: PoseTargets; alt?: PoseTargets; lunge?: number; spin?: boolean }> = {
  jab: { wind: FIGHT, hit: { ...STANCE, upperF: abs(-0.05), foreF: abs(-0.05), upperB: abs(1.5), foreB: abs(-1.0), torso: rel(0.1) }, lunge: 8 },
  cross: {
    wind: { ...FIGHT, torso: rel(-0.12) },
    hit: { ...STANCE, upperB: abs(-0.05), foreB: abs(-0.05), upperF: abs(1.7), foreF: abs(-1.3), torso: rel(0.28), thighB: abs(DOWN + 0.6) },
    lunge: 12,
  },
  hook: {
    wind: { ...FIGHT, upperF: abs(0.6), foreF: abs(-1.6), torso: rel(-0.2) },
    hit: { ...STANCE, upperF: abs(-0.2), foreF: abs(0.9), torso: rel(0.32), head: rel(0.1) },
    lunge: 6,
  },
  uppercutP: {
    wind: { ...FIGHT, upperF: abs(1.35), foreF: abs(0.9), torso: rel(0.25) },
    hit: { ...STANCE, upperF: abs(-1.2), foreF: abs(-1.45), torso: rel(-0.2), head: rel(-0.2), thighB: abs(DOWN + 0.4) },
    lunge: 6,
  },
  elbow: {
    wind: { ...FIGHT, upperF: abs(0.9), foreF: abs(BACK - 0.4) },
    hit: { ...STANCE, upperF: abs(-0.3), foreF: abs(BACK + 0.5), torso: rel(0.3), head: rel(0.1) },
    lunge: 10,
  },
  knee: {
    wind: { ...FIGHT, upperF: abs(0.1), foreF: abs(0.8), upperB: abs(0.2), foreB: abs(0.9) },
    hit: { upperF: abs(0.2), foreF: abs(1.0), upperB: abs(0.3), foreB: abs(1.1), thighF: abs(-0.55), shinF: abs(DOWN - 0.05), thighB: abs(DOWN + 0.15), torso: rel(-0.18) },
    lunge: 8,
  },
  flyingKnee: {
    wind: { ...FIGHT, thighF: abs(DOWN - 0.9), shinF: abs(DOWN + 0.4) },
    hit: { upperF: abs(BACK - 0.5), foreF: abs(BACK - 0.9), upperB: abs(BACK - 0.3), thighF: abs(-0.45), shinF: abs(DOWN - 0.2), thighB: abs(DOWN + 0.8), shinB: abs(BACK - 0.5), torso: rel(-0.25) },
    lunge: 6,
  },
  palm: {
    wind: { ...FIGHT, upperF: abs(1.4), foreF: abs(0.3), torso: rel(-0.12) },
    hit: { ...STANCE, upperF: abs(-0.08), foreF: abs(-0.3), torso: rel(0.2), thighF: abs(DOWN - 0.55) },
    lunge: 12,
  },
  straight: {
    wind: { ...FIGHT, upperF: abs(1.5), foreF: abs(-0.2) },
    hit: { upperF: abs(-0.03), foreF: abs(-0.03), upperB: abs(1.9), foreB: abs(-0.4), torso: rel(0.2), thighF: abs(DOWN - 0.6), shinF: abs(DOWN - 0.2), thighB: abs(DOWN + 0.55), shinB: abs(DOWN + 0.5) },
    lunge: 12,
  },
  headbutt: {
    wind: { ...FIGHT, torso: rel(-0.35), head: rel(-0.3) },
    hit: { upperF: abs(0.2), foreF: abs(0.6), upperB: abs(0.3), foreB: abs(0.8), ...STANCE, torso: rel(0.55), head: rel(0.45) },
    lunge: 14,
  },
  frontKick: {
    wind: { ...GUARD, thighF: abs(-0.2), shinF: abs(DOWN + 0.3), thighB: abs(DOWN + 0.1), torso: rel(-0.1) },
    hit: { ...GUARD, thighF: abs(-0.15), shinF: abs(-0.12), thighB: abs(DOWN + 0.15), torso: rel(-0.28), head: rel(-0.1) },
    lunge: 6,
  },
  roundhouse: {
    wind: { thighF: abs(-0.05), shinF: abs(DOWN + 0.5), torso: rel(-0.18), upperF: rel(-0.5), upperB: rel(0.5) },
    hit: { thighF: abs(-0.3), shinF: abs(-0.4), thighB: abs(DOWN + 0.12), torso: rel(-0.38), head: rel(-0.1), upperF: rel(-0.8), upperB: rel(0.8) },
    lunge: 6,
  },
  spinKick: {
    wind: { ...GUARD, torso: rel(-0.3), thighB: abs(DOWN - 0.2) },
    hit: { upperF: abs(BACK - 0.6), upperB: abs(1.2), thighB: abs(-0.25), shinB: abs(-0.3), thighF: abs(DOWN - 0.1), torso: rel(-0.55), head: rel(-0.15) },
    lunge: 8,
    spin: true,
  },
  axeKick: {
    wind: { ...GUARD, thighF: abs(-1.35), shinF: abs(-1.45), thighB: abs(DOWN + 0.1), torso: rel(-0.3) },
    hit: { ...GUARD, thighF: abs(0.45), shinF: abs(0.7), thighB: abs(DOWN + 0.2), torso: rel(0.15) },
    lunge: 6,
  },
  lowKick: {
    wind: { ...FIGHT, thighF: abs(DOWN - 0.7), shinF: abs(DOWN + 0.3) },
    hit: { ...GUARD, thighF: abs(0.75), shinF: abs(0.45), thighB: abs(DOWN + 0.2), torso: rel(-0.15) },
    lunge: 6,
  },
  sweep: {
    wind: { ...GUARD, thighF: abs(DOWN - 0.6), shinF: abs(DOWN + 0.6), thighB: abs(DOWN + 0.6), shinB: abs(DOWN - 0.5) },
    hit: { upperF: abs(1.2), foreF: abs(1.5), upperB: abs(1.9), thighF: abs(0.12), shinF: abs(0.06), thighB: abs(DOWN + 1.0), shinB: abs(DOWN - 0.9), torso: rel(0.35) },
    lunge: 4,
  },
  // Weapon chains: the item is in the front hand, so the front arm swings it.
  iai: {
    wind: { ...STANCE, upperF: abs(2.3), foreF: abs(0.7), upperB: abs(1.6), foreB: abs(0.4), torso: rel(-0.15) },
    hit: { ...STANCE, upperF: abs(-0.1), foreF: abs(0.1), upperB: abs(2.2), foreB: abs(1.6), torso: rel(0.22), thighF: abs(DOWN - 0.55) },
    lunge: 10,
  },
  risingSlash: {
    wind: { ...STANCE, upperF: abs(1.9), foreF: abs(1.4), torso: rel(0.15), thighF: abs(DOWN - 0.6), shinF: abs(DOWN + 0.2) },
    hit: { ...STANCE, upperF: abs(-1.3), foreF: abs(-1.5), upperB: abs(1.9), foreB: abs(1.2), torso: rel(-0.2), head: rel(-0.1) },
    lunge: 6,
  },
  thrust: {
    wind: { ...STANCE, upperF: abs(2.6), foreF: abs(0.2), torso: rel(-0.15), thighB: abs(DOWN + 0.5) },
    hit: { upperF: abs(-0.02), foreF: abs(-0.02), upperB: abs(2.4), foreB: abs(2.0), torso: rel(0.3), thighF: abs(DOWN - 0.75), shinF: abs(DOWN - 0.1), thighB: abs(DOWN + 0.75), shinB: abs(DOWN + 0.6) },
    lunge: 18,
  },
  overhead: {
    wind: { ...STANCE, upperF: abs(-2.0), foreF: abs(-2.6), upperB: abs(-1.7), foreB: abs(-2.4), torso: rel(-0.25), head: rel(-0.1) },
    hit: { upperF: abs(0.6), foreF: abs(0.9), upperB: abs(0.7), foreB: abs(1.0), torso: rel(0.4), head: rel(0.2), thighF: abs(DOWN - 0.55), shinF: abs(DOWN + 0.1), thighB: abs(DOWN + 0.5), shinB: abs(DOWN + 0.3) },
    lunge: 8,
  },
  slam: {
    wind: { upperF: abs(-1.5), foreF: abs(-1.7), upperB: abs(-1.4), foreB: abs(-1.7), torso: rel(-0.3), thighF: abs(DOWN - 0.5), shinF: abs(DOWN + 0.4), thighB: abs(DOWN + 0.5), shinB: abs(DOWN + 0.4) },
    hit: { upperF: abs(1.0), foreF: abs(1.3), upperB: abs(1.1), foreB: abs(1.4), torso: rel(0.55), head: rel(0.3), thighF: abs(DOWN - 0.85), shinF: abs(DOWN + 0.35), thighB: abs(DOWN + 0.75), shinB: abs(DOWN + 0.2) },
    lunge: 6,
  },
  shieldBash: {
    wind: { ...STANCE, upperF: abs(1.6), foreF: abs(-0.3), upperB: abs(1.5), foreB: abs(-0.8), torso: rel(-0.2) },
    hit: { ...STANCE, upperF: abs(0.05), foreF: abs(-0.6), upperB: abs(1.2), foreB: abs(-0.9), torso: rel(0.35), head: rel(0.15), thighB: abs(DOWN + 0.6) },
    lunge: 16,
  },
  inkPalm: {
    wind: { ...STANCE, upperF: abs(1.4), foreF: abs(0.2), upperB: abs(1.5), foreB: abs(0.3), torso: rel(-0.15) },
    hit: { ...STANCE, upperF: abs(-0.05), foreF: abs(-0.3), upperB: abs(0.08), foreB: abs(-0.25), torso: rel(0.2), thighF: abs(DOWN - 0.5) },
    lunge: 8,
  },
  airSlash: {
    wind: { upperF: abs(-1.6), foreF: abs(-2.2), upperB: abs(-0.6), thighF: abs(DOWN - 0.8), shinF: abs(DOWN + 0.2), thighB: abs(DOWN - 0.3), shinB: abs(DOWN + 0.7), torso: rel(-0.2) },
    hit: { upperF: abs(0.7), foreF: abs(0.9), upperB: abs(BACK - 0.5), thighF: abs(DOWN - 0.8), shinF: abs(DOWN + 0.2), thighB: abs(DOWN - 0.3), shinB: abs(DOWN + 0.7), torso: rel(0.3) },
  },
  divePunch: {
    wind: { upperF: abs(-0.8), foreF: abs(-1.6), upperB: abs(BACK - 0.3), thighF: abs(DOWN - 0.8), shinF: abs(DOWN + 0.3), thighB: abs(DOWN - 0.2), shinB: abs(DOWN + 0.8) },
    hit: { upperF: abs(0.55), foreF: abs(0.55), upperB: abs(BACK - 0.4), torso: rel(0.3), thighF: abs(DOWN + 0.3), shinF: abs(DOWN + 0.8), thighB: abs(BACK - 0.6), shinB: abs(BACK - 0.3) },
  },
  flyingKick: {
    wind: { ...GUARD, thighF: abs(-0.3), shinF: abs(DOWN + 0.6), thighB: abs(DOWN + 0.2), shinB: abs(DOWN + 0.9), torso: rel(-0.15) },
    hit: { upperF: abs(-0.6), foreF: abs(-0.9), upperB: abs(BACK - 0.4), thighF: abs(0.35), shinF: abs(0.35), thighB: abs(DOWN + 0.9), shinB: abs(BACK - 0.5), torso: rel(-0.3) },
  },
  // Dungeon bosses' moves. The research's keyframes, where it has them: limbs are its `abs` as they stand; its `torso.abs` is turned round
  // (rel = π/2 - abs: its lean is measured the other way).
  flickerJab: {
    wind: { ...FIGHT, torso: rel(0.12), upperF: abs(1.1), foreF: abs(-0.8) },
    hit: { ...STANCE, torso: rel(0.17), upperF: abs(-0.05), foreF: abs(0), upperB: abs(1.5), foreB: abs(-1.0) },
    lunge: 4,
  },
  corkscrew: {
    wind: { ...FIGHT, torso: rel(0.02), upperB: abs(2.1), foreB: abs(0.5) },
    hit: { ...STANCE, torso: rel(0.32), upperB: abs(0), foreB: abs(0), upperF: abs(1.5), foreF: abs(-1.0), thighB: abs(1.9) },
    lunge: 8,
  },
  gazelleHook: {
    wind: { ...STANCE, torso: rel(0.47), thighF: abs(1.1), shinF: abs(2.1), upperF: abs(1.8), foreF: abs(-0.6), upperB: abs(1.5), foreB: abs(-1.0) },
    hit: { ...STANCE, torso: rel(0.27), upperF: abs(0.25), foreF: abs(-0.35), upperB: abs(1.5), foreB: abs(-1.0) },
    lunge: 12,
  },
  dempsey: {
    wind: { ...STANCE, torso: rel(0.42), upperB: abs(1.7), foreB: abs(0.9), upperF: abs(1.4), foreF: abs(-0.8) },
    hit: { ...STANCE, torso: rel(-0.08), upperB: abs(-0.85), foreB: abs(-1.35), upperF: abs(1.5), foreF: abs(-1.0), thighB: abs(DOWN + 0.4) },
    lunge: 7,
  },
  seiken: {
    wind: { ...STANCE, torso: rel(0), thighF: abs(1.1), upperB: abs(2.3), foreB: abs(0.6), upperF: abs(1.5), foreF: abs(-1.0) },
    hit: { ...STANCE, torso: rel(0.15), upperB: abs(0.1), foreB: abs(0.1), upperF: abs(1.5), foreF: abs(-1.0) },
    lunge: 7,
  },
  kaitenGeri: {
    wind: { ...GUARD, torso: rel(0.77), thighB: abs(-0.5), shinB: abs(-0.4), thighF: abs(DOWN - 0.3), shinF: abs(DOWN) },
    hit: { upperF: abs(BACK - 0.6), upperB: abs(1.2), torso: rel(-1.03), thighB: abs(0.45), shinB: abs(0.5), thighF: abs(DOWN - 0.1), shinF: abs(DOWN) },
    lunge: 16,
    spin: true,
  },
  heartPunch: {
    wind: { ...STANCE, torso: rel(0.07), upperF: abs(0.5), foreF: abs(0.2), upperB: abs(1.5), foreB: abs(-1.0) },
    hit: { ...STANCE, torso: rel(0.27), upperF: abs(0), foreF: abs(0), upperB: abs(1.5), foreB: abs(-1.0) },
    lunge: 5,
  },
  kneeStomp: {
    wind: { ...GUARD, thighF: abs(0.6), shinF: abs(2.0), thighB: abs(DOWN + 0.3), shinB: abs(DOWN + 0.1) },
    hit: { ...GUARD, torso: rel(-0.18), thighF: abs(0.55), shinF: abs(0.55), thighB: abs(DOWN + 0.3) },
    lunge: 4,
  },
  // The Compressed Kick: the front foot stomps in, the rear leg is cocked back, then it swings through like a cannonball.
  shinCannon: {
    wind: { ...GUARD, torso: rel(0.22), thighF: abs(1.0), shinF: abs(DOWN), thighB: abs(2.3), shinB: abs(2.6) },
    hit: { ...GUARD, torso: rel(-0.28), thighF: abs(DOWN - 0.1), shinF: abs(DOWN), thighB: abs(0.15), shinB: abs(0.1) },
    lunge: 20,
  },
  // Thunderclap: a crouched iai, one hand on the hilt and the other on the scabbard, then the whole body goes through the cut.
  thunderclap: {
    wind: { thighF: abs(DOWN - 0.65), shinF: abs(DOWN + 0.15), thighB: abs(DOWN + 0.55), shinB: abs(DOWN + 0.3), torso: rel(0.2), upperF: abs(2.3), foreF: abs(0.9), upperB: abs(2.6), foreB: abs(2.3) },
    hit: { ...STANCE, torso: rel(0.38), upperF: abs(-0.08), foreF: abs(0.05), upperB: abs(2.4), foreB: abs(1.7), thighF: abs(DOWN - 0.8), shinF: abs(DOWN - 0.1), thighB: abs(DOWN + 0.8), shinB: abs(DOWN + 0.6) },
    lunge: 10,
  },
  // Oni Cut: the swords cross over the chest, then are flung wide.
  oniCut: {
    wind: { ...STANCE, torso: rel(-0.1), upperF: abs(1.6), foreF: abs(-0.6), upperB: abs(1.5), foreB: abs(-0.7) },
    hit: { ...STANCE, torso: rel(0.35), upperF: abs(-0.15), foreF: abs(0.1), upperB: abs(BACK - 0.35), foreB: abs(BACK - 0.15), thighF: abs(DOWN - 0.8), shinF: abs(DOWN - 0.1), thighB: abs(DOWN + 0.8), shinB: abs(DOWN + 0.5) },
    lunge: 12,
  },
  // Rubber moves: the arm (or leg) is drawn out longer than a person's while it strikes (render.ts `stretch`).
  pistol: {
    wind: { ...FIGHT, torso: rel(-0.15), upperF: abs(BACK - 0.5), foreF: abs(BACK - 0.2) },
    hit: { ...STANCE, torso: rel(0.3), upperF: abs(-0.02), foreF: abs(-0.02), upperB: abs(1.5), foreB: abs(-1.0) },
    lunge: 6,
  },
  bazooka: {
    wind: { ...STANCE, torso: rel(-0.25), upperF: abs(BACK - 0.5), foreF: abs(BACK - 0.3), upperB: abs(BACK - 0.6), foreB: abs(BACK - 0.35) },
    hit: { thighF: abs(DOWN - 0.7), thighB: abs(DOWN + 0.7), torso: rel(0.45), upperF: abs(0), foreF: abs(0), upperB: abs(0.06), foreB: abs(0.04) },
    lunge: 10,
  },
  whip: {
    wind: { ...GUARD, torso: rel(-0.1), thighF: abs(DOWN - 0.3), shinF: abs(DOWN + 0.5), thighB: abs(DOWN + 0.4) },
    hit: { ...GUARD, torso: rel(-0.4), thighF: abs(-0.1), shinF: abs(-0.05), thighB: abs(DOWN + 0.2) },
    lunge: 4,
  },
  mudaJab: {
    wind: FIGHT,
    hit: { ...STANCE, torso: rel(0.14), upperF: abs(-0.04), foreF: abs(-0.04), upperB: abs(1.5), foreB: abs(-1.0) },
    alt: { ...STANCE, torso: rel(0.2), upperB: abs(-0.04), foreB: abs(-0.04), upperF: abs(1.5), foreF: abs(-1.1) },
    lunge: 3,
  },
};

// A dungeon boss's own idle loop (src/game/bossLook.ts names it): how its inspiration waits for you.
const BOSS_IDLE: Record<string, (now: number) => BodyMotion> = {
  // Muay Thai bounce: the front knee lifts on every beat.
  brawler: (now) => {
    const b = Math.sin(now / 170), lift = Math.max(0, b);
    return still({ ...GUARD, thighF: abs(DOWN - 0.3 - lift * 0.55), shinF: abs(DOWN + 0.05 + lift * 0.7), thighB: abs(DOWN + 0.4), shinB: abs(DOWN + 0.2), torso: rel(0.06 + b * 0.03) });
  },
  // Open palms, low and wide, rolling on the spot: ready to take hold.
  grappler: (now) => {
    const b = Math.sin(now / 260);
    return still({ thighF: abs(DOWN - 0.55), shinF: abs(DOWN - 0.05), thighB: abs(DOWN + 0.55), shinB: abs(DOWN + 0.25), upperF: abs(0.55 + b * 0.06), foreF: abs(-0.15), upperB: abs(0.95 - b * 0.06), foreB: abs(-0.1), torso: rel(0.16 + b * 0.02), head: rel(b * 0.02) });
  },
  // Peek-a-boo: both fists at the face, the torso weaving to a rhythm.
  boxer: (now) => {
    const b = Math.sin(now / 240);
    return still({ ...STANCE, upperF: abs(1.05), foreF: abs(-1.4), upperB: abs(1.2), foreB: abs(-1.3), torso: rel(0.1 + b * 0.17), head: rel(-b * 0.12) });
  },
  // Rooted, wide, the palms low and open; breathing slowly.
  counter: (now) => {
    const b = Math.sin(now / 420);
    return still({ thighF: abs(DOWN - 0.55), shinF: abs(DOWN - 0.05), thighB: abs(DOWN + 0.55), shinB: abs(DOWN + 0.25), upperF: abs(0.7), foreF: abs(0.3), upperB: abs(0.85), foreB: abs(0.2), torso: rel(0.02 + b * 0.015), head: rel(b * 0.01) });
  },
  // Three swords, one hand on each hip: a wide and heavy stance.
  ronin: (now) => {
    const b = Math.sin(now / 360);
    return still({ ...STANCE, thighF: abs(DOWN - 0.5), shinF: abs(DOWN - 0.05), thighB: abs(DOWN + 0.5), shinB: abs(DOWN + 0.25), upperF: abs(0.5 + b * 0.03), foreF: abs(-0.2), upperB: abs(2.2), foreB: abs(1.4), torso: rel(0.08 + b * 0.015) });
  },
  // A crouched iai: one hand on the hilt and one on the scabbard, trembling very slightly. Dead still otherwise.
  sheathed: (now) => {
    const q = Math.sin(now / 40) * 0.012;
    return still({ thighF: abs(DOWN - 0.75), shinF: abs(DOWN + 0.2), thighB: abs(DOWN + 0.65), shinB: abs(DOWN + 0.35), torso: rel(0.35 + q), head: rel(0.1), upperF: abs(2.3), foreF: abs(0.9), upperB: abs(2.6), foreB: abs(2.3) });
  },
  // Loose and bouncing, arms swinging like rubber.
  rubber: (now) => {
    const b = Math.sin(now / 200);
    return still({ ...STANCE, upperF: abs(0.9 + b * 0.25), foreF: abs(0.6 + b * 0.3), upperB: abs(0.9 - b * 0.25), foreB: abs(0.7 - b * 0.3), torso: rel(0.05 + Math.sin(now / 180) * 0.05) });
  },
  // Upright and calm, hands in the pockets, floating a little.
  limitless: (now) => {
    const b = Math.sin(now / 520);
    return still({ ...STANCE, thighF: abs(DOWN - 0.12), thighB: abs(DOWN + 0.12), shinF: abs(DOWN - 0.04), shinB: abs(DOWN + 0.04), upperF: abs(1.45), foreF: abs(1.9), upperB: abs(1.65), foreB: abs(1.3), torso: rel(-0.03 + b * 0.01), head: rel(-0.05) }, { hover: 7 + b * 3 });
  },
  // Wide and low, fists at the hip, bouncing on the toes.
  turtle: (now) => {
    const b = Math.sin(now / 150);
    return still({ thighF: abs(DOWN - 0.6), shinF: abs(DOWN - 0.05), thighB: abs(DOWN + 0.6), shinB: abs(DOWN + 0.3), upperF: abs(1.0), foreF: abs(-0.9), upperB: abs(1.4), foreB: abs(-0.6), torso: rel(0.08 + b * 0.04), head: rel(b * 0.02) });
  },
  // Upright, one hand raised and beckoning, the other on the hip, the head tilted back a little: unhurried.
  regal: (now) => {
    const b = Math.sin(now / 480);
    return still({ ...STANCE, thighF: abs(DOWN - 0.2), thighB: abs(DOWN + 0.2), upperF: abs(-0.35 + b * 0.05), foreF: abs(-0.9 + b * 0.15), upperB: abs(1.0), foreB: abs(-0.4), torso: rel(-0.06 + b * 0.01), head: rel(-0.12) }, { hover: 4 + b * 2 });
  },
};

export const BOSS_IDLES = Object.keys(BOSS_IDLE);

// Idle stance per class: a 2-3 s loop, so a Tank reads heavy and an Attacker light before anyone moves.
function idleFor(cls: string, now: number, boss?: string): BodyMotion {
  if (boss && BOSS_IDLE[boss]) return BOSS_IDLE[boss](now);
  if (cls === "Tank") {
    const b = Math.sin(now / 380); // slow, heavy breathing in a low stance
    return still({ ...GUARD, thighF: abs(DOWN - 0.5), shinF: abs(DOWN + 0.05), thighB: abs(DOWN + 0.5), shinB: abs(DOWN + 0.25), torso: rel(0.1 + b * 0.025), head: rel(b * 0.02) });
  }
  if (cls === "Attacker") {
    const b = Math.sin(now / 330); // floats, palms open
    return still({ ...STANCE, upperF: abs(0.9 + b * 0.08), foreF: abs(-0.4), upperB: abs(1.3 - b * 0.08), foreB: abs(-0.2), torso: rel(-0.03 + b * 0.03) }, { hover: 5 + b * 4 });
  }
  if (cls === "Sword" || cls === "Mace") {
    const b = Math.sin(now / 320); // a steady guard sway; the mace sits lower and heavier
    const low = cls === "Mace" ? 0.12 : 0;
    return still({ ...GUARD, thighF: abs(DOWN - 0.35 - low), shinF: abs(DOWN - 0.1 + low), thighB: abs(DOWN + 0.35 + low), shinB: abs(DOWN + 0.15 + low), torso: rel(0.05 + low * 0.5 + b * 0.04), upperF: abs(1.15 + b * 0.05) });
  }
  // Fighter (and anyone else): bounces on the toes, like a real fighter waiting.
  const b = Math.sin(now / 160);
  return still({ ...FIGHT, torso: rel(0.04 + b * 0.03), head: rel(b * 0.03), upperF: abs(1.15 + b * 0.08) });
}

const still = (pose: PoseTargets, extra: Partial<BodyMotion> = {}): BodyMotion => ({ pose, lunge: 0, fall: 0, flip: false, alpha: 1, ...extra });

export function poseFor(f: F, special: SpecialKind, now: number, cls = "", idle?: string): BodyMotion {
  const t = f.t;
  switch (f.action) {
    case "idle": {
      if (!f.grounded) {
        // Tuck the legs, arms up for balance.
        return still({ thighF: abs(DOWN - 0.8), shinF: abs(DOWN + 0.15), thighB: abs(DOWN - 0.25), shinB: abs(DOWN + 0.7), upperF: rel(-0.7), upperB: rel(0.6) });
      }
      if (f.blocking) return still({ ...GUARD, ...STANCE, upperF: abs(0.9), foreF: abs(-1.45), torso: rel(-0.12), head: rel(-0.15) });
      if (f.moving) {
        const s = Math.sin(now / 105);
        return still({
          ...GUARD,
          thighF: abs(DOWN + s * 0.55),
          shinF: abs(DOWN + s * 0.55 + Math.max(0, -s) * 0.6),
          thighB: abs(DOWN - s * 0.55),
          shinB: abs(DOWN - s * 0.55 + Math.max(0, s) * 0.6),
          torso: rel(0.08),
        });
      }
      return idleFor(cls, now, idle);
    }
    case "attack":
    case "kick": {
      const name = f.move ?? (f.action === "kick" ? "roundhouse" : "jab");
      const mv = MOVES[name];
      const p = MOVE_POSES[name];
      if (t < mv.from) return still(p.wind, { flip: !!p.spin && t > mv.from * 0.5 });
      if (t <= mv.to + 3) return still(p.alt && f.combo % 2 === 1 ? p.alt : p.hit, { lunge: p.lunge ?? 0 });
      return still(FIGHT);
    }
    case "special":
      return specialPose(special, f, now);
    case "hit": {
      // Spine recoil: the pose follows where the blow landed. A hit to the head snaps the head back and arches the
      // spine; a body blow folds the torso over the fist and drops the arms.
      const snap = Math.min(1, t / 3); // reaches the full recoil in three ticks, so it reads as a snap, not a lean
      if (f.hitHigh) return still({ torso: rel(-0.3 * snap), head: rel(-0.95 * snap), upperF: rel(0.9), upperB: rel(-0.9), foreF: rel(0.5), thighF: rel(0.25) }, { lunge: -7 });
      return still({ torso: rel(0.62 * snap), head: rel(0.35 * snap), upperF: abs(DOWN - 0.25), foreF: abs(DOWN - 0.1), upperB: abs(DOWN + 0.3), foreB: abs(DOWN + 0.2), thighF: rel(0.3), thighB: rel(-0.25) }, { lunge: -4 });
    }
    case "ko": {
      // Topple over (about the feet) with the limbs flopping out.
      const p = Math.min(1, t / 22);
      return still({ upperF: rel(1.3), upperB: rel(-1.2), foreF: rel(0.6), thighF: rel(-0.55), thighB: rel(0.45), head: rel(-0.4) }, { fall: -1.45 * (1 - (1 - p) * (1 - p)) });
    }
  }
  return still({});
}

// Round intro (a taunt) and the winner's celebration.
export function ceremonyPose(kind: "intro" | "win", slot: number, now: number): BodyMotion {
  const b = Math.sin(now / 140);
  if (kind === "win") {
    return still({ upperF: abs(UP - 0.15 + b * 0.1), foreF: abs(UP - 0.1), upperB: abs(DOWN + 0.4), foreB: abs(-0.4), torso: rel(-0.1), head: rel(-0.15), ...STANCE });
  }
  // One cracks the knuckles, the other beckons "come at me".
  return slot === 0
    ? still({ upperF: abs(0.6), foreF: abs(-1.2 + b * 0.25), upperB: abs(0.9), foreB: abs(-0.9 - b * 0.25), torso: rel(0.05), ...STANCE })
    : still({ ...GUARD, ...STANCE, upperF: abs(-0.1), foreF: abs(-0.9 + b * 0.6), torso: rel(-0.05) });
}

function specialPose(kind: SpecialKind, f: F, now: number): BodyMotion {
  const t = f.t;
  const wide = { thighF: abs(DOWN - 0.55), shinF: abs(DOWN - 0.2), thighB: abs(DOWN + 0.55), shinB: abs(DOWN + 0.3) };
  // An ultimate that has grabbed its target pounds them with alternating fists once its own move has played out.
  if (f.ult && f.ultEnd > 0 && t >= SPECIAL_DURATION[kind]) {
    const left = Math.floor(t / 3) % 2 === 0;
    const jitter = Math.sin(t * 2.3) * 0.2;
    return still(
      left
        ? { upperF: abs(jitter), foreF: abs(jitter), upperB: abs(1.6), foreB: abs(-1.0), torso: rel(0.24), ...wide }
        : { upperB: abs(jitter), foreB: abs(jitter), upperF: abs(1.5), foreF: abs(-1.1), torso: rel(0.3), ...wide },
      { lunge: 6 },
    );
  }
  switch (kind) {
    case "time_stop_barrage": {
      // The arms thrown open for the stop, then the fists fly (alternating on the beat) while the world holds still.
      if (t < TIME_STOP.start) return still({ upperF: abs(UP + 0.55), foreF: abs(UP + 0.3), upperB: abs(BACK - 0.35), foreB: abs(BACK), torso: rel(-0.18), head: rel(-0.2), ...wide });
      if (f.ultEnd > 0) {
        const left = Math.floor(t / 2) % 2 === 0;
        const jitter = Math.sin(t * 2.9) * 0.2;
        return still(
          left
            ? { upperF: abs(jitter), foreF: abs(jitter), upperB: abs(1.6), foreB: abs(-1.0), torso: rel(0.24), ...wide }
            : { upperB: abs(jitter), foreB: abs(jitter), upperF: abs(1.5), foreF: abs(-1.1), torso: rel(0.3), ...wide },
          { lunge: 6 },
        );
      }
      return still({ ...FIGHT, torso: rel(0.1) });
    }
    case "bolt":
    case "arrow":
    case "orb":
      return t < 10
        ? still({ upperF: abs(BACK - 0.6), foreF: abs(BACK - 0.3), upperB: abs(BACK - 0.8), foreB: abs(BACK - 0.5), torso: rel(-0.2), ...wide })
        : still({ upperF: abs(-0.05), foreF: abs(-0.05), upperB: abs(0.12), foreB: abs(0.02), torso: rel(0.16), ...wide }, { lunge: 6 });
    case "beam":
      // Cup both hands at the hip, then thrust them forward and hold the beam.
      if (t < BEAM.fireFrom) {
        return still({ upperF: abs(BACK - 0.9), foreF: abs(BACK - 0.3), upperB: abs(BACK - 1.0), foreB: abs(BACK - 0.35), torso: rel(-0.3), head: rel(-0.1), ...wide });
      }
      return still({ upperF: abs(0), foreF: abs(0), upperB: abs(0.06), foreB: abs(0.04), torso: rel(0.12), ...wide }, { lunge: -4 + Math.sin(now / 25) * 1.5 });
    case "wave":
      return t < 14
        ? still({ upperF: abs(UP - 0.3), foreF: abs(UP - 0.4), upperB: abs(UP - 0.5), foreB: abs(UP - 0.6), torso: rel(-0.2), ...wide })
        : still({ upperF: abs(DOWN - 0.4), foreF: abs(DOWN - 0.2), upperB: abs(DOWN - 0.3), foreB: abs(DOWN - 0.1), torso: rel(0.6), head: rel(0.2), ...wide });
    case "slash":
      return t < 4
        ? still({ upperF: abs(UP - 0.4), foreF: abs(UP - 0.7), torso: rel(-0.15) })
        : still({ upperF: abs(0.75), foreF: abs(0.95), torso: rel(0.3), thighF: abs(DOWN - 0.5), thighB: abs(DOWN + 0.45) });
    case "charge":
      return still({ ...GUARD, upperF: abs(0.15), foreF: abs(-0.7), torso: rel(0.42), head: rel(0.1), thighF: abs(DOWN - 0.6), thighB: abs(DOWN + 0.5) });
    case "uppercut":
      return t < 8
        ? still({ upperF: abs(1.35), foreF: abs(0.9), torso: rel(0.25), thighF: abs(DOWN - 0.3) })
        : still({ upperF: abs(-1.25), foreF: abs(-1.5), torso: rel(-0.22), head: rel(-0.2), thighB: abs(DOWN + 0.35) });
    case "spiral":
      // Sphere spun up in the front palm, then a running ram.
      if (t < 16) return still({ upperF: abs(0.7), foreF: abs(0.05), upperB: abs(0.5), foreB: abs(-0.4), torso: rel(-0.1), ...wide });
      {
        const s = Math.sin(now / 55);
        return still({ upperF: abs(0.02), foreF: abs(0), upperB: abs(BACK - 0.6), thighF: abs(DOWN - 0.7 + s * 0.4), shinF: abs(DOWN + 0.2), thighB: abs(DOWN + 0.6 - s * 0.4), shinB: abs(BACK - 0.9), torso: rel(0.4) });
      }
    case "teleport":
      if (t < 10) return still({ ...FIGHT, torso: rel(0.2) }, { alpha: Math.max(0, 1 - t / 4) });
      return t < 13
        ? still({ ...GUARD, thighF: abs(-0.05), shinF: abs(DOWN + 0.5), torso: rel(-0.2) }, { alpha: (t - 9) / 4 })
        : still({ thighF: abs(-0.3), shinF: abs(-0.4), thighB: abs(DOWN + 0.12), torso: rel(-0.38), upperF: rel(-0.8), upperB: rel(0.8) }, { lunge: 8 });
    case "barrage": {
      if (t < 6 || t > 44) return still({ ...FIGHT, torso: rel(0.15) });
      // Fists alternate every two ticks; the finisher is a big straight.
      if (t >= 42) return still({ upperF: abs(-0.03), foreF: abs(-0.03), upperB: abs(1.9), torso: rel(0.3), ...wide }, { lunge: 14 });
      const left = Math.floor(t / 2) % 2 === 0;
      const jitter = Math.sin(t * 2.7) * 0.25;
      return still(
        left
          ? { upperF: abs(jitter), foreF: abs(jitter), upperB: abs(1.6), foreB: abs(-1.0), torso: rel(0.22), ...wide }
          : { upperB: abs(jitter), foreB: abs(jitter), upperF: abs(1.5), foreF: abs(-1.1), torso: rel(0.3), ...wide },
        { lunge: 6},
      );
    }
    case "shatter":
      if (t < 12) return still({ upperF: abs(-0.3), foreF: abs(-0.15), upperB: abs(0.1), foreB: abs(-0.3), torso: rel(-0.12), ...wide });
      if (t <= 16) return still({ upperF: abs(0), foreF: abs(0), upperB: abs(0.05), foreB: abs(0.02), torso: rel(0.32), ...wide }, { lunge: 8 });
      return still({ ...FIGHT, torso: rel(0.2) });
    case "counter":
      // A calm stance with open palms; the answer is a palm thrust.
      if (f.landed && t >= 40) return still({ upperF: abs(-0.05), foreF: abs(-0.3), upperB: abs(0.9), foreB: abs(-0.6), torso: rel(0.25), thighF: abs(DOWN - 0.5), thighB: abs(DOWN + 0.5) }, { lunge: 10 });
      if (t < 24) return still({ upperF: abs(0.5), foreF: abs(-0.7), upperB: abs(0.9), foreB: abs(-0.5), torso: rel(-0.05), head: rel(-0.05), ...wide });
      return still({ ...FIGHT, torso: rel(0.1) });
    case "dash_slash":
      if (t < 10) return still({ upperF: abs(BACK - 0.3), foreF: abs(BACK - 0.1), upperB: abs(BACK - 0.5), foreB: abs(BACK - 0.3), torso: rel(-0.25), thighF: abs(DOWN - 0.6), shinF: abs(DOWN + 0.4), thighB: abs(DOWN + 0.6), shinB: abs(DOWN + 0.2) });
      if (t <= 18) return still({ upperF: abs(-0.02), foreF: abs(-0.02), upperB: abs(BACK - 0.3), foreB: abs(BACK - 0.2), torso: rel(0.5), thighF: abs(DOWN - 0.95), shinF: abs(DOWN - 0.1), thighB: abs(DOWN + 0.95), shinB: abs(BACK - 0.6) });
      return still({ ...FIGHT, upperF: abs(0.6), foreF: abs(0.4), torso: rel(0.1) }); // sheathing, back to back
    case "pull": {
      // Throws the hook (arm back, then out) and hauls on the line.
      if (t < 12) return still({ upperF: abs(BACK - 0.6), foreF: abs(BACK - 0.4), upperB: abs(1.2), foreB: abs(-0.8), torso: rel(-0.2), ...wide });
      const heave = Math.sin(now / 90) * 0.15;
      return still({ upperF: abs(-0.05 + heave), foreF: abs(-0.05 + heave), upperB: abs(0.15), foreB: abs(0.1), torso: rel(t < 20 ? 0.2 : -0.1 + heave), ...wide }, { lunge: t < 20 ? 4 : -4 });
    }
    case "remote_detonation":
      // Points where they stand, then closes the fist.
      if (t < 8) return still({ upperF: abs(-0.05), foreF: abs(-0.05), upperB: abs(1.3), foreB: abs(-0.7), torso: rel(0.05), ...wide });
      return still({ upperF: abs(UP + 0.4), foreF: abs(UP + 0.2), upperB: abs(1.3), foreB: abs(-0.7), torso: rel(-0.05), ...wide });
    case "meteor":
      if (t <= 14) return still({ thighF: abs(DOWN - 1.2), shinF: abs(DOWN + 0.3), thighB: abs(DOWN - 0.9), shinB: abs(DOWN + 0.6), upperF: abs(UP + 0.4), upperB: abs(UP + 0.1), torso: rel(0.2) });
      if (!f.hitN) return still({ thighF: abs(0.8), shinF: abs(0.75), thighB: abs(DOWN + 0.9), shinB: abs(BACK - 0.6), upperF: abs(UP - 0.6), upperB: abs(BACK + 0.4), torso: rel(-0.2) });
      return still({ ...wide, upperF: abs(0.6), foreF: abs(1.2), upperB: abs(2.0), torso: rel(0.35) });
  }
  return still(FIGHT);
}
