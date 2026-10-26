// Turns a photo of a drawing into what the fighter wears in the arena: paper →
// transparent, the figure found, and its head cut out (the body is drawn as a
// clean stickman, see stickman.ts). Runs in the browser.

import { bossLookOf, type BossLook } from "./bossLook";
import { bossSprite } from "./bossSprite";
import { estimateJoints, jointsFromVision, type Joints, type Vec } from "./skeleton";

// What a fighter wears from its drawing. head: the drawn head, cut out as a circle.
// ink: average ink colour. prop: the item drawn in its hand (the stickman holds it).
// width: the drawing's pen width, in arena units.
// axis: grip→tip angle of a long item (blade, staff), which the stickman turns with the arm;
// null for the rest (shield, book, bow), which keep the angle they were drawn at.
export type Prop = { img: HTMLCanvasElement; hx: number; hy: number; scale: number; rest: number; axis: number | null };
export type Sprite = {
  head: HTMLCanvasElement | null; ink: string | null; prop: Prop | null; width: number;
  // A dungeon boss's sprite is built from its data, not from a photo (src/game/bossSprite.ts): its head canvas is drawn at headScale world units per pixel
  // with the face at headCenter, and `look` carries the outfit, palette, idle and aura for whoever draws it.
  headScale?: number; headCenter?: { x: number; y: number }; look?: BossLook;
};

// Loading a drawing is a few ms of pixel work; the gallery, pickers and the arena share it.
const cache = new Map<string, Promise<Sprite>>();
export function loadSpriteCached(url: string, poseJson?: string | null, rotation = 0, flipItem = false): Promise<Sprite> {
  const key = `${url}|${rotation}|${flipItem}|${poseJson ?? ""}`;
  let p = cache.get(key);
  if (!p) {
    const look = bossLookOf(url);
    p = look ? Promise.resolve(bossSprite(look)) : loadSprite(url, poseJson, rotation, flipItem); // a boss is drawn from its data

    p.catch(() => cache.delete(key));
    cache.set(key, p);
  }
  return p;
}

const MAX_SIDE = 512; // the cut-out figure
const FIND_SIDE = 1024; // the whole photo, while finding the figure: thin pen lines must survive the downscale

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
  // Only fairly solid ink links up: uneven lighting leaves faint "ink" over the whole
  // page, which would chain the figure to the photo's edge and get it thrown away.
  const LINK = 140;
  const label = new Int32Array(n).fill(-1);
  const blobs: { size: number; strong: number; x0: number; y0: number; x1: number; y1: number; edge: boolean }[] = [];
  const stack: number[] = [];
  for (let start = 0; start < n; start++) {
    if (alpha[start] < LINK || label[start] !== -1) continue;
    const id = blobs.length;
    const blob = { size: 0, strong: 0, x0: w, y0: h, x1: 0, y1: 0, edge: false };
    label[start] = id;
    stack.push(start);
    while (stack.length) {
      const p = stack.pop()!;
      const x = p % w, y = (p / w) | 0;
      blob.size++;
      if (alpha[p] >= 200) blob.strong++;
      if (x < blob.x0) blob.x0 = x;
      if (x > blob.x1) blob.x1 = x;
      if (y < blob.y0) blob.y0 = y;
      if (y > blob.y1) blob.y1 = y;
      if (x <= 1 || y <= 1 || x >= w - 2 || y >= h - 2) blob.edge = true;
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
        const xx = x + dx, yy = y + dy;
        if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
        const q = yy * w + xx;
        if (alpha[q] >= LINK && label[q] === -1) {
          label[q] = id;
          stack.push(q);
        }
      }
    }
    blobs.push(blob);
  }
  if (!blobs.length) return alpha;
  const inner = blobs.filter((b) => !b.edge);
  // The figure is the blob with the most solid ink, not the most pixels: a long faint
  // paper fold or shadow can out-count a small, dark pen doodle.
  const main = (inner.length ? inner : blobs).reduce((a, b) => (b.strong > a.strong || (b.strong === a.strong && b.size > a.size) ? b : a));
  // Pull in the rest of the figure (sword, shield, loose strokes) within a margin of it.
  const m = Math.max(main.x1 - main.x0, main.y1 - main.y0) * 0.4;
  const near = (b: (typeof blobs)[number]) => b.x1 >= main.x0 - m && b.x0 <= main.x1 + m && b.y1 >= main.y0 - m && b.y0 <= main.y1 + m;
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

