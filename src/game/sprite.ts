// Turns a photo of a drawing into what the fighter wears in the arena: paper →
// transparent, the figure found, and its head cut out (the body is drawn as a
// clean stickman, see stickman.ts). Runs in the browser.

import { estimateJoints, jointsFromVision, type Joints, type Vec } from "./skeleton";

// What a fighter wears from its drawing. head: the drawn head, cut out as a circle.
// ink: average ink colour. prop: the item drawn in its hand (the stickman holds it).
// width: the drawing's pen width, in arena units.
export type Prop = { img: HTMLCanvasElement; hx: number; hy: number; scale: number; rest: number };
export type Sprite = { head: HTMLCanvasElement | null; ink: string | null; prop: Prop | null; width: number };

// Loading a drawing is a few ms of pixel work; the gallery, pickers and the arena share it.
const cache = new Map<string, Promise<Sprite>>();
export function loadSpriteCached(url: string, poseJson?: string | null, rotation = 0): Promise<Sprite> {
  const key = `${url}|${rotation}|${poseJson ?? ""}`;
  let p = cache.get(key);
  if (!p) {
    p = loadSprite(url, poseJson, rotation);
    p.catch(() => cache.delete(key));
    cache.set(key, p);
  }
  return p;
}

const MAX_SIDE = 512;

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous"; // Vercel Blob images: needed to read pixels from the canvas
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Couldn't load ${url}`));
    img.src = url;
  });
}

