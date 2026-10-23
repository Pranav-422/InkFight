// Clean stick-figure body for every fighter: a fixed skeleton posed by poses.ts and
// drawn as round-capped strokes. The head is the player's own drawing, and the
// class item sits in the front hand. Replaces bending the photo itself, which
// tore apart on most real drawings.

import { BONES, type BoneName, type Joints, type Vec } from "./skeleton";

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

// Forward kinematics: local rotations (from resolvePose) → joint positions.
export function solveStick(local: Record<BoneName, number>): StickPose {
  const joints = { ...REST_JOINTS };
  const world = {} as Record<BoneName, number>;
  const acc = {} as Record<BoneName, number>;
  for (const b of BONES) {
    acc[b.name] = (b.parent ? acc[b.parent] : 0) + (local[b.name] ?? 0);
    world[b.name] = REST[b.name] + acc[b.name];
    const from = joints[b.from];
    joints[b.to] = { x: from.x + Math.cos(world[b.name]) * LEN[b.name], y: from.y + Math.sin(world[b.name]) * LEN[b.name] };
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
  o: { ink: string; head: HTMLCanvasElement | null; cls: string; accent: string },
) {
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.strokeStyle = o.ink;
  ctx.lineWidth = 7;
  // Far limbs first, then torso, then near limbs: reads as depth.
  const limb = ([a, b, c]: (typeof LIMBS)[number]) => {
    ctx.beginPath();
    ctx.moveTo(j[a].x, j[a].y);
    ctx.lineTo(j[b].x, j[b].y);
    ctx.lineTo(j[c].x, j[c].y);
    ctx.stroke();
  };
  limb(LIMBS[0]);
  limb(LIMBS[1]);
  ctx.beginPath();
  ctx.moveTo(j.hip.x, j.hip.y);
  ctx.lineTo(j.shoulder.x, j.shoulder.y);
  ctx.stroke();
  limb(LIMBS[2]);

  // Head: the player's drawing, turned with the neck. A plain circle until it loads.
  const tilt = world.head - REST.head;
  ctx.save();
  ctx.translate(j.head.x, j.head.y);
  ctx.rotate(tilt);
  if (o.head) {
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
  ctx.restore();

  drawItem(ctx, o.cls, j, world.foreF, o.ink, o.accent);
  limb(LIMBS[3]);
}

// The class item, held in the front hand and aligned with the forearm.
function drawItem(ctx: CanvasRenderingContext2D, cls: string, j: Joints, fore: number, ink: string, accent: string) {
  const h = j.handF;
  ctx.save();
  ctx.translate(h.x, h.y);
  ctx.strokeStyle = ink;
  ctx.fillStyle = "#fff";
  ctx.lineWidth = 4;
  switch (cls) {
    case "Warrior": {
      // Blade continues past the fist, crossguard across it.
      ctx.rotate(fore - Math.PI / 2.6);
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(0, 6);
      ctx.lineTo(0, -62);
      ctx.stroke();
      ctx.strokeStyle = accent;
      ctx.beginPath();
      ctx.moveTo(-10, -4);
      ctx.lineTo(10, -4);
      ctx.stroke();
      break;
    }
    case "Mage": {
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
    case "Caster": {
      // Staff stays upright, gem on top.
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
    case "Tank": {
      ctx.fillStyle = accent;
      ctx.beginPath();
      ctx.ellipse(8, 0, 14, 30, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      break;
    }
    case "Ranger": {
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
      // Brawler: taped fists.
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
