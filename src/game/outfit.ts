// A dungeon boss's outfit, drawn on its stickman from the pieces in its BossLook (src/game/bossLook.ts): trunks, a coat, a haori, a sash, gloves,
// sleeves, spare swords. Everything is computed from the skeleton's joints, so it moves with the pose; the cloth sways with the clock.
// Drawn in the layers drawStick (stickman.ts) asks for: "back" behind the whole body, "mid" over the legs and torso, "front" over the near arm.

import type { Piece } from "./bossLook";
import type { Joints, Vec } from "./skeleton";

export type OutfitLayer = "back" | "mid" | "front";
export type OutfitCtx = { ink: string; pen: number; now: number; world: { torso: number }; sB: Vec; sF: Vec };

const LAYER: Record<Piece["t"], OutfitLayer> = {
  cloth: "back",
  orbs: "back",
  scabbards: "mid",
  shorts: "mid",
  shins: "mid",
  coat: "mid",
  sash: "mid",
  sleeves: "front",
  armband: "front",
  wraps: "front",
  gloves: "front",
  tattoo: "front",
};

// The torso's own axes: `at(a, b)` is a point a px forward and b px up from the hip (b = 54 is the shoulders).
function axes(j: Joints) {
  const dx = j.shoulder.x - j.hip.x, dy = j.shoulder.y - j.hip.y;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len, uy = dy / len; // up
  const fx = -uy, fy = ux; // forward
  return (a: number, b: number): Vec => ({ x: j.hip.x + fx * a + ux * b, y: j.hip.y + fy * a + uy * b });
}

const lerp = (a: Vec, b: Vec, t: number): Vec => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
function stroke(ctx: CanvasRenderingContext2D, pts: Vec[], color: string, width: number) {
  ctx.beginPath();
  pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.stroke();
}
function shape(ctx: CanvasRenderingContext2D, pts: Vec[], fill: string, line: string, width: number) {
  ctx.beginPath();
  pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  if (width > 0) {
    ctx.strokeStyle = line;
    ctx.lineWidth = width;
    ctx.stroke();
  }
}