// Ink alpha (0-255) per pixel for a phone photo of a drawing:
// 1. compare each pixel to the *local* paper brightness (handles shadows and grey paper),
// 2. ignore dark regions that aren't paper at all (table, floor),
// 3. keep only the figure: the biggest blob of ink off the photo's edges, plus anything close to it.
function inkAlpha(px: Uint8ClampedArray, w: number, h: number, isolateFigure = true): Uint8ClampedArray {
  const n = w * h;
  const lum = new Uint8Array(n);
  const hist = new Uint32Array(256);
  for (let i = 0, p = 0; p < n; i += 4, p++) {
    const l = (px[i] * 0.299 + px[i + 1] * 0.587 + px[i + 2] * 0.114) | 0;
    lum[p] = l;
    hist[l]++;
  }
  // Global paper level = 85th percentile.
  let paper = 255;
  for (let acc = 0, l = 255; l >= 0; l--) {
    acc += hist[l];
    if (acc >= n * 0.15) {
      paper = l;
      break;
    }
  }

  // Local background: brightest pixel per block, spread to neighbours, bilinear upsample.
  const B = Math.max(8, Math.round(Math.max(w, h) / 14));
  const gw = Math.ceil(w / B), gh = Math.ceil(h / B);
  const blockMax = new Float32Array(gw * gh);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const g = ((y / B) | 0) * gw + ((x / B) | 0);
    if (lum[y * w + x] > blockMax[g]) blockMax[g] = lum[y * w + x];
  }
  const bgGrid = new Float32Array(gw * gh);
  for (let gy = 0; gy < gh; gy++) for (let gx = 0; gx < gw; gx++) {
    let m = 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const yy = gy + dy, xx = gx + dx;
      if (yy >= 0 && yy < gh && xx >= 0 && xx < gw) m = Math.max(m, blockMax[yy * gw + xx]);
    }
    bgGrid[gy * gw + gx] = m;
  }
  const bgAt = (x: number, y: number) => {
    const fx = Math.min(gw - 1, Math.max(0, x / B - 0.5)), fy = Math.min(gh - 1, Math.max(0, y / B - 0.5));
    const x0 = fx | 0, y0 = fy | 0, x1 = Math.min(gw - 1, x0 + 1), y1 = Math.min(gh - 1, y0 + 1);
    const tx = fx - x0, ty = fy - y0;
    const top = bgGrid[y0 * gw + x0] * (1 - tx) + bgGrid[y0 * gw + x1] * tx;
    const bot = bgGrid[y1 * gw + x0] * (1 - tx) + bgGrid[y1 * gw + x1] * tx;
    return top * (1 - ty) + bot * ty;
  };

  const alpha = new Uint8ClampedArray(n);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const p = y * w + x;
    const bg = bgAt(x, y);
    if (bg < paper * 0.62) continue; // not paper (table, shadowy edge)
    const a = (bg - lum[p] - 26) / 46;
    if (a > 0) alpha[p] = Math.round(Math.min(1, a) * 255);
  }

  if (!isolateFigure) return alpha;

  // Connected blobs (8-neighbour, with a 2px bridge so broken pen strokes stay together).
  const label = new Int32Array(n).fill(-1);
  const blobs: { size: number; x0: number; y0: number; x1: number; y1: number; edge: boolean }[] = [];
  const stack: number[] = [];
  for (let start = 0; start < n; start++) {
    if (alpha[start] < 70 || label[start] !== -1) continue;
    const id = blobs.length;
    const blob = { size: 0, x0: w, y0: h, x1: 0, y1: 0, edge: false };
    label[start] = id;
    stack.push(start);
    while (stack.length) {
      const p = stack.pop()!;
      const x = p % w, y = (p / w) | 0;
      blob.size++;
      if (x < blob.x0) blob.x0 = x;
      if (x > blob.x1) blob.x1 = x;
      if (y < blob.y0) blob.y0 = y;
      if (y > blob.y1) blob.y1 = y;
      if (x <= 1 || y <= 1 || x >= w - 2 || y >= h - 2) blob.edge = true;
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
        const xx = x + dx, yy = y + dy;
        if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
        const q = yy * w + xx;
        if (alpha[q] >= 70 && label[q] === -1) {
          label[q] = id;
          stack.push(q);
        }
      }
    }
    blobs.push(blob);
  }
  if (!blobs.length) return alpha;
  const inner = blobs.filter((b) => !b.edge);
  const main = (inner.length ? inner : blobs).reduce((a, b) => (b.size > a.size ? b : a));
  const mw = main.x1 - main.x0, mh = main.y1 - main.y0;
  const near = (b: (typeof blobs)[number]) =>
    b.x1 >= main.x0 - mw * 0.25 && b.x0 <= main.x1 + mw * 0.25 && b.y1 >= main.y0 - mh * 0.25 && b.y0 <= main.y1 + mh * 0.25;
  const keep = blobs.map((b) => b === main || (!b.edge && b.size >= main.size * 0.01 && near(b)));
  for (let p = 0; p < n; p++) {
    const l = label[p];
    // Faint anti-aliased pixels (unlabelled) survive only right next to a kept stroke.
    if (l === -1 ? !(alpha[p] > 0 && hasKeptNeighbour(label, keep, p, w, h)) : !keep[l]) alpha[p] = 0;
  }
  return alpha;
}

function hasKeptNeighbour(label: Int32Array, keep: boolean[], p: number, w: number, h: number) {
  const x = p % w, y = (p / w) | 0;
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    const xx = x + dx, yy = y + dy;
    if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
    const l = label[yy * w + xx];
    if (l !== -1 && keep[l]) return true;
  }
  return false;
}

// Stand a sideways photo upright: returns the rotated image and how to map
// a point given as fractions of the *original* photo into it.
function rotated(src: HTMLImageElement, deg: number) {
  const r = ((Math.round(deg / 90) % 4) + 4) % 4;
  const W0 = src.width, H0 = src.height;
  if (r === 0) return { img: src as CanvasImageSource & { width: number; height: number }, map: (v: Vec) => ({ x: v.x * W0, y: v.y * H0 }) };
  const c = document.createElement("canvas");
  c.width = r % 2 ? H0 : W0;
  c.height = r % 2 ? W0 : H0;
  const g = c.getContext("2d")!;
  if (r === 1) g.translate(H0, 0);
  if (r === 2) g.translate(W0, H0);
  if (r === 3) g.translate(0, W0);
  g.rotate((r * Math.PI) / 2);
  g.drawImage(src, 0, 0);
  const map = (v: Vec) => {
    const px = v.x * W0, py = v.y * H0;
    return r === 1 ? { x: H0 - py, y: px } : r === 2 ? { x: W0 - px, y: H0 - py } : { x: py, y: W0 - px };
  };
  return { img: c, map };
}

