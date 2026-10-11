// Puppet rig for a drawn stick figure. We find (or are given) the joints, lay a
// triangle mesh over the drawing, skin each mesh vertex to the nearest bones,
// and then bend the actual ink: real punches, kicks, walking legs, a KO fall.

export type Vec = { x: number; y: number };

export type Joints = {
  head: Vec;
  shoulder: Vec;
  hip: Vec;
  elbowF: Vec;
  handF: Vec;
  elbowB: Vec;
  handB: Vec;
  kneeF: Vec;
  footF: Vec;
  kneeB: Vec;
  footB: Vec;
};

// "F" = the limb on the side the fighter faces (+x in sprite space), "B" = the far one.
export type BoneName = "torso" | "head" | "upperF" | "foreF" | "upperB" | "foreB" | "thighF" | "shinF" | "thighB" | "shinB";

type BoneDef = { name: BoneName; from: keyof Joints; to: keyof Joints; parent: BoneName | null };

// Parents first: forward kinematics walks this list in order.
export const BONES: BoneDef[] = [
  { name: "torso", from: "hip", to: "shoulder", parent: null },
  { name: "head", from: "shoulder", to: "head", parent: "torso" },
  { name: "upperF", from: "shoulder", to: "elbowF", parent: "torso" },
  { name: "foreF", from: "elbowF", to: "handF", parent: "upperF" },
  { name: "upperB", from: "shoulder", to: "elbowB", parent: "torso" },
  { name: "foreB", from: "elbowB", to: "handB", parent: "upperB" },
  { name: "thighF", from: "hip", to: "kneeF", parent: null },
  { name: "shinF", from: "kneeF", to: "footF", parent: "thighF" },
  { name: "thighB", from: "hip", to: "kneeB", parent: null },
  { name: "shinB", from: "kneeB", to: "footB", parent: "thighB" },
];

type Affine = [number, number, number, number, number, number]; // a b c d e f (canvas order)

export type Rig = {
  joints: Joints;
  rest: Record<BoneName, number>; // rest angle of each bone
  verts: Float32Array; // rest x,y per vertex
  weights: { bone: number[]; w: number[] }[]; // top-2 bones per vertex
  tris: number[]; // vertex indices, 3 per triangle (only cells with ink)
  out: Float32Array; // deformed vertex positions (reused every frame)
};

const angle = (a: Vec, b: Vec) => Math.atan2(b.y - a.y, b.x - a.x);
const mid = (a: Vec, b: Vec, t = 0.5): Vec => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });

function distToSegment(p: Vec, a: Vec, b: Vec) {
  const dx = b.x - a.x, dy = b.y - a.y;
  const len2 = dx * dx + dy * dy || 1;
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2));
  return Math.hypot(p.x - (a.x + dx * t), p.y - (a.y + dy * t));
}

// ---------------------------------------------------------------- joints

