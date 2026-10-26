// The look of Arena 1's on-canvas interface, after docs/design/arena-1/ui-reference.png (a fighting game's select screen) in the colours of the
// Versus panel (src/components/Versus.tsx): black plates with a thin white outline, cut on the slant; a gold name plate with heavy black type;
// a red P1 and a blue P2 tag; small caps over big heavy type; a faint brush texture; a gold line where a black plate meets the picture.
// Primitives only (the HUD, the constellation pop-up, the banners and the ring use them): nothing in here knows about a match.

export const UI = {
  black: "#0a0a0c",
  ink: "#0f0d12",
  charcoal: "#17171a",
  paper: "#fff9ed",
  gold: "#f2b705",
  p1: "#e5482d", // the red of P1's tag, bar wash and cursor
  p2: "#2f5be0", // the blue of P2's
  p1Text: "#ff7a5c", // the same two, light enough to read as type on black
  p2Text: "#7c9bff",
  muted: "rgba(255,255,255,.64)",
};
export const P_COLOR = [UI.p1, UI.p2] as const;
export const P_TEXT = [UI.p1Text, UI.p2Text] as const;

export type Pt = [number, number];

export function path(ctx: CanvasRenderingContext2D, pts: Pt[]) {
  ctx.beginPath();
  pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  ctx.closePath();
}

// A four-cornered plate at (x, y), w x h, each top / bottom corner moved inwards by the given px: `[tl, tr, br, bl]` is how far the top-left
// corner is pushed right, the top-right pushed left, the bottom-right pushed left, the bottom-left pushed right. [0, 8, 0, 0] is a plate whose
// right edge leans in at the top (the gold name plates under the select screen's fighters); [8, 0, 0, 0] is its mirror.
export function slab(x: number, y: number, w: number, h: number, [tl, tr, br, bl]: [number, number, number, number]): Pt[] {
  return [[x + tl, y], [x + w - tr, y], [x + w - br, y + h], [x + bl, y + h]];
}

// A filled plate with an outline, and an optional hard shadow offset down and right (the VS badge's).
export function plate(ctx: CanvasRenderingContext2D, pts: Pt[], fill: string, line?: string, lw = 2, shadow = 0) {
  ctx.lineJoin = "miter";
  ctx.miterLimit = 3;
  if (shadow) {
    ctx.save();
    ctx.translate(shadow, shadow);
    path(ctx, pts);
    ctx.fillStyle = "rgba(0,0,0,.55)";
    ctx.fill();
    ctx.restore();
  }
  path(ctx, pts);
  ctx.fillStyle = fill;
  ctx.fill();
  if (line) {
    ctx.strokeStyle = line;
    ctx.lineWidth = lw;
    ctx.stroke();
  }
}

// The select screen's dark ground: slashes of lighter ink, drawn inside whatever the current clip is, over the box (x, y, w, h).
export function brush(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, alpha = 0.05) {
  ctx.save();
  ctx.strokeStyle = `rgba(255,255,255,${alpha})`;
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (let sx = x - h; sx < x + w; sx += 22) {
    ctx.moveTo(sx, y + h);
    ctx.lineTo(sx + h * 0.47, y);
  }
  ctx.stroke();
  ctx.restore();
}

// Set `font` to the largest size (down from `size`) at which `text` fits `maxW`; returns the size used.
export function fit(ctx: CanvasRenderingContext2D, text: string, maxW: number, size: number, weight: number, family: string, min = 8): number {
  let s = size;
  ctx.font = `${weight} ${s}px ${family}`;
  while (s > min && ctx.measureText(text).width > maxW) ctx.font = `${weight} ${(s -= 0.5)}px ${family}`;
  return s;
}

// The red P1 / blue P2 tag: a skewed box with white letters (or `text` on a `fill` of your own, e.g. ink on gold). `x, y` is the top-left of the box.
export function tag(ctx: CanvasRenderingContext2D, slot: 0 | 1, x: number, y: number, w: number, h: number, family: string, label = `P${slot + 1}`, fill: string = P_COLOR[slot], text = "#fff") {
  const k = h * 0.28;
  plate(ctx, slab(x, y, w, h, [k, 0, k, 0]), fill, UI.ink, 1.5);
  ctx.fillStyle = text;
  ctx.font = `800 ${Math.round(h * 0.62)}px ${family}`;
  ctx.textAlign = "center";
  ctx.fillText(label, x + w / 2 + k * 0.15, y + h * 0.72);
}

// A slanted bar: a black track with a white outline and a fill clipped to it. `fromRight`: the fill hangs from the right end. `trail` is a paler
// stretch past the fill (health that was just lost), `ticks` the notches that cut the fill into quarters. `lean` is how far the ends slant: positive
// leans like a "/" (P1's bars), negative like a "\" (P2's, the mirror image).
export function bar(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, pct: number, color: string, opts: { fromRight?: boolean; trail?: number; trailColor?: string; ticks?: boolean; lean?: number } = {}) {
  const lean = opts.lean ?? h * 0.5;
  const track = lean >= 0 ? slab(x, y, w, h, [lean, 0, lean, 0]) : slab(x, y, w, h, [0, -lean, 0, -lean]);
  plate(ctx, track, UI.black, "rgba(255,255,255,.85)", 1.5);
  ctx.save();
  path(ctx, track);
  ctx.clip();
  const span = (p: number) => Math.max(0, Math.min(1, p)) * w;
  const at = (p: number) => (opts.fromRight ? x + w - span(p) : x);
  if (opts.trail !== undefined && opts.trail > pct) {
    ctx.fillStyle = opts.trailColor ?? "rgba(255,255,255,.55)";
    ctx.fillRect(at(opts.trail), y, span(opts.trail), h);
  }
  if (pct > 0) {
    ctx.fillStyle = color;
    ctx.fillRect(at(pct), y, span(pct), h);
    // A light stripe along the top of the fill, so it reads as a bar and not a flat block.
    ctx.fillStyle = "rgba(255,255,255,.28)";
    ctx.fillRect(at(pct), y, span(pct), Math.max(1, h * 0.3));
  }
  if (opts.ticks) {
    ctx.fillStyle = "rgba(0,0,0,.55)";
    for (const q of [0.25, 0.5, 0.75]) ctx.fillRect(x + w * q - 1, y, 2, h);
  }
  ctx.restore();
  path(ctx, track);
  ctx.strokeStyle = "rgba(255,255,255,.85)";
  ctx.lineWidth = 1.5;
  ctx.stroke();
}