export async function loadSprite(url: string, poseJson?: string | null, rotation = 0): Promise<Sprite> {
  const { img, map: toRotated } = rotated(await loadImage(url), rotation);
  const scale = Math.min(1, MAX_SIDE / Math.max(img.width, img.height));
  const w = Math.max(1, Math.round(img.width * scale));
  const h = Math.max(1, Math.round(img.height * scale));
  const work = document.createElement("canvas");
  work.width = w;
  work.height = h;
  const ctx = work.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(img, 0, 0, w, h);
  const data = ctx.getImageData(0, 0, w, h);
  const px = data.data;

  // Pass 1 (small): find which ink is the figure and where it is.
  const alpha1 = inkAlpha(px, w, h);
  let minX = w, minY = h, maxX = -1, maxY = -1;
  for (let p = 0; p < alpha1.length; p++) {
    if (alpha1[p] < 64) continue;
    const x = p % w, y = (p / w) | 0;
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  if (maxX < 0) {
    // Nothing detected (blank or very low-contrast photo): use the whole image.
    minX = 0; minY = 0; maxX = w - 1; maxY = h - 1;
  }

  // Pass 2 (sharp): re-cut just the figure from the full-resolution photo, so a
  // small doodle in a big photo doesn't come out blurry.
  const pad = 3;
  const ox = Math.max(0, (minX - pad) / scale), oy = Math.max(0, (minY - pad) / scale);
  const ow = Math.min(img.width - ox, (maxX - minX + 1 + pad * 2) / scale), oh = Math.min(img.height - oy, (maxY - minY + 1 + pad * 2) / scale);
  const s2 = Math.min(1, MAX_SIDE / Math.max(ow, oh));
  const normal = document.createElement("canvas");
  normal.width = Math.max(1, Math.round(ow * s2));
  normal.height = Math.max(1, Math.round(oh * s2));
  const nctx = normal.getContext("2d", { willReadFrequently: true })!;
  nctx.drawImage(img, ox, oy, ow, oh, 0, 0, normal.width, normal.height);
  const d2 = nctx.getImageData(0, 0, normal.width, normal.height);
  const px2 = d2.data;
  const alpha2 = inkAlpha(px2, normal.width, normal.height, false);
  for (let y = 0; y < normal.height; y++) {
    for (let x = 0; x < normal.width; x++) {
      const p = y * normal.width + x, i = p * 4;
      // Keep only ink that pass 1 judged to be part of the figure (±2px).
      const x1 = Math.round((x / s2 + ox) * scale), y1 = Math.round((y / s2 + oy) * scale);
      let keep = false;
      for (let dy = -2; dy <= 2 && !keep; dy++) for (let dx = -2; dx <= 2; dx++) {
        const xx = x1 + dx, yy = y1 + dy;
        if (xx >= 0 && yy >= 0 && xx < w && yy < h && alpha1[yy * w + xx] > 0) { keep = true; break; }
      }
      const a = keep ? alpha2[p] : 0;
      px2[i + 3] = a;
      if (a > 64) {
        // Deepen faint ink a little so pencil lines read on screen.
        px2[i] = Math.round(px2[i] * 0.75);
        px2[i + 1] = Math.round(px2[i + 1] * 0.75);
        px2[i + 2] = Math.round(px2[i + 2] * 0.75);
      }
    }
  }
  nctx.putImageData(d2, 0, 0);

  // Joints: AI keypoints when we have them (fractions of the photo), else read off the ink.
  const W = normal.width, H = normal.height;
  let joints: Joints | null = null;
  if (poseJson) {
    try {
      joints = jointsFromVision(JSON.parse(poseJson), (v) => {
        const q = toRotated(v);
        return { x: (q.x - ox) * s2, y: (q.y - oy) * s2 };
      });
    } catch {}
  }
  joints ??= estimateJoints(px2, W, H);
  // The arena body is 180 units from head to feet; the cropped drawing is H pixels.
  const unit = 180 / H;
  const side = propSide((x, y) => px2[(y * W + x) * 4 + 3] >= 64, W, H, joints, H);
  return {
    head: cutHead(normal, joints),
    ink: inkColor(px2),
    prop: side ? cutProp(px2, W, H, side, unit) : null,
    width: Math.min(11, Math.max(4, (side?.stroke ?? strokeWidth((x, y) => px2[(y * W + x) * 4 + 3] >= 64, W, H, joints)) * unit * 1.1)),
  };
}

// Copy exactly the prop's pixels into their own canvas, anchored at the hand. A prop
// on the drawing's left is mirrored, since the stickman always holds it in front.
function cutProp(px: Uint8ClampedArray, W: number, H: number, s: PropSide, scale: number): Prop | null {
  let x0 = W, y0 = H, x1 = 0, y1 = 0;
  for (const p of s.pts) {
    x0 = Math.min(x0, p.x);
    y0 = Math.min(y0, p.y);
    x1 = Math.max(x1, p.x);
    y1 = Math.max(y1, p.y);
  }
  const w = x1 - x0 + 1, h = y1 - y0 + 1;
  if (w * h > W * H * 0.5) return null; // that's half the drawing: not a prop
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const g = c.getContext("2d")!;
  const out = g.createImageData(w, h);
  for (const p of s.pts) {
    const src = (p.y * W + p.x) * 4;
    const dx = s.left ? x1 - p.x : p.x - x0;
    const dst = ((p.y - y0) * w + dx) * 4;
    for (let k = 0; k < 4; k++) out.data[dst + k] = px[src + k];
  }
  g.putImageData(out, 0, 0);
  const hx = s.left ? x1 - s.hand.x : s.hand.x - x0, hy = s.hand.y - y0;
  const rest = Math.atan2(s.hand.y - s.elbow.y, (s.hand.x - s.elbow.x) * (s.left ? -1 : 1));
  return { img: c, hx, hy, scale, rest };
}

// The head as a circle around the head joint (head-to-shoulder is about two head radii),
// so a sword drawn next to it stays out.
function cutHead(src: HTMLCanvasElement, j: Joints): HTMLCanvasElement | null {
  const r = Math.min(src.width / 2, Math.max(8, Math.hypot(j.head.x - j.shoulder.x, j.head.y - j.shoulder.y) * 0.58));
  if (!Number.isFinite(r) || !Number.isFinite(j.head.x)) return null;
  const c = document.createElement("canvas");
  c.width = c.height = Math.max(8, Math.round(r * 2));
  const g = c.getContext("2d")!;
  g.beginPath();
  g.arc(c.width / 2, c.height / 2, c.width / 2, 0, Math.PI * 2);
  g.clip();
  g.drawImage(src, j.head.x - r, j.head.y - r, r * 2, r * 2, 0, 0, c.width, c.height);
  return c;
}

// Mean colour of solid ink, or null for faint/light ink (the renderer then uses black).
function inkColor(px: Uint8ClampedArray): string | null {
  let r = 0, g = 0, b = 0, n = 0;
  for (let i = 0; i < px.length; i += 4) {
    if (px[i + 3] < 160) continue;
    r += px[i];
    g += px[i + 1];
    b += px[i + 2];
    n++;
  }
  if (n < 30) return null;
  r /= n; g /= n; b /= n;
  if (r * 0.299 + g * 0.587 + b * 0.114 > 140) return null;
  return `rgb(${r | 0},${g | 0},${b | 0})`;
}

// ---------------------------------------------------------------- measuring

export const ITEMS = ["sword", "book", "staff", "shield", "bow", "nothing"] as const;
export type Item = (typeof ITEMS)[number];
export type Measured = {
  fill: number; // ink pixels / figure box: bulk
  aspect: number; // box width / height
  stance: number; // foot spread / height
  armSpread: number; // hand-to-hand span / height
  colors: string[]; // ink hues with a real share of the ink
  item: Item; // best guess at the held prop; the user can correct it
};

// Reads what's actually on the paper, before upload. Stats are built from these.
export async function measureDrawing(file: Blob): Promise<Measured> {
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, MAX_SIDE / Math.max(bmp.width, bmp.height));
  const w = Math.max(1, Math.round(bmp.width * scale)), h = Math.max(1, Math.round(bmp.height * scale));
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const g = c.getContext("2d", { willReadFrequently: true })!;
  g.drawImage(bmp, 0, 0, w, h);
  const px = g.getImageData(0, 0, w, h).data;
  const alpha = inkAlpha(px, w, h);
  return measureInk(px, alpha, w, h);
}