// Estimate joints straight from the ink (works offline, no AI needed).
export function estimateJoints(alpha: Uint8ClampedArray, W: number, H: number): Joints {
  const ink = (x: number, y: number) => alpha[(y * W + x) * 4 + 3] > 64;
  let top = 0, bottom = H - 1;
  outerTop: for (; top < H; top++) for (let x = 0; x < W; x++) if (ink(x, top)) break outerTop;
  outerBottom: for (; bottom > top; bottom--) for (let x = 0; x < W; x++) if (ink(x, bottom)) break outerBottom;
  const hh = Math.max(10, bottom - top);
  const yAt = (f: number) => Math.round(top + hh * f);

  const xsInBand = (y0: number, y1: number, nearX?: number, within = W) => {
    const xs: number[] = [];
    for (let y = Math.max(0, y0); y <= Math.min(H - 1, y1); y++)
      for (let x = 0; x < W; x++) if (ink(x, y) && (nearX === undefined || Math.abs(x - nearX) <= within)) xs.push(x);
    return xs;
  };
  const median = (xs: number[], fallback: number) => (xs.length ? xs.sort((a, b) => a - b)[xs.length >> 1] : fallback);

  // Head: the top fifth of the figure. Median, so a sword poking up doesn't drag it.
  const headXs = xsInBand(top, yAt(0.2));
  const head: Vec = { x: median(headXs, W / 2), y: yAt(0.1) };
  const spine = (f0: number, f1: number) => median(xsInBand(yAt(f0), yAt(f1), head.x, W * 0.18), head.x);
  const shoulder: Vec = { x: spine(0.27, 0.33), y: yAt(0.3) };

  // Hip: going up from the feet, the first row where the two legs merge into one stroke.
  let hipY = yAt(0.58);
  let sawTwo = false;
  for (let y = yAt(0.93); y > yAt(0.42); y--) {
    let runs = 0, inRun = false, gap = 99;
    for (let x = 0; x < W; x++) {
      if (ink(x, y)) {
        if (!inRun && gap > 3) runs++;
        inRun = true;
        gap = 0;
      } else {
        inRun = false;
        gap++;
      }
    }
    if (runs >= 2) sawTwo = true;
    else if (sawTwo && runs === 1) {
      hipY = y;
      break;
    }
  }
  const hip: Vec = { x: median(xsInBand(hipY - 2, hipY + 2, shoulder.x, W * 0.15), shoulder.x), y: hipY };

  // Feet: the extremes of the bottom strip.
  const footXs = xsInBand(bottom - Math.round(hh * 0.06), bottom);
  const fl = footXs.length ? Math.min(...footXs) : hip.x - 20;
  const fr = footXs.length ? Math.max(...footXs) : hip.x + 20;

  // Hands: the furthest ink left/right of the spine between shoulder and hip.
  let lh: Vec = { x: shoulder.x - 30, y: shoulder.y + 20 }, rh: Vec = { x: shoulder.x + 30, y: shoulder.y + 20 };
  for (let y = shoulder.y - Math.round(hh * 0.05); y <= hipY; y++) {
    for (let x = 0; x < W; x++) {
      if (!ink(x, y)) continue;
      if (x < lh.x) lh = { x, y };
      if (x > rh.x) rh = { x, y };
    }
  }
  const footL: Vec = { x: fl, y: bottom }, footR: Vec = { x: fr, y: bottom };
  return finish(head, shoulder, hip, lh, rh, footL, footR);
}

// Front = the limb further toward +x (the direction the fighter faces).
function finish(head: Vec, shoulder: Vec, hip: Vec, handA: Vec, handB: Vec, footA: Vec, footB: Vec, elbows?: [Vec, Vec], knees?: [Vec, Vec]): Joints {
  const [hF, hB, eF, eB] = handA.x >= handB.x ? [handA, handB, elbows?.[0], elbows?.[1]] : [handB, handA, elbows?.[1], elbows?.[0]];
  const [fF, fB, kF, kB] = footA.x >= footB.x ? [footA, footB, knees?.[0], knees?.[1]] : [footB, footA, knees?.[1], knees?.[0]];
  const bend = (a: Vec, b: Vec, out: number): Vec => {
    // A slightly bent midpoint reads better than a dead-straight limb when it rotates.
    const m = mid(a, b);
    const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    return { x: m.x + ((b.y - a.y) / len) * out, y: m.y - ((b.x - a.x) / len) * out };
  };
  return {
    head,
    shoulder,
    hip,
    handF: hF,
    handB: hB,
    elbowF: eF ?? bend(shoulder, hF, 2),
    elbowB: eB ?? bend(shoulder, hB, -2),
    footF: fF,
    footB: fB,
    kneeF: kF ?? bend(hip, fF, -2),
    kneeB: kB ?? bend(hip, fB, 2),
  };
}

type VisionPose = Record<
  "head" | "shoulder" | "hip" | "left_elbow" | "left_hand" | "right_elbow" | "right_hand" | "left_knee" | "left_foot" | "right_knee" | "right_foot",
  Vec
>;

// Vision keypoints are fractions of the original photo; map them into the cropped sprite.
export function jointsFromVision(p: VisionPose, toSprite: (v: Vec) => Vec): Joints {
  const m = (k: keyof VisionPose) => toSprite(p[k]);
  return finish(
    m("head"),
    m("shoulder"),
    m("hip"),
    m("left_hand"),
    m("right_hand"),
    m("left_foot"),
    m("right_foot"),
    [m("left_elbow"), m("right_elbow")],
    [m("left_knee"), m("right_knee")],
  );
}

// ---------------------------------------------------------------- mesh