type Source = CanvasImageSource & { width: number; height: number };

// Stand a sideways photo upright: returns the rotated image and how to map
// a point given as fractions of the *original* photo into it.
function rotated(src: Source, deg: number) {
  const r = ((Math.round(deg / 90) % 4) + 4) % 4;
  const W0 = src.width, H0 = src.height;
  if (r === 0) return { img: src, map: (v: Vec) => ({ x: v.x * W0, y: v.y * H0 }) };
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

// Find the figure in a photo and cut just its ink out, sharp: paper → transparent.
// deepen: darken faint ink so pencil lines read on screen (not for the stored cut-out,
// which is cut again when it loads).
function cutFigure(img: Source, deepen = true) {
  const scale = Math.min(1, FIND_SIDE / Math.max(img.width, img.height));
  const w = Math.max(1, Math.round(img.width * scale));
  const h = Math.max(1, Math.round(img.height * scale));
  const work = document.createElement("canvas");
  work.width = w;
  work.height = h;
  const ctx = work.getContext("2d", { willReadFrequently: true })!;
  // Paper first: a transparent cut-out must read as paper, not as black ink (RGB of a clear pixel is 0).
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, w, h);
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
  nctx.fillStyle = "#fff"; // paper under a transparent cut-out (see above)
  nctx.fillRect(0, 0, normal.width, normal.height);
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
      if (deepen && a > 64) {
        // Deepen faint ink a little so pencil lines read on screen.
        px2[i] = Math.round(px2[i] * 0.75);
        px2[i + 1] = Math.round(px2[i + 1] * 0.75);
        px2[i + 2] = Math.round(px2[i + 2] * 0.75);
      }
    }
  }
  nctx.putImageData(d2, 0, 0);
  return { normal, px2, ox, oy, s2 };
}

// What gets uploaded and stored instead of the photo: the figure alone, upright, on
// a transparent background with a margin. Nothing else from the photo (table, room,
// faces) is kept. Transparent PNG so the card background shows through around the ink.
export async function cleanDrawing(file: Blob, rotation = 0): Promise<Blob> {
  const { img } = rotated(await createImageBitmap(file), rotation);
  const { normal } = cutFigure(img, false);
  const pad = Math.round(Math.max(normal.width, normal.height) * 0.08);
  const c = document.createElement("canvas");
  c.width = normal.width + pad * 2;
  c.height = normal.height + pad * 2;
  const g = c.getContext("2d")!;
  // No fillRect: leave alpha=0 so the ink sits on a transparent background.
  g.drawImage(normal, pad, pad);
  return new Promise((resolve, reject) => c.toBlob((b) => (b ? resolve(b) : reject(new Error("Couldn't read that image"))), "image/png"));
}

// flipItem: the owner says the held item came out upside down, so grip and tip swap.
export async function loadSprite(url: string, poseJson?: string | null, rotation = 0, flipItem = false): Promise<Sprite> {
  const { img, map: toRotated } = rotated(await loadImage(url), rotation);
  const { normal, px2, ox, oy, s2 } = cutFigure(img);

  // Joints: AI keypoints when we have them (fractions of the photo), else read off the ink.
  const W = normal.width, H = normal.height;
  const toSprite = (v: Vec) => {
    const q = toRotated(v);
    return { x: (q.x - ox) * s2, y: (q.y - oy) * s2 };
  };
  let joints: Joints | null = null;
  let headBox: Circle | null = null, itemBox: Rect | null = null;
  if (poseJson) {
    try {
      const pose = JSON.parse(poseJson);
      joints = jointsFromVision(pose, toSprite);
      ({ headBox, itemBox } = boxesFromPose(pose, toSprite, Math.max(img.width, img.height) * s2));
    } catch {}
  }
  joints ??= estimateJoints(px2, W, H);
  // The arena body is 180 units from head to feet; the cropped drawing is H pixels.
  const unit = 180 / H;
  const inkAt = (x: number, y: number) => px2[(y * W + x) * 4 + 3] >= 64;
  // The AI's item box narrows the search; if it finds nothing that touches the hand, look again without it.
  const side = (itemBox && propSide(inkAt, W, H, joints, H, { box: itemBox, headR: headBox ? headBox.r * 1.1 : undefined })) || propSide(inkAt, W, H, joints, H);
  return {
    head: cutHead(normal, joints, headBox),
    ink: inkColor(px2),
    prop: side ? cutProp(px2, W, H, side, unit, flipItem) : null,
    width: Math.min(11, Math.max(4, (side?.stroke ?? strokeWidth(inkAt, W, H, joints)) * unit * 1.1)),
  };
}