// Pure part, testable without a DOM. px = RGBA photo, alpha = ink per pixel (inkAlpha).
export function measureInk(px: ArrayLike<number>, alpha: ArrayLike<number>, w: number, h: number): Measured {
  let x0 = w, y0 = h, x1 = -1, y1 = -1, ink = 0;
  const hues = { red: 0, blue: 0, green: 0, yellow: 0 };
  for (let p = 0; p < w * h; p++) {
    if (alpha[p] < 64) continue;
    ink++;
    const x = p % w, y = (p / w) | 0;
    if (x < x0) x0 = x;
    if (x > x1) x1 = x;
    if (y < y0) y0 = y;
    if (y > y1) y1 = y;
    const r = px[p * 4], gg = px[p * 4 + 1], b = px[p * 4 + 2];
    const mx = Math.max(r, gg, b), mn = Math.min(r, gg, b);
    if (mx - mn < 28) continue; // greyish: pencil / black pen (dark navy pen still counts as blue)
    const hue = mx === r ? ((gg - b) / (mx - mn) + 6) % 6 : mx === gg ? (b - r) / (mx - mn) + 2 : (r - gg) / (mx - mn) + 4;
    if (hue < 0.5 || hue >= 5.5) hues.red++;
    else if (hue < 1.3) hues.yellow++;
    else if (hue < 3) hues.green++;
    else if (hue < 4.6) hues.blue++;
    else hues.red++; // magenta/pink reads as red
  }
  if (x1 < 0) return { fill: 0, aspect: 0.5, stance: 0, armSpread: 0, colors: ["black"], item: "nothing" };
  const bw = x1 - x0 + 1, bh = y1 - y0 + 1;
  const colors = Object.entries(hues).filter(([, n]) => n > ink * 0.12).map(([k]) => k);

  const rgba = new Uint8ClampedArray(w * h * 4);
  for (let p = 0; p < w * h; p++) rgba[p * 4 + 3] = alpha[p];
  const j = estimateJoints(rgba, w, h);
  return {
    fill: ink / (bw * bh),
    aspect: bw / bh,
    stance: Math.abs(j.footF.x - j.footB.x) / bh,
    armSpread: Math.abs(j.handF.x - j.handB.x) / bh,
    colors: colors.length ? colors : ["black"],
    item: guessItem(alpha, w, h, j, bh),
  };
}