export function buildRig(alpha: Uint8ClampedArray, W: number, H: number, joints: Joints): Rig {
  const cols = 18;
  const rows = Math.max(12, Math.min(34, Math.round((cols * H) / W)));
  const cw = W / cols, ch = H / rows;
  const n = (cols + 1) * (rows + 1);
  const verts = new Float32Array(n * 2);
  const weights: Rig["weights"] = [];
  const segs = BONES.map((b) => [joints[b.from], joints[b.to]] as const);
  // The head bone only owns ink inside the head's circle, so a sword or hat drawn
  // next to the head stays with the hand / torso instead of bending with the neck.
  const headR = Math.max(6, Math.hypot(joints.head.x - joints.shoulder.x, joints.head.y - joints.shoulder.y) * 0.6);
  const boneDist = (bi: number, p: Vec) => {
    if (BONES[bi].name === "head") {
      const d = Math.hypot(p.x - joints.head.x, p.y - joints.head.y);
      return d <= headR ? 0 : d - headR + 18;
    }
    return distToSegment(p, segs[bi][0], segs[bi][1]);
  };

  for (let r = 0; r <= rows; r++) {
    for (let c = 0; c <= cols; c++) {
      const i = r * (cols + 1) + c;
      const p = { x: c * cw, y: r * ch };
      verts[i * 2] = p.x;
      verts[i * 2 + 1] = p.y;
      // Nearly rigid skinning: the closest bone dominates, the 2nd only blends near joints.
      const d = segs.map((_, bi) => ({ bi, d: boneDist(bi, p) })).sort((x, y) => x.d - y.d);
      const w0 = 1 / Math.pow(d[0].d + 3, 4), w1 = 1 / Math.pow(d[1].d + 3, 4);
      weights.push({ bone: [d[0].bi, d[1].bi], w: [w0 / (w0 + w1), w1 / (w0 + w1)] });
    }
  }

  // Only keep cells that contain ink: stick figures are mostly empty paper.
  const tris: number[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      let any = false;
      const x0 = Math.max(0, Math.floor(c * cw) - 1), x1 = Math.min(W - 1, Math.ceil((c + 1) * cw) + 1);
      const y0 = Math.max(0, Math.floor(r * ch) - 1), y1 = Math.min(H - 1, Math.ceil((r + 1) * ch) + 1);
      for (let y = y0; y <= y1 && !any; y++) for (let x = x0; x <= x1; x++) if (alpha[(y * W + x) * 4 + 3] > 8) { any = true; break; }
      if (!any) continue;
      const a = r * (cols + 1) + c, b = a + 1, d = a + cols + 1, e = d + 1;
      tris.push(a, b, e, a, e, d);
    }
  }

  const rest = {} as Record<BoneName, number>;
  for (const b of BONES) rest[b.name] = angle(joints[b.from], joints[b.to]);
  return { joints, rest, verts, weights, tris, out: new Float32Array(n * 2) };
}

// ---------------------------------------------------------------- posing

// A target per bone: either an absolute world angle (0 = facing direction, π/2 = down)
// or a rotation relative to the drawing's own rest pose.
export type Target = { abs: number } | { rel: number };
export type PoseTargets = Partial<Record<BoneName, Target>>;

const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

// Turn targets into local rotation deltas (parents first, so children aim in world space).
export function resolvePose(rig: Rig, pose: PoseTargets): Record<BoneName, number> {
  const local = {} as Record<BoneName, number>;
  const world = {} as Record<BoneName, number>; // accumulated rotation from ancestors + self
  for (const b of BONES) {
    const inherited = b.parent ? world[b.parent] : 0;
    const t = pose[b.name];
    let d = 0;
    if (t && "abs" in t) d = wrap(t.abs - rig.rest[b.name] - inherited);
    else if (t && "rel" in t) d = t.rel;
    local[b.name] = d;
    world[b.name] = inherited + d;
  }
  return local;
}

function rotAbout(theta: number, p: Vec): Affine {
  const c = Math.cos(theta), s = Math.sin(theta);
  return [c, s, -s, c, p.x - c * p.x + s * p.y, p.y - s * p.x - c * p.y];
}
const compose = (m: Affine, n: Affine): Affine => [
  m[0] * n[0] + m[2] * n[1],
  m[1] * n[0] + m[3] * n[1],
  m[0] * n[2] + m[2] * n[3],
  m[1] * n[2] + m[3] * n[3],
  m[0] * n[4] + m[2] * n[5] + m[4],
  m[1] * n[4] + m[3] * n[5] + m[5],
];

