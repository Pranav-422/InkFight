// What the puppet's limbs do for each fighter state. Angles are in sprite space,
// facing +x: 0 = straight ahead, π/2 = down, -π/2 = up, π = behind.

import type { PoseTargets } from "./skeleton";
import { KICK, type SpecialKind, type Snapshot } from "./sim";

type F = Snapshot["fighters"][number];

const UP = -Math.PI / 2, DOWN = Math.PI / 2, BACK = Math.PI;
const abs = (a: number) => ({ abs: a });
const rel = (a: number) => ({ rel: a });

// Guard: fists up in front of the chest.
const GUARD: PoseTargets = { upperF: abs(1.15), foreF: abs(-1.2), upperB: abs(1.5), foreB: abs(-1.0) };

export type BodyMotion = { pose: PoseTargets; lunge: number; fall: number };

export function poseFor(f: F, special: SpecialKind, now: number): BodyMotion {
  const t = f.t;
  let lunge = 0, fall = 0;
  let pose: PoseTargets = {};

  switch (f.action) {
    case "idle": {
      if (!f.grounded) {
        // Tuck the legs, arms up for balance.
        pose = { thighF: abs(DOWN - 0.8), shinF: abs(DOWN + 0.15), thighB: abs(DOWN - 0.25), shinB: abs(DOWN + 0.7), upperF: rel(-0.7), upperB: rel(0.6) };
      } else if (f.blocking) {
        pose = { ...GUARD, upperF: abs(0.9), foreF: abs(-1.45), torso: rel(-0.12), head: rel(-0.15) };
      } else if (f.moving) {
        const ph = now / 105;
        const s = Math.sin(ph);
        pose = {
          thighF: abs(DOWN + s * 0.55),
          shinF: abs(DOWN + s * 0.55 + Math.max(0, -s) * 0.6),
          thighB: abs(DOWN - s * 0.55),
          shinB: abs(DOWN - s * 0.55 + Math.max(0, s) * 0.6),
          upperF: rel(-s * 0.4),
          upperB: rel(s * 0.4),
          torso: rel(0.06),
        };
      } else {
        // Breathing + a loose bounce of the arms.
        const b = Math.sin(now / 420);
        pose = { torso: rel(b * 0.025), head: rel(b * 0.03), upperF: rel(b * 0.06), upperB: rel(-b * 0.06) };
      }
      break;
    }
    case "attack": {
      // Punch: wind the fist back, snap it straight out, then recover.
      if (t < 6) pose = { upperF: abs(BACK - 0.9), foreF: abs(-0.5), upperB: abs(1.6), foreB: abs(-1.1), torso: rel(-0.1) };
      else if (t <= 12) {
        pose = { upperF: abs(-0.06), foreF: abs(-0.06), upperB: abs(1.9), foreB: abs(-0.8), torso: rel(0.14), head: rel(0.05) };
        lunge = 10;
      } else pose = GUARD;
      break;
    }
    case "kick": {
      // Chamber the knee, extend the leg forward, lean back for balance.
      if (t < KICK.activeFrom) pose = { thighF: abs(-0.05), shinF: abs(DOWN + 0.5), torso: rel(-0.18), upperF: rel(-0.5), upperB: rel(0.5) };
      else if (t <= KICK.activeTo) {
        pose = { thighF: abs(-0.2), shinF: abs(-0.2), thighB: abs(DOWN + 0.12), torso: rel(-0.32), head: rel(-0.1), upperF: rel(-0.8), upperB: rel(0.8) };
        lunge = 6;
      } else pose = { thighF: abs(DOWN - 0.4), shinF: abs(DOWN + 0.2), torso: rel(-0.08) };
      break;
    }
    case "special": {
      const early = t < (special === "uppercut" ? 8 : special === "slash" || special === "charge" ? 4 : 10);
      if (special === "bolt" || special === "arrow" || special === "orb") {
        pose = early
          ? { upperF: abs(BACK - 0.6), foreF: abs(BACK - 0.3), upperB: abs(BACK - 0.8), foreB: abs(BACK - 0.5), torso: rel(-0.2) }
          : { upperF: abs(-0.05), foreF: abs(-0.05), upperB: abs(0.12), foreB: abs(0.02), torso: rel(0.16) };
        if (!early) lunge = 6;
      } else if (special === "slash") {
        pose = early
          ? { upperF: abs(UP - 0.4), foreF: abs(UP - 0.7), torso: rel(-0.15) }
          : { upperF: abs(0.75), foreF: abs(0.95), torso: rel(0.3), thighF: abs(DOWN - 0.5), thighB: abs(DOWN + 0.45) };
      } else if (special === "charge") {
        pose = { ...GUARD, upperF: abs(0.15), foreF: abs(-0.7), torso: rel(0.42), head: rel(0.1), thighF: abs(DOWN - 0.6), thighB: abs(DOWN + 0.5) };
      } else {
        // Uppercut: fist from the hip to the sky.
        pose = early
          ? { upperF: abs(1.35), foreF: abs(0.9), torso: rel(0.25), thighF: abs(DOWN - 0.3) }
          : { upperF: abs(-1.25), foreF: abs(-1.5), torso: rel(-0.22), head: rel(-0.2), thighB: abs(DOWN + 0.35) };
      }
      break;
    }
    case "hit":
      pose = { torso: rel(-0.38), head: rel(-0.45), upperF: rel(0.8), upperB: rel(-0.8), foreF: rel(0.5), thighF: rel(0.25) };
      lunge = -6;
      break;
    case "ko": {
      // Topple over (about the feet) with the limbs flopping out.
      const p = Math.min(1, t / 22);
      fall = -1.45 * (1 - (1 - p) * (1 - p));
      pose = { upperF: rel(1.3), upperB: rel(-1.2), foreF: rel(0.6), thighF: rel(-0.55), thighB: rel(0.45), head: rel(-0.4) };
      break;
    }
  }
  return { pose, lunge, fall };
}