// The held prop: ink that isn't head, spine, legs or the arm's own stroke, on the side
// with far more of it than a bare forearm. A guess — the create page lets the user fix it.
function guessItem(alpha: ArrayLike<number>, w: number, h: number, j: Joints, bh: number): Item {
  const side = propSide((x, y) => alpha[y * w + x] >= 64, w, h, j, bh);
  return side ? shapeOf(side.pts, w, h, bh) : "nothing";
}

type PropSide = { pts: Vec[]; left: boolean; hand: Vec; elbow: Vec; stroke: number };

// Pen width from the legs (two strokes from hip to feet), so thresholds fit pen or marker.
function strokeWidth(ink: (x: number, y: number) => boolean, w: number, h: number, j: Joints) {
  let legInk = 0;
  for (let y = Math.max(0, Math.ceil(j.hip.y)); y < h; y++) for (let x = 0; x < w; x++) if (ink(x, y)) legInk++;
  const legLen = Math.max(1, Math.max(j.footF.y, j.footB.y) - j.hip.y);
  return Math.max(1.5, legInk / (2 * legLen * 1.1));
}

function propSide(ink: (x: number, y: number) => boolean, w: number, h: number, j: Joints, bh: number): PropSide | null {
  const stroke = strokeWidth(ink, w, h, j);
  const headR = Math.max(6, Math.hypot(j.head.x - j.shoulder.x, j.head.y - j.shoulder.y) * 0.7);
  const band = bh * 0.07;
  // Hands: F is the one further right in the drawing (see estimateJoints).
  const arms = [
    { left: true, hand: j.handB, elbow: j.elbowB },
    { left: false, hand: j.handF, elbow: j.elbowF },
  ];
  // The arm stroke is at most about a third of the body long. The "hand" found on the ink
  // can be a sword's tip, so cap the arm there and keep what's beyond it.
  const reachOf = arms.map(({ hand }) => {
    const d = Math.hypot(hand.x - j.shoulder.x, hand.y - j.shoulder.y) || 1, k = Math.min(1, (bh * 0.36) / d);
    return { x: j.shoulder.x + (hand.x - j.shoulder.x) * k, y: j.shoulder.y + (hand.y - j.shoulder.y) * k };
  });
  const sides: Vec[][] = [[], []];
  for (let y = 0; y < Math.min(h, j.hip.y); y++) {
    for (let x = 0; x < w; x++) {
      if (!ink(x, y)) continue;
      if (Math.hypot(x - j.head.x, y - j.head.y) < headR) continue;
      if (Math.abs(x - j.shoulder.x) < band && y > j.head.y) continue; // spine
      if (Math.hypot(x - j.shoulder.x, y - j.shoulder.y) < bh * 0.22) continue; // upper arms
      const i = x < j.shoulder.x ? 0 : 1;
      if (distToSeg({ x, y }, j.shoulder, reachOf[i]) < stroke * 2.2) continue; // the arm itself
      sides[i].push({ x, y });
    }
  }
  const i = sides[0].length > sides[1].length ? 0 : 1;
  if (sides[i].length < bh * 0.16 * stroke) return null; // shorter than a sixth of the body: just a hand
  return { pts: sides[i], ...arms[i], stroke };
}