export function deform(rig: Rig, local: Record<BoneName, number>) {
  const T: Affine[] = [];
  const byName = {} as Record<BoneName, Affine>;
  for (const b of BONES) {
    const own = rotAbout(local[b.name], rig.joints[b.from]);
    const m = b.parent ? compose(byName[b.parent], own) : own;
    byName[b.name] = m;
    T.push(m);
  }
  const { verts, out, weights } = rig;
  for (let i = 0; i < weights.length; i++) {
    const x = verts[i * 2], y = verts[i * 2 + 1];
    const { bone, w } = weights[i];
    const a = T[bone[0]], b = T[bone[1]];
    out[i * 2] = w[0] * (a[0] * x + a[2] * y + a[4]) + w[1] * (b[0] * x + b[2] * y + b[4]);
    out[i * 2 + 1] = w[0] * (a[1] * x + a[3] * y + a[5]) + w[1] * (b[1] * x + b[3] * y + b[5]);
  }
}

// Draw the deformed mesh. ctx must already be in sprite-pixel space.
export function drawRig(ctx: CanvasRenderingContext2D, img: CanvasImageSource, rig: Rig) {
  const { verts: s, out: d, tris } = rig;
  for (let i = 0; i < tris.length; i += 3) {
    const a = tris[i] * 2, b = tris[i + 1] * 2, c = tris[i + 2] * 2;
    const sx0 = s[a], sy0 = s[a + 1], sx1 = s[b], sy1 = s[b + 1], sx2 = s[c], sy2 = s[c + 1];
    const dx0 = d[a], dy0 = d[a + 1], dx1 = d[b], dy1 = d[b + 1], dx2 = d[c], dy2 = d[c + 1];

    // Affine map src triangle → dst triangle.
    const den = sx0 * (sy1 - sy2) + sx1 * (sy2 - sy0) + sx2 * (sy0 - sy1);
    if (Math.abs(den) < 1e-6) continue;
    const ma = (dx0 * (sy1 - sy2) + dx1 * (sy2 - sy0) + dx2 * (sy0 - sy1)) / den;
    const mc = (dx0 * (sx2 - sx1) + dx1 * (sx0 - sx2) + dx2 * (sx1 - sx0)) / den;
    const me = (dx0 * (sx1 * sy2 - sx2 * sy1) + dx1 * (sx2 * sy0 - sx0 * sy2) + dx2 * (sx0 * sy1 - sx1 * sy0)) / den;
    const mb = (dy0 * (sy1 - sy2) + dy1 * (sy2 - sy0) + dy2 * (sy0 - sy1)) / den;
    const md = (dy0 * (sx2 - sx1) + dy1 * (sx0 - sx2) + dy2 * (sx1 - sx0)) / den;
    const mf = (dy0 * (sx1 * sy2 - sx2 * sy1) + dy1 * (sx2 * sy0 - sx0 * sy2) + dy2 * (sx0 * sy1 - sx1 * sy0)) / den;

    // Grow the clip triangle a hair so neighbouring triangles don't leave seams.
    const cx = (dx0 + dx1 + dx2) / 3, cy = (dy0 + dy1 + dy2) / 3;
    const g = (x: number, y: number): [number, number] => {
      const l = Math.hypot(x - cx, y - cy) || 1;
      return [x + ((x - cx) / l) * 1.2, y + ((y - cy) / l) * 1.2];
    };
    const [px0, py0] = g(dx0, dy0), [px1, py1] = g(dx1, dy1), [px2, py2] = g(dx2, dy2);

    ctx.save();
    ctx.beginPath();
    ctx.moveTo(px0, py0);
    ctx.lineTo(px1, py1);
    ctx.lineTo(px2, py2);
    ctx.closePath();
    ctx.clip();
    ctx.transform(ma, mb, mc, md, me, mf);
    // Only sample the triangle's own source box (much cheaper than the whole sprite).
    const bx = Math.max(0, Math.floor(Math.min(sx0, sx1, sx2)) - 2), by = Math.max(0, Math.floor(Math.min(sy0, sy1, sy2)) - 2);
    const bw = Math.ceil(Math.max(sx0, sx1, sx2)) + 2 - bx, bh = Math.ceil(Math.max(sy0, sy1, sy2)) + 2 - by;
    ctx.drawImage(img, bx, by, bw, bh, bx, by, bw, bh);
    ctx.restore();
  }
}
