// The five constellations of Arena 1's opening ceremony, drawn procedurally: a handful of stars joined by thin lines, each in its own
// colour. Each is drawn once, at full brightness, to a small offscreen canvas (glow included) and then stamped into the sky with an
// alpha and a scale, so a whole sky of them costs a few drawImage calls a frame. Used by arenaRender.ts (the sky, the pop-up).

import type { ConstellationId } from "./protocol";

type Pt = [number, number];
// pts and lines are in a unit box (0..1, y down); `big` lists the stars drawn as bright four-point sparkles.
type Art = { color: string; pts: Pt[]; lines: [number, number][]; big: number[] };

export const STAR_ART: Record<ConstellationId, Art> = {
  // A bird with its wings thrown wide and a long tail.
  phoenix: {
    color: "#ff9a4a",
    pts: [[0.5, 0.12], [0.5, 0.3], [0.5, 0.52], [0.4, 0.78], [0.5, 0.94], [0.6, 0.78], [0.3, 0.3], [0.1, 0.16], [0.1, 0.46], [0.7, 0.3], [0.9, 0.16], [0.9, 0.46]],
    lines: [[0, 1], [1, 2], [2, 3], [2, 4], [2, 5], [1, 6], [6, 7], [6, 8], [1, 9], [9, 10], [9, 11]],
    big: [0, 7, 10, 4],
  },
  // Long ears, a curved back, a tail like a button.
  hare: {
    color: "#ffeab0",
    pts: [[0.36, 0.04], [0.42, 0.3], [0.58, 0.08], [0.52, 0.3], [0.46, 0.4], [0.7, 0.52], [0.86, 0.7], [0.94, 0.6], [0.34, 0.82], [0.8, 0.92], [0.56, 0.76]],
    lines: [[0, 1], [1, 4], [2, 3], [3, 4], [4, 5], [5, 6], [6, 7], [6, 9], [4, 8], [5, 10], [10, 8], [10, 9]],
    big: [0, 2, 7],
  },
  // A hexagonal shell, a head, four feet.
  tortoise: {
    color: "#84e8ad",
    pts: [[0.28, 0.36], [0.5, 0.2], [0.72, 0.36], [0.72, 0.62], [0.5, 0.76], [0.28, 0.62], [0.5, 0.48], [0.93, 0.46], [0.3, 0.9], [0.7, 0.9], [0.06, 0.62]],
    lines: [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 0], [6, 0], [6, 2], [6, 4], [3, 7], [2, 7], [5, 8], [4, 9], [0, 10]],
    big: [6, 7],
  },
  // An S that ends in a head.
  serpent: {
    color: "#b99bff",
    pts: [[0.86, 0.1], [0.66, 0.2], [0.42, 0.26], [0.2, 0.4], [0.3, 0.56], [0.56, 0.64], [0.78, 0.76], [0.62, 0.92], [0.94, 0.04]],
    lines: [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 6], [6, 7], [0, 8]],
    big: [0, 3, 7],
  },
  // One bright head and a tail streaming away from it.
  comet: {
    color: "#82cfff",
    pts: [[0.82, 0.22], [0.64, 0.38], [0.5, 0.54], [0.36, 0.66], [0.22, 0.8], [0.1, 0.92], [0.7, 0.14], [0.9, 0.34], [0.56, 0.3], [0.42, 0.46]],
    lines: [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [0, 6], [0, 7], [1, 8], [2, 9]],
    big: [0, 5],
  },
};

const sprites = new Map<string, HTMLCanvasElement>();

// The constellation at full brightness on a transparent square of `px` pixels.
function sprite(id: ConstellationId, px: number): HTMLCanvasElement {
  const key = `${id}:${px}`;
  const hit = sprites.get(key);
  if (hit) return hit;
  const art = STAR_ART[id];
  const c = document.createElement("canvas");
  c.width = c.height = px;
  const g = c.getContext("2d")!;
  const pad = px * 0.1, box = px - pad * 2;
  const at = ([x, y]: Pt): Pt => [pad + x * box, pad + y * box];
  g.lineCap = "round";
  // The lines: a soft wide stroke under a thin bright one.
  for (const [w, alpha] of [[px * 0.022, 0.18], [px * 0.007, 0.8]] as const) {
    g.strokeStyle = art.color;
    g.globalAlpha = alpha;
    g.lineWidth = w;
    g.beginPath();
    for (const [i, j] of art.lines) {
      const [x0, y0] = at(art.pts[i]), [x1, y1] = at(art.pts[j]);
      g.moveTo(x0, y0);
      g.lineTo(x1, y1);
    }
    g.stroke();
  }
  g.globalAlpha = 1;
  art.pts.forEach((p, i) => {
    const [x, y] = at(p);
    const big = art.big.includes(i);
    const r = px * (big ? 0.055 : 0.032);
    const glow = g.createRadialGradient(x, y, 0, x, y, r * 3.4);
    glow.addColorStop(0, art.color);
    glow.addColorStop(0.35, `${art.color}88`);
    glow.addColorStop(1, `${art.color}00`);
    g.fillStyle = glow;
    g.fillRect(x - r * 3.4, y - r * 3.4, r * 6.8, r * 6.8);
    if (big) {
      // A four-point sparkle.
      g.fillStyle = "#ffffff";
      g.beginPath();
      for (let k = 0; k < 8; k++) {
        const a = (k * Math.PI) / 4, rr = k % 2 ? r * 0.55 : r * 1.7;
        g[k ? "lineTo" : "moveTo"](x + Math.cos(a) * rr, y + Math.sin(a) * rr);
      }
      g.closePath();
      g.fill();
    }
    g.fillStyle = "#ffffff";
    g.beginPath();
    g.arc(x, y, r * 0.55, 0, Math.PI * 2);
    g.fill();
  });
  sprites.set(key, c);
  return c;
}

export const starColor = (id: ConstellationId) => STAR_ART[id].color;

// Stamp a constellation centred on (cx, cy), `size` world units wide, at `alpha`.
export function drawStar(ctx: CanvasRenderingContext2D, id: ConstellationId, cx: number, cy: number, size: number, alpha: number) {
  if (alpha <= 0.01) return;
  const s = sprite(id, 256);
  ctx.save();
  ctx.globalAlpha *= Math.min(1, alpha);
  ctx.globalCompositeOperation = "lighter"; // light in the sky: it adds to what is behind it
  ctx.drawImage(s, cx - size / 2, cy - size / 2, size, size);
  ctx.restore();
}