function distToSeg(p: Vec, a: Vec, b: Vec) {
  const dx = b.x - a.x, dy = b.y - a.y;
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy || 1)));
  return Math.hypot(p.x - a.x - dx * t, p.y - a.y - dy * t);
}

function shapeOf(pts: Vec[], w: number, h: number, bh: number): Item {
  // Principal axes of the extra ink: a line (blade/staff), a curve (bow) or a blob (shield/book).
  let mx = 0, my = 0;
  for (const p of pts) {
    mx += p.x;
    my += p.y;
  }
  mx /= pts.length;
  my /= pts.length;
  let sxx = 0, syy = 0, sxy = 0, minX = w, maxX = 0, minY = h, maxY = 0;
  for (const p of pts) {
    sxx += (p.x - mx) ** 2;
    syy += (p.y - my) ** 2;
    sxy += (p.x - mx) * (p.y - my);
    minX = Math.min(minX, p.x);
    maxX = Math.max(maxX, p.x);
    minY = Math.min(minY, p.y);
    maxY = Math.max(maxY, p.y);
  }
  const tr = (sxx + syy) / pts.length, det = (sxx * syy - sxy * sxy) / pts.length ** 2;
  const l1 = tr / 2 + Math.sqrt(Math.max(0, (tr * tr) / 4 - det)), l2 = Math.max(0, tr - l1);
  const thin = Math.sqrt(l2 / (l1 || 1));
  const span = Math.max(maxX - minX, maxY - minY) / bh;
  if (thin < 0.18) return maxY - minY > (maxX - minX) * 1.5 && maxY - minY > bh * 0.5 ? "staff" : "sword";
  if (thin < 0.45) return "bow";
  return span > 0.3 ? "shield" : "book";
}