export function drawOutfit(ctx: CanvasRenderingContext2D, pieces: Piece[], layer: OutfitLayer, j: Joints, o: OutfitCtx) {
  const mine = pieces.filter((p) => LAYER[p.t] === layer);
  if (!mine.length) return;
  const at = axes(j);
  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  for (const p of mine) {
    switch (p.t) {
      case "cloth": {
        // A haori or a cape hanging from the shoulders behind the back, swaying, with a zigzag hem when it has a lining.
        const L = 68 * (p.len ?? 0.6), sway = Math.sin(o.now / 340) * 5 + Math.sin(o.now / 170) * 2;
        const pts = [at(-3, 55), at(6, 52), at(-2 + sway * 0.2, 8), at(-6 + sway * 0.5, -L * 0.55), at(-14 + sway, -L)];
        for (let k = 1; k <= 4; k++) pts.push(at(-14 - k * 5 + sway * (1 - k * 0.1), -L + (k % 2 ? 8 : -2)));
        pts.push(at(-30 + sway, 30), at(-16, 52));
        shape(ctx, pts, p.color, o.ink, 3);
        if (p.lining) {
          // The lining shows along the hem as a band.
          stroke(ctx, [at(-14 + sway, -L + 3), at(-34 + sway * 0.9, -L + 5)], p.lining, 6);
          stroke(ctx, [at(-30 + sway, 30), at(-30 + sway * 0.8, 0), at(-14 + sway, -L + 6)], p.lining, 3);
        }
        break;
      }
      case "orbs": {
        ctx.lineWidth = 3;
        ctx.strokeStyle = o.ink;
        for (let i = 0; i < p.colors.length; i++) {
          const a = o.now / 700 + (i * Math.PI * 2) / p.colors.length;
          const x = j.shoulder.x - 14 + Math.cos(a) * 44, y = j.shoulder.y - 8 + Math.sin(a) * 16 + Math.sin(o.now / 430 + i * 2) * 3;
          ctx.save();
          ctx.shadowColor = p.colors[i];
          ctx.shadowBlur = 10;
          ctx.fillStyle = p.colors[i];
          ctx.beginPath();
          ctx.arc(x, y, 7, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
          ctx.beginPath();
          ctx.arc(x, y, 7, 0, Math.PI * 2);
          ctx.stroke();
          ctx.fillStyle = "#fff";
          ctx.beginPath();
          ctx.arc(x - 2, y - 2, 2.2, 0, Math.PI * 2);
          ctx.fill();
        }
        break;
      }
      case "scabbards": {
        // Swords at the back hip on a belt, one hilt showing each.
        for (let k = 0; k < p.n; k++) {
          const top = at(-5 - k * 2, 2 + k * 2), tip = at(-21 - k * 7, 31 - k * 8);
          stroke(ctx, [top, tip], o.ink, 8);
          stroke(ctx, [top, tip], p.color, 5);
          const hilt = at(-2 - k * 2, 8 + k * 2);
          stroke(ctx, [hilt, top], "#d9d2c0", 4);
        }
        break;
      }
      case "shorts": {
        for (const [from, to] of [[j.hip, j.kneeB], [j.hip, j.kneeF]] as const) {
          const end = lerp(from, to, 0.74);
          stroke(ctx, [from, end], o.ink, 22);
          stroke(ctx, [from, end], p.color, 16);
          if (p.stripe) {
            const dx = end.x - from.x, dy = end.y - from.y, l = Math.hypot(dx, dy) || 1;
            stroke(ctx, [{ x: end.x - (dy / l) * 8, y: end.y + (dx / l) * 8 }, { x: end.x + (dy / l) * 8, y: end.y - (dx / l) * 8 }], p.stripe, 4);
          }
        }
        // The waistband.
        stroke(ctx, [at(-8, 3), at(8, 3)], p.stripe ?? o.ink, 4);
        break;
      }
      case "shins": {
        for (const [knee, foot] of [[j.kneeB, j.footB], [j.kneeF, j.footF]] as const) {
          const dx = foot.x - knee.x, dy = foot.y - knee.y, l = Math.hypot(dx, dy) || 1, nx = -dy / l, ny = dx / l;
          for (const t of [0.4, 0.58, 0.76]) {
            const c = lerp(knee, foot, t);
            stroke(ctx, [{ x: c.x - nx * 8, y: c.y - ny * 8 }, { x: c.x + nx * 8, y: c.y + ny * 8 }], p.color, 4.5);
          }
        }
        break;
      }
      case "coat": {
        // From the shoulders down past the hip, a little wider at the hem; open at the front it shows the chest (or its lining).
        const L = 68 * (p.len ?? 0.3), sway = Math.sin(o.now / 300) * 2.5 * (p.len ?? 0.3) * 2;
        const wTop = 11, wHem = 17 + (p.len ?? 0.3) * 6;
        const pts: Vec[] = [at(-wTop, 53), at(wTop, 53), at(wHem + 2, -L * 0.2)];
        if (p.hem === "zig") for (let k = 0; k < 5; k++) pts.push(at(wHem - k * ((wHem * 2) / 4), -L + (k % 2 ? 7 : -2)));
        else pts.push(at(wHem + sway, -L), at(-wHem + sway, -L));
        pts.push(at(-wHem - 2, -L * 0.2));
        shape(ctx, pts, p.color, o.ink, 3);
        if (p.open) {
          const inner = [at(-1, 54), at(10, 54), at(6, -L * 0.85), at(-2, -L * 0.85)];
          shape(ctx, inner, p.lining ?? "#fff9ed", o.ink, 2.5);
        }
        if (p.trim) {
          stroke(ctx, [at(10, 54), at(7, -L * 0.2), at(wHem + sway, -L + 1)], p.trim, 3);
          stroke(ctx, [at(-wHem + sway, -L + 1), at(wHem + sway, -L + 1)], p.trim, 3);
        }
        if (p.collar) {
          shape(ctx, [at(-10, 53), at(-14, 70), at(2, 68), at(11, 53)], p.color, o.ink, 3);
          if (p.trim) stroke(ctx, [at(-13, 69), at(2, 67)], p.trim, 2.5);
        }
        break;
      }
      case "sash": {
        const a = at(-9, 5), b = at(9, 5), sway = Math.sin(o.now / 200) * 3;
        stroke(ctx, [a, b], o.ink, 11);
        stroke(ctx, [a, b], p.color, 7);
        if (p.tails) {
          // Two short tails from the knot, flying back.
          const k = at(8, 5);
          for (const [dx, dy] of [[-15, -8], [-9, -14]]) {
            const t = at(dx + sway, dy + 5);
            ctx.beginPath();
            ctx.moveTo(k.x, k.y);
            ctx.quadraticCurveTo((k.x + t.x) / 2, (k.y + t.y) / 2 - 3, t.x, t.y);
            ctx.strokeStyle = o.ink;
            ctx.lineWidth = 6;
            ctx.stroke();
            ctx.strokeStyle = p.color;
            ctx.lineWidth = 3.5;
            ctx.stroke();
          }
        }
        break;
      }
      case "sleeves": {
        for (const [s, e] of [[o.sB, j.elbowB], [o.sF, j.elbowF]] as const) {
          const end = lerp(s, e, 0.82);
          stroke(ctx, [s, end], o.ink, o.pen + 9);
          stroke(ctx, [s, end], p.color, o.pen + 4);
        }
        break;
      }
      case "armband": {
        const c = lerp(o.sF, j.elbowF, 0.62), dx = j.elbowF.x - o.sF.x, dy = j.elbowF.y - o.sF.y, l = Math.hypot(dx, dy) || 1;
        const nx = -dy / l, ny = dx / l, w = o.pen / 2 + 4;
        stroke(ctx, [{ x: c.x - nx * w, y: c.y - ny * w }, { x: c.x + nx * w, y: c.y + ny * w }], o.ink, 9);
        stroke(ctx, [{ x: c.x - nx * w, y: c.y - ny * w }, { x: c.x + nx * w, y: c.y + ny * w }], p.color, 6);
        break;
      }
      case "wraps": {
        for (const [e, h] of [[j.elbowB, j.handB], [j.elbowF, j.handF]] as const) {
          const l = Math.hypot(h.x - e.x, h.y - e.y) || 1, dx = (h.x - e.x) / l, dy = (h.y - e.y) / l;
          for (let k = 0; k < 3; k++) {
            const px = h.x - dx * (3 + k * 4.5), py = h.y - dy * (3 + k * 4.5);
            stroke(ctx, [{ x: px - dy * 6.5, y: py + dx * 6.5 }, { x: px + dy * 6.5, y: py - dx * 6.5 }], p.color, 3.5);
          }
        }
        break;
      }
      case "gloves": {
        for (const [e, h] of [[j.elbowB, j.handB], [j.elbowF, j.handF]] as const) {
          const l = Math.hypot(h.x - e.x, h.y - e.y) || 1, dx = (h.x - e.x) / l, dy = (h.y - e.y) / l;
          if (p.cuff) stroke(ctx, [{ x: h.x - dx * 15, y: h.y - dy * 15 }, { x: h.x - dx * 8, y: h.y - dy * 8 }], p.cuff, 12);
          ctx.beginPath();
          ctx.arc(h.x + dx * 3, h.y + dy * 3, 12, 0, Math.PI * 2);
          ctx.fillStyle = p.color;
          ctx.fill();
          ctx.strokeStyle = o.ink;
          ctx.lineWidth = 3.5;
          ctx.stroke();
          ctx.beginPath();
          ctx.arc(h.x + dx * 7, h.y + dy * 7 - 4, 3.2, 0, Math.PI * 2);
          ctx.fillStyle = "rgba(255,255,255,.55)";
          ctx.fill();
        }
        break;
      }
      case "tattoo": {
        // Lines round the near arm: three across the upper arm, two across the forearm.
        for (const [a, b, t] of [[o.sF, j.elbowF, 0.3], [o.sF, j.elbowF, 0.5], [o.sF, j.elbowF, 0.7], [j.elbowF, j.handF, 0.3], [j.elbowF, j.handF, 0.6]] as const) {
          const c = lerp(a, b, t), dx = b.x - a.x, dy = b.y - a.y, l = Math.hypot(dx, dy) || 1, nx = -dy / l, ny = dx / l;
          stroke(ctx, [{ x: c.x - nx * 6, y: c.y - ny * 6 }, { x: c.x + nx * 6, y: c.y + ny * 6 }], p.color, 2.6);
        }
        break;
      }
    }
  }
  ctx.restore();
}