type Circle = { x: number; y: number; r: number };
type Rect = { x0: number; y0: number; x1: number; y1: number };

// The vision model's head circle and item rectangle (fractions of the photo, head radius as a fraction of the
// longer side), mapped into the cut-out like the joints. Missing or malformed boxes come back as null.
export function boxesFromPose(pose: unknown, toSprite: (v: Vec) => Vec, longSide: number): { headBox: Circle | null; itemBox: Rect | null } {
  const p = (pose ?? {}) as { head_box?: Record<string, unknown>; item_box?: Record<string, unknown> | null };
  const num = (o: Record<string, unknown> | null | undefined, ...ks: string[]) => (o && ks.every((k) => typeof o[k] === "number" && Number.isFinite(o[k])) ? ks.map((k) => o[k] as number) : null);
  let headBox: Circle | null = null, itemBox: Rect | null = null;
  const h = num(p.head_box, "x", "y", "r");
  if (h && h[2] > 0) {
    const c = toSprite({ x: h[0], y: h[1] });
    headBox = { ...c, r: h[2] * longSide };
  }
  const b = num(p.item_box, "x0", "y0", "x1", "y1");
  if (b) {
    const a = toSprite({ x: b[0], y: b[1] }), z = toSprite({ x: b[2], y: b[3] }); // a rotation can swap the corners
    itemBox = { x0: Math.min(a.x, z.x), y0: Math.min(a.y, z.y), x1: Math.max(a.x, z.x), y1: Math.max(a.y, z.y) };
  }
  return { headBox, itemBox };
}

// Copy exactly the prop's pixels into their own canvas, anchored at the hand. A prop
// on the drawing's left is mirrored, since the stickman always holds it in front.
function cutProp(px: Uint8ClampedArray, W: number, H: number, s: PropSide, scale: number, flip: boolean): Prop | null {
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
  const mx = (x: number) => (s.left ? x1 - x : x - x0);
  const rest = Math.atan2(s.hand.y - s.elbow.y, (s.hand.x - s.elbow.x) * (s.left ? -1 : 1));
  // Items are held where they meet the arm: the point nearest the shoulder (the arm's own
  // stroke was stripped off). The "hand" found on the ink is often a blade's tip, and
  // hanging the item from there turns it upside down or leaves it floating away.
  const d = (v: Vec) => Math.hypot(v.x - s.shoulder.x, v.y - s.shoulder.y);
  const ends = longEnds(s.pts);
  if (!ends) {
    const hold = s.pts.reduce((a, b) => (d(b) < d(a) ? b : a));
    return { img: c, hx: mx(hold.x), hy: hold.y - y0, scale, rest, axis: null };
  }
  let [grip, tip] = d(ends[0]) <= d(ends[1]) ? ends : [ends[1], ends[0]];
  // A heavy end (mace or hammer head) is the striking end, never the grip.
  const r = Math.hypot(tip.x - grip.x, tip.y - grip.y) * 0.18;
  const ink = (e: Vec) => s.pts.filter((p) => Math.hypot(p.x - e.x, p.y - e.y) < r).length;
  if (ink(grip) > ink(tip) * 1.8) [grip, tip] = [tip, grip];
  if (flip) [grip, tip] = [tip, grip];
  return { img: c, hx: mx(grip.x), hy: grip.y - y0, scale, rest, axis: Math.atan2(tip.y - grip.y, (tip.x - grip.x) * (s.left ? -1 : 1)) };
}

