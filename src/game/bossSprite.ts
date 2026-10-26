// A dungeon boss's sprite, built in the browser from its look data (src/game/bossLook.ts): the head is drawn from SVG path layers on a canvas, so hair,
// a hat or a blindfold can leave the head circle, and nothing goes through a PNG, a fetch or the figure finder that reads scanned drawings.

import { HEAD_BOX, HEAD_DY, HEAD_FACE, type BossLook } from "./bossLook";
import type { Sprite } from "./sprite";
import { HEAD_R } from "./stickman";

const made = new Map<number, Sprite>();

export function bossSprite(look: BossLook): Sprite {
  let s = made.get(look.floor);
  if (s) return s;
  const c = document.createElement("canvas");
  c.width = c.height = HEAD_BOX;
  const g = c.getContext("2d")!;
  g.translate(0, HEAD_DY);
  g.lineCap = "round";
  g.lineJoin = "round";
  for (const l of look.head) {
    const path = new Path2D(l.d);
    if (l.fill) {
      g.fillStyle = l.fill;
      g.fill(path);
    }
    if (l.stroke) {
      g.strokeStyle = l.stroke;
      g.lineWidth = l.sw ?? 8;
      g.stroke(path);
    }
  }
  s = { head: c, ink: look.palette.ink, prop: null, width: 7, headScale: (HEAD_R * 1.15) / HEAD_FACE.r, headCenter: { x: HEAD_FACE.x, y: HEAD_FACE.y }, look };
  made.set(look.floor, s);
  return s;
}
