// Clean stick-figure body for every fighter: a fixed skeleton posed by poses.ts and
// drawn as round-capped strokes. The head is the player's own drawing, and the
// class item sits in the front hand. Replaces bending the photo itself, which
// tore apart on most real drawings.

import { normClass } from "../lib/stats";
import type { Piece } from "./bossLook";
import { itemOf } from "./moves";
import { drawOutfit } from "./outfit";
import { BONES, type BoneName, type Joints, type Vec } from "./skeleton";
import type { Prop } from "./sprite";

// Rest stance in world units, feet at y = 0, facing +x. 180 tall like BODY.h * 1.06.
const REST_JOINTS: Joints = {
  head: { x: 2, y: -160 },
  shoulder: { x: 0, y: -132 },
  hip: { x: 0, y: -78 },
  elbowF: { x: 14, y: -108 },
  handF: { x: 24, y: -84 },
  elbowB: { x: -12, y: -108 },
  handB: { x: -20, y: -84 },
  kneeF: { x: 12, y: -40 },
  footF: { x: 20, y: 0 },
  kneeB: { x: -10, y: -40 },
  footB: { x: -18, y: 0 },
};
export const HEAD_R = 20;

// Where a held blade or staff points (world angle, facing +x), from the forearm's angle:
// mostly forward-up, following the arm only partly, so it never hangs down or backwards
// in the guard (forearm up) like a real grip would turn it. Guard → about 60° up.
export const heldAngle = (fore: number) => -1.0 * 0.6 + fore * 0.4;

const ang = (a: Vec, b: Vec) => Math.atan2(b.y - a.y, b.x - a.x);
const REST = {} as Record<BoneName, number>;
const LEN = {} as Record<BoneName, number>;
for (const b of BONES) {
  REST[b.name] = ang(REST_JOINTS[b.from], REST_JOINTS[b.to]);
  LEN[b.name] = Math.hypot(REST_JOINTS[b.to].x - REST_JOINTS[b.from].x, REST_JOINTS[b.to].y - REST_JOINTS[b.from].y);
}
// What resolvePose needs (it only reads the rest angles).
export const STICK_REST = { rest: REST };

export type StickPose = { joints: Joints; world: Record<BoneName, number> };

// Body proportions from the stats (render only: hitboxes don't change). High DUR = broad shoulders and thicker
// limbs, high SPD = lean with longer legs, and the opposite for low values. 70 is the average build (unchanged).
export type Build = { shoulder: number; thick: number; legs: number };
export const AVERAGE_BUILD: Build = { shoulder: 0, thick: 1, legs: 1 };
export function buildFor(dur: number, spd: number): Build {
  const d = Math.max(-1, Math.min(1, (dur - 70) / 30)); // 40..100 → -1..1
  const s = Math.max(-1, Math.min(1, (spd - 70) / 30));
  return { shoulder: Math.max(0, d) * 11, thick: Math.max(0.8, Math.min(1.4, 1 + 0.28 * d - 0.12 * s)), legs: 1 + 0.08 * s };
}

// Forward kinematics: local rotations (from resolvePose) → joint positions.
export function solveStick(local: Record<BoneName, number>, build: Build = AVERAGE_BUILD): StickPose {
  const joints = { ...REST_JOINTS };
  const world = {} as Record<BoneName, number>;
  const acc = {} as Record<BoneName, number>;
  for (const b of BONES) {
    acc[b.name] = (b.parent ? acc[b.parent] : 0) + (local[b.name] ?? 0);
    world[b.name] = REST[b.name] + acc[b.name];
    const from = joints[b.from];
    const len = LEN[b.name] * (b.name.startsWith("thigh") || b.name.startsWith("shin") ? build.legs : 1);
    joints[b.to] = { x: from.x + Math.cos(world[b.name]) * len, y: from.y + Math.sin(world[b.name]) * len };
  }
  return { joints, world };
}

const LIMBS: [keyof Joints, keyof Joints, keyof Joints][] = [
  ["shoulder", "elbowB", "handB"],
  ["hip", "kneeB", "footB"],
  ["hip", "kneeF", "footF"],
  ["shoulder", "elbowF", "handF"],
];