// The two ends of a long, thin item along its main axis; null for a blob or a curve.
function longEnds(pts: Vec[]): [Vec, Vec] | null {
  let mx = 0, my = 0;
  for (const p of pts) {
    mx += p.x;
    my += p.y;
  }
  mx /= pts.length;
  my /= pts.length;
  let sxx = 0, syy = 0, sxy = 0;
  for (const p of pts) {
    sxx += (p.x - mx) ** 2;
    syy += (p.y - my) ** 2;
    sxy += (p.x - mx) * (p.y - my);
  }
  const tr = (sxx + syy) / pts.length, det = (sxx * syy - sxy * sxy) / pts.length ** 2;
  const l1 = tr / 2 + Math.sqrt(Math.max(0, (tr * tr) / 4 - det)), l2 = Math.max(0, tr - l1);
  if (Math.sqrt(l2 / (l1 || 1)) >= 0.25) return null; // same "line" test as shapeOf (sword/staff < 0.18)
  const a = 0.5 * Math.atan2(2 * sxy, sxx - syy), ux = Math.cos(a), uy = Math.sin(a);
  let lo = Infinity, hi = -Infinity;
  for (const p of pts) {
    const t = (p.x - mx) * ux + (p.y - my) * uy;
    lo = Math.min(lo, t);
    hi = Math.max(hi, t);
  }
  return [
    { x: mx + ux * lo, y: my + uy * lo },
    { x: mx + ux * hi, y: my + uy * hi },
  ];
}

// The head as a circle: exactly the AI's head box when there is one, else a circle around the head joint
// (head-to-shoulder is about two head radii). Either way a sword drawn next to it stays out.
function cutHead(src: HTMLCanvasElement, j: Joints, box: Circle | null = null): HTMLCanvasElement | null {
  const cx = box ? box.x : j.head.x, cy = box ? box.y : j.head.y;
  const r = box
    ? Math.min(src.width / 2, Math.max(8, box.r * 1.05)) // a little slack so the outline's own width isn't clipped
    : Math.min(src.width / 2, Math.max(8, Math.hypot(j.head.x - j.shoulder.x, j.head.y - j.shoulder.y) * 0.58));
  if (!Number.isFinite(r) || !Number.isFinite(cx) || !Number.isFinite(cy)) return null;
  const c = document.createElement("canvas");
  c.width = c.height = Math.max(8, Math.round(r * 2));
  const g = c.getContext("2d", { willReadFrequently: true })!;
  g.beginPath();
  g.arc(c.width / 2, c.height / 2, c.width / 2, 0, Math.PI * 2);
  g.clip();
  g.drawImage(src, cx - r, cy - r, r * 2, r * 2, 0, 0, c.width, c.height);
  // Guessed joints can miss the head; an empty crop would show as a blank white face,
  // so fall back to the plain drawn circle instead.
  const img = g.getImageData(0, 0, c.width, c.height);
  const a = img.data;
  let ink = 0;
  for (let i = 3; i < a.length; i += 4) if (a[i] > 64) ink++;
  if (ink <= c.width * c.height * 0.02) return null;
  // Drop the specks and shading hatches a scribbled face collects; the player's own lines stay.
  const alpha = new Uint8Array(c.width * c.height);
  for (let i = 0; i < alpha.length; i++) alpha[i] = a[i * 4 + 3];
  const drop = headSpecks(alpha, c.width, c.height);
  let dropped = 0;
  for (let i = 0; i < drop.length; i++) if (drop[i]) { a[i * 4 + 3] = 0; dropped++; }
  if (dropped) g.putImageData(img, 0, 0);
  return c;
}

type Comp = { px: number[]; n: number; sx: number; sy: number; sxx: number; syy: number; sxy: number };

