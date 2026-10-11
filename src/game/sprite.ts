// Turns a photo of a drawing into a game sprite: paper → transparent, ink kept,
// cropped tight to the figure. Runs in the browser.

import { buildRig, estimateJoints, jointsFromVision, type Joints, type Rig, type Vec } from "./skeleton";

export type Sprite = { normal: HTMLCanvasElement; hurt: HTMLCanvasElement; aspect: number; rig: Rig | null };

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

function tinted(src: HTMLCanvasElement, color: string): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = src.width;
  c.height = src.height;
  const ctx = c.getContext("2d")!;
  ctx.drawImage(src, 0, 0);
  ctx.globalCompositeOperation = "source-atop";
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, c.width, c.height);
  return c;
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

  // Skeleton: AI keypoints when we have them (fractions of the photo), else read it off the ink.
  let rig: Rig | null = null;
  try {
    const alpha = nctx.getImageData(0, 0, normal.width, normal.height).data;
    let joints: Joints | null = null;
    if (poseJson) {
      try {
        joints = jointsFromVision(JSON.parse(poseJson), (v) => {
          const q = toRotated(v);
          return { x: (q.x - ox) * s2, y: (q.y - oy) * s2 };
        });
      } catch {}
    }
    joints ??= estimateJoints(alpha, normal.width, normal.height);
    rig = buildRig(alpha, normal.width, normal.height, joints);
  } catch (err) {
    console.warn("[sprite] couldn't rig drawing, it will move as one piece", err);
  }
  return { normal, hurt: tinted(normal, "rgba(229,72,45,.85)"), aspect: normal.width / normal.height, rig };
}