export function drawStick(
  ctx: CanvasRenderingContext2D,
  { joints: j, world }: StickPose,
  o: {
    ink: string; head: HTMLCanvasElement | null; prop: Prop | null; cls: string; item?: string | null; accent: string; width: number;
    build?: Build; // body proportions from DUR/SPD
    now?: number; // ms, for the cosmetics that move (orbs, headband tails)
    plain?: boolean; // no class cosmetics: afterimages, and the builder's drawing (which is measured like a scanned one)
    outfit?: Piece[]; // a dungeon boss's own clothes (src/game/outfit.ts) instead of its class's cosmetics
    sheathed?: boolean; // a held sword shows only its hilt: the blade is in the scabbard (the sheathed swordsman between draws)
    headScale?: number; // a boss's head is drawn, not cut from a photo: world units per pixel of its canvas, with the face circle at headCenter
    headCenter?: { x: number; y: number };
  },
) {
  const build = o.build ?? AVERAGE_BUILD;
  const cls = o.plain || o.outfit ? "" : normClass(o.cls);
  const now = o.now ?? 0;
  const pen = o.width * build.thick;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.strokeStyle = o.ink;
  ctx.lineWidth = pen; // the drawing's own pen weight
  // Shoulders: both arms start at the ends of a yoke across the top of the torso (a point for an average build).
  const across = world.torso + Math.PI / 2; // torso angle turned a quarter: "forward" when upright
  const half = build.shoulder;
  const sF = { x: j.shoulder.x + Math.cos(across) * half, y: j.shoulder.y + Math.sin(across) * half };
  const sB = { x: j.shoulder.x - Math.cos(across) * half, y: j.shoulder.y - Math.sin(across) * half };
  // Far limbs first, then torso, then near limbs: reads as depth.
  const limb = ([a, b, c]: (typeof LIMBS)[number], from?: Vec) => {
    ctx.beginPath();
    ctx.moveTo((from ?? j[a]).x, (from ?? j[a]).y);
    ctx.lineTo(j[b].x, j[b].y);
    ctx.lineTo(j[c].x, j[c].y);
    ctx.stroke();
  };
  const wear = o.outfit && !o.plain ? { ink: o.ink, pen, now, world, sB, sF } : null;
  if (wear) drawOutfit(ctx, o.outfit!, "back", j, wear);
  if (cls === "Attacker") floatingOrbs(ctx, j, o, now);
  limb(LIMBS[0], sB);
  limb(LIMBS[1]);
  ctx.beginPath();
  ctx.moveTo(j.hip.x, j.hip.y);
  ctx.lineTo(j.shoulder.x, j.shoulder.y);
  ctx.stroke();
  if (half > 0.5) {
    ctx.beginPath();
    ctx.moveTo(sB.x, sB.y);
    ctx.lineTo(sF.x, sF.y);
    ctx.stroke();
  }
  if (cls === "Sword") sheath(ctx, j, world, o, pen);
  limb(LIMBS[2]);
  if (wear) drawOutfit(ctx, o.outfit!, "mid", j, wear);
  if (cls === "Tank") shoulderPads(ctx, sB, sF, world, o);

  // Head: the player's drawing, turned with the neck. A plain circle until it loads.
  const tilt = world.head - REST.head;
  ctx.save();
  ctx.translate(j.head.x, j.head.y);
  ctx.rotate(tilt);
  if (o.head && o.headScale) {
    // A boss's head is its own drawing, face and hair and hat and all: no white behind it, and it may leave the head circle.
    const s = o.headScale, c = o.headCenter ?? { x: o.head.width / 2, y: o.head.height / 2 };
    ctx.drawImage(o.head, -c.x * s, -c.y * s, o.head.width * s, o.head.height * s);
  } else if (o.head) {
    // Paper-white face behind the drawing's lines, so the head reads as solid.
    ctx.fillStyle = "#fff";
    ctx.beginPath();
    ctx.arc(0, 0, HEAD_R * 1.05, 0, Math.PI * 2);
    ctx.fill();
    const s = (HEAD_R * 2.4) / Math.max(o.head.width, o.head.height);
    ctx.drawImage(o.head, (-o.head.width * s) / 2, (-o.head.height * s) / 2, o.head.width * s, o.head.height * s);
  } else {
    ctx.fillStyle = "#fff";
    ctx.beginPath();
    ctx.arc(0, 0, HEAD_R, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
  if (cls === "Mace") headband(ctx, o.accent, now);
  ctx.restore();

  if (o.prop) {
    // The item the player actually drew, turned with the forearm.
    const p = o.prop;
    ctx.save();
    ctx.translate(j.handF.x, j.handF.y);
    // A long item points along heldAngle. Anything else gets only half the forearm's turn,
    // so it mostly keeps the angle it was drawn at instead of sweeping across the face.
    ctx.rotate(p.axis !== null ? heldAngle(world.foreF) - p.axis : (world.foreF - p.rest) * 0.45);
    ctx.scale(p.scale, p.scale);
    ctx.drawImage(p.img, -p.hx, -p.hy);
    ctx.restore();
  } else if (!(wear && itemOf(o.item, o.cls) === "nothing")) drawItem(ctx, itemOf(o.item, o.cls), j, world.foreF, o.ink, o.accent, o.sheathed); // (a boss's bare hands are its outfit's business)
  ctx.lineWidth = pen;
  ctx.strokeStyle = o.ink;
  limb(LIMBS[3], sF);
  if (cls === "Fighter") handWraps(ctx, j, o);
  if (wear) drawOutfit(ctx, o.outfit!, "front", j, wear);
}

// ---------------------------------------------------------------- class cosmetics (ink colour, procedural)

// Attacker: three small orbs circling behind the shoulders.
function floatingOrbs(ctx: CanvasRenderingContext2D, j: Joints, o: { ink: string; accent: string }, now: number) {
  ctx.save();
  ctx.lineWidth = 3;
  ctx.strokeStyle = o.ink;
  for (let i = 0; i < 3; i++) {
    const a = now / 700 + (i * Math.PI * 2) / 3;
    const x = j.shoulder.x - 14 + Math.cos(a) * 40, y = j.shoulder.y - 8 + Math.sin(a) * 15 + Math.sin(now / 430 + i * 2) * 3;
    ctx.fillStyle = "#fff";
    ctx.beginPath();
    ctx.arc(x, y, 6.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = o.accent;
    ctx.beginPath();
    ctx.arc(x, y, 2.6, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

// Sword: a scabbard on the back hip, on a belt.
function sheath(ctx: CanvasRenderingContext2D, j: Joints, world: Record<BoneName, number>, o: { ink: string; accent: string }, pen: number) {
  const rot = world.torso + Math.PI / 2; // 0 when the torso is upright
  const at = (x: number, y: number): Vec => ({ x: j.hip.x + x * Math.cos(rot) - y * Math.sin(rot), y: j.hip.y + x * Math.sin(rot) + y * Math.cos(rot) });
  const belt0 = at(-9, 0), belt1 = at(7, 0), top = at(-5, 2), tip = at(-21, 31);
  ctx.save();
  ctx.lineCap = "round";
  ctx.strokeStyle = o.ink;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(belt0.x, belt0.y);
  ctx.lineTo(belt1.x, belt1.y);
  ctx.stroke();
  ctx.lineWidth = Math.max(4, pen * 0.85);
  ctx.beginPath();
  ctx.moveTo(top.x, top.y);
  ctx.lineTo(tip.x, tip.y);
  ctx.stroke();
  ctx.fillStyle = o.accent;
  ctx.beginPath();
  ctx.arc(tip.x, tip.y, 3, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

// Tank: a domed pad on each shoulder.
function shoulderPads(ctx: CanvasRenderingContext2D, sB: Vec, sF: Vec, world: Record<BoneName, number>, o: { ink: string; accent: string }) {
  const rot = world.torso + Math.PI / 2;
  const mid = { x: (sB.x + sF.x) / 2, y: (sB.y + sF.y) / 2 };
  const reach = Math.max(7, Math.hypot(sF.x - sB.x, sF.y - sB.y) / 2);
  ctx.save();
  ctx.fillStyle = o.accent;
  ctx.strokeStyle = o.ink;
  ctx.lineWidth = 3.5;
  for (const side of [-1, 1]) {
    ctx.save();
    ctx.translate(mid.x + Math.cos(rot) * reach * side, mid.y + Math.sin(rot) * reach * side);
    ctx.rotate(rot);
    ctx.beginPath();
    ctx.ellipse(0, 0, 12, 10, 0, Math.PI, Math.PI * 2);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }
  ctx.restore();
}

// Mace: a headband across the forehead with two tails fluttering behind (drawn in the head's own frame).
function headband(ctx: CanvasRenderingContext2D, accent: string, now: number) {
  const r = HEAD_R, y = -r * 0.4, f = Math.sin(now / 110) * 4;
  ctx.save();
  ctx.lineCap = "round";
  ctx.strokeStyle = accent;
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(-r * 0.97, y);
  ctx.lineTo(r * 0.97, y);
  ctx.stroke();
  ctx.lineWidth = 3.5;
  ctx.beginPath();
  ctx.moveTo(-r * 0.95, y);
  ctx.quadraticCurveTo(-r - 9, y - f, -r - 23, y + 5 + f);
  ctx.moveTo(-r * 0.95, y);
  ctx.quadraticCurveTo(-r - 7, y + 5 + f, -r - 19, y + 15 - f);
  ctx.stroke();
  ctx.restore();
}

// Fighter: three tape bands around each wrist.
function handWraps(ctx: CanvasRenderingContext2D, j: Joints, o: { accent: string }) {
  ctx.save();
  ctx.lineCap = "round";
  ctx.strokeStyle = o.accent;
  ctx.lineWidth = 3;
  for (const [e, h] of [[j.elbowF, j.handF], [j.elbowB, j.handB]] as const) {
    const len = Math.hypot(h.x - e.x, h.y - e.y) || 1;
    const dx = (h.x - e.x) / len, dy = (h.y - e.y) / len;
    for (let k = 1; k <= 3; k++) {
      const px = h.x - dx * (4 + k * 4.5), py = h.y - dy * (4 + k * 4.5);
      ctx.beginPath();
      ctx.moveTo(px - dy * 6, py + dx * 6);
      ctx.lineTo(px + dy * 6, py - dx * 6);
      ctx.stroke();
    }
  }
  ctx.restore();
}

// The item, held in the front hand and aligned with the forearm. "nothing" = taped fists.
function drawItem(ctx: CanvasRenderingContext2D, item: string, j: Joints, fore: number, ink: string, accent: string, sheathed = false) {
  const h = j.handF;
  ctx.save();
  ctx.translate(h.x, h.y);
  ctx.strokeStyle = ink;
  ctx.fillStyle = "#fff";
  ctx.lineWidth = 4;
  switch (item) {
    case "sword": {
      // Blade continues past the fist (drawn along -y), crossguard across it.
      ctx.rotate(heldAngle(fore) + Math.PI / 2);
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(0, 6);
      ctx.lineTo(0, sheathed ? -8 : -62);
      ctx.stroke();
      ctx.strokeStyle = accent;
      ctx.beginPath();
      ctx.moveTo(-10, -4);
      ctx.lineTo(10, -4);
      ctx.stroke();
      break;
    }
    case "mace": {
      // Handle along the held angle (drawn along -y) with a spiked head on the end.
      ctx.rotate(heldAngle(fore) + Math.PI / 2);
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(0, 8);
      ctx.lineTo(0, -46);
      ctx.stroke();
      ctx.lineWidth = 3;
      for (let i = 0; i < 8; i++) {
        const a = (i * Math.PI) / 4;
        ctx.beginPath();
        ctx.moveTo(Math.cos(a) * 11, -56 + Math.sin(a) * 11);
        ctx.lineTo(Math.cos(a) * 18, -56 + Math.sin(a) * 18);
        ctx.stroke();
      }
      ctx.lineWidth = 4;
      ctx.fillStyle = accent;
      ctx.beginPath();
      ctx.arc(0, -56, 11, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      break;
    }
    case "book": {
      ctx.rotate(fore);
      ctx.fillStyle = accent;
      ctx.beginPath();
      ctx.roundRect(-2, -12, 22, 26, 3);
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(9, -12);
      ctx.lineTo(9, 14);
      ctx.stroke();
      break;
    }
    case "staff": {
      // Staff stays mostly upright (drawn along -y), gem on top.
      ctx.rotate((heldAngle(fore) + Math.PI / 2) * 0.3);
      ctx.beginPath();
      ctx.moveTo(0, 40);
      ctx.lineTo(0, -64);
      ctx.stroke();
      ctx.fillStyle = accent;
      ctx.beginPath();
      ctx.arc(0, -70, 8, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      break;
    }
    case "shield": {
      ctx.fillStyle = accent;
      ctx.beginPath();
      ctx.ellipse(8, 0, 14, 30, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      break;
    }
    case "bow": {
      ctx.rotate(fore);
      ctx.beginPath();
      ctx.arc(-6, 0, 34, -1.1, 1.1);
      ctx.stroke();
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(-6 + 34 * Math.cos(-1.1), 34 * Math.sin(-1.1));
      ctx.lineTo(-6 + 34 * Math.cos(1.1), 34 * Math.sin(1.1));
      ctx.stroke();
      break;
    }
    default: {
      // Nothing: taped fists.
      ctx.fillStyle = accent;
      ctx.beginPath();
      ctx.arc(0, 0, 8, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
      ctx.save();
      ctx.translate(j.handB.x, j.handB.y);
      ctx.fillStyle = accent;
      ctx.strokeStyle = ink;
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(0, 0, 7, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
  }
  ctx.restore();
}