// 8-connected pieces of the ink in `mask` (1 = ink).
function components(mask: Uint8Array, w: number, h: number): Comp[] {
  const seen = new Uint8Array(w * h);
  const comps: Comp[] = [];
  const stack: number[] = [];
  for (let i = 0; i < w * h; i++) {
    if (!mask[i] || seen[i]) continue;
    const c: Comp = { px: [], n: 0, sx: 0, sy: 0, sxx: 0, syy: 0, sxy: 0 };
    seen[i] = 1;
    stack.push(i);
    while (stack.length) {
      const q = stack.pop()!;
      const x = q % w, y = (q / w) | 0;
      c.px.push(q);
      c.sx += x; c.sy += y; c.sxx += x * x; c.syy += y * y; c.sxy += x * y;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const nb = ny * w + nx;
        if (mask[nb] && !seen[nb]) { seen[nb] = 1; stack.push(nb); }
      }
    }
    c.n = c.px.length;
    comps.push(c);
  }
  return comps;
}

// Shading hatches among `comps`: `need` or more strokes, each thin and short (at most 40% of the crop wide, at
// least minLen), that lie within 25° of one direction. Fewer are brows, a mouth or a nose: kept.
function hatching(comps: Comp[], w: number, minLen: number, need = 4): Comp[] {
  const lines: { c: Comp; angle: number }[] = [];
  for (const c of comps) {
    // Principal axis from the second moments (+1/12: a pixel's own spread, so a 1 px line isn't "infinitely" thin).
    const mx = c.sx / c.n, my = c.sy / c.n;
    const vx = c.sxx / c.n - mx * mx + 1 / 12, vy = c.syy / c.n - my * my + 1 / 12, cv = c.sxy / c.n - mx * my;
    const tr = vx + vy, det = Math.sqrt(Math.max(0, (vx - vy) ** 2 / 4 + cv * cv));
    const l1 = tr / 2 + det, l2 = Math.max(1e-6, tr / 2 - det);
    const length = Math.sqrt(12 * l1);
    if (Math.sqrt(l1 / l2) >= 3 && length <= w * 0.4 && length >= minLen) lines.push({ c, angle: 0.5 * Math.atan2(2 * cv, vx - vy) });
  }
  let best: Comp[] = [];
  for (const { angle: a0 } of lines) {
    const same = lines.filter(({ angle }) => {
      const d = Math.abs(angle - a0) % Math.PI; // angles wrap at 180°
      return Math.min(d, Math.PI - d) < (25 * Math.PI) / 180;
    });
    if (same.length > best.length) best = same.map((l) => l.c);
  }
  return best.length >= need ? best : [];
}

// Pixels of a head crop to erase (1 = drop): ink specks of a few pixels, and shading hatches. Hatches are found
// twice: as loose strokes apart from the face outline, and, with the outline's ring cut away, inside the face,
// so hatching that starts at the outline is caught too (a stub of it stays on the ring). The outline, eyes and
// mouth stay, and so does a face where this would take away most of the ink. alpha = ink per pixel, a w x h square.
export function headSpecks(alpha: ArrayLike<number>, w: number, h: number): Uint8Array {
  const drop = new Uint8Array(w * h);
  const ink = new Uint8Array(w * h);
  for (let i = 0; i < ink.length; i++) ink[i] = alpha[i] >= 64 ? 1 : 0;
  const comps = components(ink, w, h);
  if (comps.length === 0) return drop;
  let main = comps[0];
  for (const c of comps) if (c.n > main.n) main = c;
  const total = comps.reduce((n, c) => n + c.n, 0);
  const speck = Math.max(4, Math.round(w * h * 0.0006));
  const apart = comps.filter((c) => c !== main);
  const out = new Set<Comp>([...apart.filter((c) => c.n < speck), ...hatching(apart.filter((c) => c.n >= speck), w, 0)]);
  // Inside the face: everything but the outer ring (an annulus 20% of the radius wide). Strokes that grow out of
  // the outline are shading by nature (a brow or a mouth floats free), so three of those are enough.
  const inner = new Uint8Array(w * h), ring = new Uint8Array(w * h);
  const R = w / 2;
  for (let i = 0; i < inner.length; i++) {
    if (!ink[i]) continue;
    if (Math.hypot((i % w) + 0.5 - R, ((i / w) | 0) + 0.5 - R) < R * 0.8) inner[i] = 1;
    else ring[i] = 1;
  }
  const grown = (c: Comp) => c.px.some((q) => {
    const x = q % w, y = (q / w) | 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (x + dx >= 0 && x + dx < w && y + dy >= 0 && y + dy < h && ring[(y + dy) * w + x + dx]) return true;
    return false;
  });
  const parts = components(inner, w, h);
  const inside = [...new Set([...hatching(parts, w, w * 0.1), ...hatching(parts.filter(grown), w, w * 0.1, 3)])];
  const kill = new Set<number>(inside.flatMap((c) => c.px));
  for (const c of out) for (const q of c.px) kill.add(q);
  if (kill.size > total * 0.4) return drop; // that would be most of the face: leave it as drawn
  for (const q of kill) drop[q] = 1;
  // The faint antialiased fringe round an erased stroke goes with it (only faint pixels: solid ink stays).
  for (const q of kill) {
    const x = q % w, y = (q / w) | 0;
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
      const nx = x + dx, ny = y + dy;
      if (nx >= 0 && ny >= 0 && nx < w && ny < h && alpha[ny * w + nx] > 0 && alpha[ny * w + nx] < 160) drop[ny * w + nx] = 1;
    }
  }
  return drop;
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

export const ITEMS = ["sword", "mace", "book", "staff", "shield", "bow", "nothing"] as const;
export type Item = (typeof ITEMS)[number];
export type Measured = {
  fill: number; // ink pixels / figure box: bulk
  aspect: number; // box width / height
  stance: number; // foot spread / height
  armSpread: number; // hand-to-hand span / height
  colors: string[]; // ink hues with a real share of the ink
  item: Item; // best guess at the held prop; the user can correct it
  penWidth: number; // average stroke width (px at FIND_SIDE scale); thick marker vs thin pen
};

// Reads what's actually on the paper, before upload. Stats are built from these.
export async function measureDrawing(file: Blob, rotation = 0): Promise<Measured> {
  const { img: bmp } = rotated(await createImageBitmap(file), rotation);
  const scale = Math.min(1, FIND_SIDE / Math.max(bmp.width, bmp.height));
  const w = Math.max(1, Math.round(bmp.width * scale)), h = Math.max(1, Math.round(bmp.height * scale));
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const g = c.getContext("2d", { willReadFrequently: true })!;
  g.fillStyle = "#fff"; // paper under a transparent cut-out (see cutFigure)
  g.fillRect(0, 0, w, h);
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
  if (x1 < 0) return { fill: 0, aspect: 0.5, stance: 0, armSpread: 0, colors: ["black"], item: "nothing", penWidth: 3 };
  const bw = x1 - x0 + 1, bh = y1 - y0 + 1;
  const colors = Object.entries(hues).filter(([, n]) => n > ink * 0.12).map(([k]) => k);

  const rgba = new Uint8ClampedArray(w * h * 4);
  for (let p = 0; p < w * h; p++) rgba[p * 4 + 3] = alpha[p];
  const j = estimateJoints(rgba, w, h);
  const penWidth = strokeWidth((x, y) => alpha[y * w + x] >= 64, w, h, j);
  return {
    fill: ink / (bw * bh),
    aspect: bw / bh,
    stance: Math.abs(j.footF.x - j.footB.x) / bh,
    armSpread: Math.abs(j.handF.x - j.handB.x) / bh,
    colors: colors.length ? colors : ["black"],
    item: guessItem(alpha, w, h, j, bh),
    penWidth,
  };
}

// The held prop: ink that isn't head, spine, legs or the arm's own stroke, on the side
// with far more of it than a bare forearm. A guess — the create page lets the user fix it.
function guessItem(alpha: ArrayLike<number>, w: number, h: number, j: Joints, bh: number): Item {
  const side = propSide((x, y) => alpha[y * w + x] >= 64, w, h, j, bh);
  return side ? shapeOf(side.pts, w, h, bh) : "nothing";
}

type PropSide = { pts: Vec[]; left: boolean; hand: Vec; elbow: Vec; shoulder: Vec; stroke: number };

// Pen width from the legs (two strokes from hip to feet), so thresholds fit pen or marker.
function strokeWidth(ink: (x: number, y: number) => boolean, w: number, h: number, j: Joints) {
  let legInk = 0;
  for (let y = Math.max(0, Math.ceil(j.hip.y)); y < h; y++) for (let x = 0; x < w; x++) if (ink(x, y)) legInk++;
  const legLen = Math.max(1, Math.max(j.footF.y, j.footB.y) - j.hip.y);
  return Math.max(1.5, legInk / (2 * legLen * 1.1));
}

// hint.box: the AI's item rectangle (only ink inside it, plus a margin, can be the item); hint.headR: its head radius.
function propSide(ink: (x: number, y: number) => boolean, w: number, h: number, j: Joints, bh: number, hint: { box?: Rect; headR?: number } = {}): PropSide | null {
  const stroke = strokeWidth(ink, w, h, j);
  const headR = hint.headR ?? Math.max(6, Math.hypot(j.head.x - j.shoulder.x, j.head.y - j.shoulder.y) * 0.7);
  const pad = hint.box ? Math.max(stroke * 2, bh * 0.03) : 0;
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
  const sides: Vec[][] = [[], []]; // extra ink per side: not head, spine, upper arm or the arm stroke
  const reach: Vec[][] = [[], []]; // the same but keeping the arm stroke: what a held item connects through
  for (let y = 0; y < Math.min(h, j.hip.y); y++) {
    for (let x = 0; x < w; x++) {
      if (!ink(x, y)) continue;
      if (hint.box && (x < hint.box.x0 - pad || x > hint.box.x1 + pad || y < hint.box.y0 - pad || y > hint.box.y1 + pad)) continue;
      if (Math.hypot(x - j.head.x, y - j.head.y) < headR) continue;
      if (Math.abs(x - j.shoulder.x) < band && y > j.head.y) continue; // spine
      if (Math.hypot(x - j.shoulder.x, y - j.shoulder.y) < bh * 0.22) continue; // upper arms
      const i = x < j.shoulder.x ? 0 : 1;
      reach[i].push({ x, y });
      if (distToSeg({ x, y }, j.shoulder, reachOf[i]) < stroke * 2.2) continue; // the arm itself
      sides[i].push({ x, y });
    }
  }
  // A held item touches the hand: keep only the extra ink connected (through the forearm) to the hand.
  // Ink that merely sits off to one side, like a cap's brim, hair or a stray mark, used to become a "prop"
  // floating by the hand. (The hand found on the ink can be a blade's tip, so both ends seed the search.)
  const held = sides.map((pts, k) => {
    const key = (x: number, y: number) => y * w + x;
    const left = new Set(reach[k].map((p) => key(p.x, p.y)));
    const near = Math.max(stroke * 3, bh * 0.06);
    const queue = reach[k].filter((p) => Math.min(Math.hypot(p.x - reachOf[k].x, p.y - reachOf[k].y), Math.hypot(p.x - arms[k].hand.x, p.y - arms[k].hand.y)) < near);
    for (const p of queue) left.delete(key(p.x, p.y));
    for (let q = 0; q < queue.length; q++) {
      const { x, y } = queue[q];
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
        if (left.delete(key(x + dx, y + dy))) queue.push({ x: x + dx, y: y + dy });
      }
    }
    const linked = new Set(queue.map((p) => key(p.x, p.y)));
    return pts.filter((p) => linked.has(key(p.x, p.y)));
  });
  const i = held[0].length > held[1].length ? 0 : 1;
  if (held[i].length < bh * 0.16 * stroke) return null; // shorter than a sixth of the body: just a hand
  return { pts: held[i], ...arms[i], shoulder: j.shoulder, stroke };
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
