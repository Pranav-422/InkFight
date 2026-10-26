// What makes a dungeon boss look like itself while it fights (Sprint 8): the aura it stands in (heat, cracks, smoke, lightning, flame, steam, rings, ki, a clock),
// and the effects of its own moves that the shared special effects don't draw (the stomp's cracks, the draw's lightning, the cross-cut's three lines, the
// time stop's ripple). All of it reads the boss's palette (src/game/bossLook.ts); the Renderer (render.ts) calls in from fighter() and owns the particle lists.

import { BODY } from "./sim";
import { MOVES } from "./moves";
import type { BossLook } from "./bossLook";
import type { Particle, Ring } from "./render";
import type { Vec } from "./skeleton";
import type { Snapshot } from "./sim";
import type { StickPose } from "./stickman";

type F = Snapshot["fighters"][number];

export type FxHost = {
  ctx: CanvasRenderingContext2D;
  particles: Particle[];
  rings: Ring[];
  once: (slot: number, key: string) => boolean; // true the first time a fighter reports this key (an effect that starts on a tick, drawn on many frames)
  glow: (x: number, y: number, r: number, color: string) => void;
  shake: (n: number) => void;
};

const rnd = Math.random;
const hash = (n: number) => {
  const s = Math.sin(n * 12.9898) * 43758.5453;
  return s - Math.floor(s);
};

// A jagged line from (x0, y0) to (x1, y1): lightning, a crack. `seed` changes its shape.
function zig(ctx: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number, seed: number, jitter: number, n = 6) {
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  const dx = x1 - x0, dy = y1 - y0, l = Math.hypot(dx, dy) || 1, nx = -dy / l, ny = dx / l;
  for (let i = 1; i < n; i++) {
    const t = i / n, j = (hash(seed + i * 7.1) - 0.5) * 2 * jitter;
    ctx.lineTo(x0 + dx * t + nx * j, y0 + dy * t + ny * j);
  }
  ctx.lineTo(x1, y1);
}

// The glow round the body this tick (a faint one in the boss's colour always, harder when its state asks).
export function auraGlow(look: BossLook, f: F, now: number): { color: string; blur: number } {
  const p = look.palette, pv = f.pv ?? {};
  switch (look.aura) {
    case "lightning": return { color: p.glow, blur: 7 + Math.min(10, (pv.still ?? 0) / 2) + Math.sin(now / 40) * 2 };
    case "ki": {
      const k = Math.min(3, Math.floor((pv.charge ?? 0) / 60));
      return { color: k >= 3 ? p.sub : p.glow, blur: 6 + k * 5 };
    }
    case "clock": return { color: f.energy >= 100 ? p.main : p.glow, blur: 6 + (f.energy >= 100 ? 7 + Math.sin(now / 90) * 3 : 0) };
    case "smoke": return { color: (pv.cracks ?? 0) >= 2 ? "#ff0033" : p.glow, blur: 6 + (pv.cracks ?? 0) * 3 };
    default: return { color: p.glow, blur: 6 };
  }
}

// The part of the aura that sits behind the body (drawn before it): the ki's glow, the rings round the sorcerer.
export function auraBack(h: FxHost, look: BossLook, f: F, pose: StickPose, at: (v: Vec) => Vec, now: number) {
  if (f.action === "ko") return;
  const { ctx } = h;
  const p = look.palette, pv = f.pv ?? {};
  const hip = at(pose.joints.hip);
  ctx.save();
  if (look.aura === "ki") {
    const k = Math.min(3, Math.floor((pv.charge ?? 0) / 60));
    if (k > 0) {
      const g = ctx.createRadialGradient(hip.x, hip.y - 24, 6, hip.x, hip.y - 24, 90 + k * 8);
      g.addColorStop(0, k >= 3 ? "rgba(255,215,0,.42)" : "rgba(0,204,255,.34)");
      g.addColorStop(1, "rgba(0,204,255,0)");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.ellipse(hip.x, hip.y - 24, 52 + k * 8, 100 + k * 8, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (look.aura === "rings") {
    ctx.strokeStyle = p.main;
    for (let i = 0; i < 3; i++) {
      const k = (now / 2600 + i / 3) % 1;
      ctx.globalAlpha = 0.3 * (1 - k);
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(hip.x, hip.y - 30, 30 + k * 70, 46 + k * 80, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
  }
  ctx.restore();
}

// Ambient effects round a boss (after its body is drawn). `at`: a joint's place in the world.
export function auraFx(h: FxHost, look: BossLook, f: F, pose: StickPose, at: (v: Vec) => Vec, now: number) {
  const { ctx } = h;
  const p = look.palette, pv = f.pv ?? {};
  const j = pose.joints;
  const head = at(j.head), shoulder = at(j.shoulder), hip = at(j.hip), hand = at(j.handF), foot = at(j.footF);
  const active = f.action !== "ko";
  if (!active) return;
  switch (look.aura) {
    case "heat": {
      // Embers off the shins, and the rear shin burns while a kick is being wound up.
      if (rnd() < 0.1) h.particles.push({ x: foot.x + (rnd() - 0.5) * 12, y: foot.y - 6, vx: (rnd() - 0.5) * 0.8, vy: -1 - rnd() * 1.4, life: 0, max: 22, color: rnd() < 0.5 ? p.main : p.sub, size: 2.5 + rnd() * 2.5, g: -0.02 });
      const mv = f.move ? MOVES[f.move] : null;
      if (f.action === "kick" && mv?.crush) {
        const k = Math.min(1, f.t / mv.from);
        const back = at(j.footB);
        if (f.t < mv.to + 2) h.glow(back.x, back.y, 5 + 10 * k, p.main);
        // The stomp: the front foot drives into the floor, cracks spread from it and dust jumps.
        if (f.t < mv.from + 4) {
          ctx.save();
          ctx.strokeStyle = "#3a2a1c";
          ctx.lineWidth = 3;
          ctx.globalAlpha = 0.35 + 0.5 * k;
          for (let i = 0; i < 6; i++) {
            const dir = i < 3 ? 1 : -1, reach = 20 + (i % 3) * 22 + 60 * k;
            zig(ctx, foot.x, foot.y + 3, foot.x + dir * reach, foot.y + 3 + (i % 3) * 3, 1 + i * 3, 4, 4);
            ctx.stroke();
          }
          ctx.restore();
        }
        if (f.t === 2 && h.once(f.slot, "stomp")) {
          h.rings.push({ x: foot.x, y: foot.y, r: 8, grow: 6, life: 0, max: 14, color: p.sub, width: 4 });
          for (let i = 0; i < 8; i++) h.particles.push({ x: foot.x + (rnd() - 0.5) * 30, y: foot.y - 2, vx: (rnd() - 0.5) * 5, vy: -1 - rnd() * 3, life: 0, max: 18, color: "#b9a47c", size: 3 + rnd() * 3 });
        }
        if (f.t === mv.from && h.once(f.slot, "cannon")) h.shake(8);
      }
      break;
    }
    case "cracks": {
      // Red cracks creeping up the near arm, one more for every stack; at three the arm burns.
      const stacks = Math.min(3, pv.heat ?? 0);
      if (stacks > 0) {
        const sh = at(j.shoulder), el = at(j.elbowF), hd = at(j.handF);
        ctx.save();
        ctx.strokeStyle = p.sub;
        ctx.lineWidth = 3;
        for (let i = 0; i < stacks * 2; i++) {
          const t = 0.15 + (i / (stacks * 2)) * 0.8, a = i < stacks ? sh : el, b = i < stacks ? el : hd, tt = i < stacks ? 0.2 + 0.2 * i : 0.25 + 0.3 * (i - stacks);
          const cx = a.x + (b.x - a.x) * tt, cy = a.y + (b.y - a.y) * tt;
          zig(ctx, cx - 5, cy - 7, cx + 5, cy + 7, i * 3.3 + t, 4, 3);
          ctx.stroke();
        }
        ctx.restore();
        if (stacks >= 3) {
          h.glow(hd.x, hd.y, 7 + Math.sin(now / 50) * 2, p.sub);
          if (rnd() < 0.5) h.particles.push({ x: hd.x + (rnd() - 0.5) * 14, y: hd.y + (rnd() - 0.5) * 14, vx: (rnd() - 0.5) * 2, vy: -1 - rnd() * 1.5, life: 0, max: 16, color: rnd() < 0.5 ? p.sub : p.main, size: 2.5 });
        }
      }
      break;
    }
    case "smoke": {
      // Black and crimson smoke off the shoulders; more of it, and redder, as his guard cracks.
      const heat = 1 + (pv.cracks ?? 0) * 0.6;
      if (rnd() < 0.3 * heat) h.particles.push({ x: shoulder.x + (rnd() - 0.5) * 26, y: shoulder.y - 4, vx: (rnd() - 0.5) * 0.7, vy: -0.6 - rnd() * 0.8, life: 0, max: 36, color: rnd() < 0.3 + (pv.cracks ?? 0) * 0.15 ? "#ff0033" : "#0e0b12", size: 5 + rnd() * 5, g: -0.012 });
      break;
    }
    case "lightning": {
      // Little bolts crackling over the body; a lot more when the blade is armed, and a long one all along a draw.
      const armed = (pv.still ?? 0) >= 20, n = f.draw ? 4 : armed ? 3 : (pv.still ?? 0) > 6 ? 1 : 0;
      const seed = Math.floor(now / 55) * 3.1 + f.slot;
      ctx.save();
      ctx.lineCap = "round";
      for (let i = 0; i < n; i++) {
        const sx = head.x + (hash(seed + i) - 0.5) * 70, ex = foot.x + (hash(seed + i * 5) - 0.5) * 70;
        zig(ctx, sx, head.y - 6 + hash(seed + i * 2) * 20, ex, foot.y - hash(seed + i * 3) * 30, seed + i * 11, 12, 5);
        ctx.strokeStyle = p.main;
        ctx.lineWidth = 3;
        ctx.stroke();
        ctx.strokeStyle = p.core;
        ctx.lineWidth = 1.2;
        ctx.stroke();
      }
      ctx.restore();
      // The draw: a streak of lightning from where the dash began to where he is.
      const mv = f.move ? MOVES[f.move] : null;
      if (f.draw && mv && f.action === "attack" && f.t >= mv.from - 1 && f.t <= mv.to + 6) {
        const run = Math.min(240, Math.max(0, (f.t - mv.from + 2) * 34));
        const x0 = hip.x - f.facing * run;
        ctx.save();
        ctx.globalAlpha = Math.max(0, 1 - Math.max(0, f.t - mv.to) / 6);
        for (let i = 0; i < 3; i++) {
          zig(ctx, x0, hip.y - 20 + i * 18, hip.x, hip.y - 20 + i * 18 + (hash(seed + i) - 0.5) * 14, seed + i * 17, 9, 9);
          ctx.strokeStyle = i === 1 ? p.core : p.main;
          ctx.lineWidth = i === 1 ? 2 : 4;
          ctx.stroke();
        }
        ctx.restore();
      }
      if (armed && rnd() < 0.25) h.particles.push({ x: hand.x + (rnd() - 0.5) * 40, y: hand.y + (rnd() - 0.5) * 40, vx: 0, vy: -0.3, life: 0, max: 8, color: p.core, size: 2.6 });
      break;
    }
    case "flame": {
      // Green-and-black flame licking up off the blades, thicker while a swing winds up armoured.
      const mv = f.move ? MOVES[f.move] : null;
      const wind = (f.action === "attack" || f.action === "kick") && !!mv && f.t < mv.from;
      if (rnd() < (wind ? 0.8 : 0.22)) h.particles.push({ x: hand.x + f.facing * (10 + rnd() * 40), y: hand.y - 6 - rnd() * 40, vx: (rnd() - 0.5) * 0.6, vy: -1 - rnd() * 1.2, life: 0, max: 20, color: rnd() < 0.4 ? "#0b130d" : p.main, size: 3.5 + rnd() * 3.5, g: -0.03 });
      if (rnd() < 0.1) h.particles.push({ x: shoulder.x + (rnd() - 0.5) * 20, y: shoulder.y, vx: (rnd() - 0.5) * 0.6, vy: -0.9, life: 0, max: 22, color: p.main, size: 3, g: -0.02 });
      break;
    }
    case "steam": {
      // White steam off the shoulders, in clouds while the arms fly.
      const busy = f.action === "attack" || f.action === "kick" || f.action === "special";
      if (rnd() < (busy ? 0.4 : 0.06)) h.particles.push({ x: shoulder.x + (rnd() - 0.5) * 24, y: shoulder.y - 2, vx: (rnd() - 0.5) * 0.9, vy: -0.7 - rnd() * 0.7, life: 0, max: 32, color: "#fff4ee", size: 6 + rnd() * 6, g: -0.014 });
      break;
    }
    case "rings":
      break; // (behind the body: auraBack)
    case "ki": {
      // Sparks climbing the aura, and at the second step rocks lifting off the floor (the glow itself is behind the body: auraBack).
      const k = Math.min(3, Math.floor((pv.charge ?? 0) / 60));
      if (k > 0) {
        if (rnd() < 0.5) h.particles.push({ x: foot.x + (rnd() - 0.5) * 70, y: foot.y, vx: 0, vy: -1.5 - rnd() * 2, life: 0, max: 22, color: k >= 3 ? p.sub : p.main, size: 2 + rnd() * 2.5, g: -0.01 });
        if (k >= 2 && rnd() < 0.12) h.particles.push({ x: foot.x + (rnd() - 0.5) * 90, y: foot.y - 2, vx: 0, vy: -1.2, life: 0, max: 30, color: "#8a8478", size: 4 + rnd() * 3, g: -0.005 });
      }
      break;
    }
    case "clock": {
      // A gold clock over his head whose hand follows the meter; it flashes when the meter is full (the next thing he does is stop time).
      const full = f.energy >= 100, cx = head.x, cy = head.y - 52, r = 15;
      ctx.save();
      ctx.lineCap = "round";
      ctx.globalAlpha = 0.92;
      ctx.fillStyle = full && Math.floor(now / 110) % 2 ? "#fff7cc" : "#fffaf0";
      ctx.strokeStyle = p.main;
      ctx.lineWidth = 3.5;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.lineWidth = 1.6;
      ctx.strokeStyle = "#2a1b3d";
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2;
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(a) * (r - 4), cy + Math.sin(a) * (r - 4));
        ctx.lineTo(cx + Math.cos(a) * (r - 1.5), cy + Math.sin(a) * (r - 1.5));
        ctx.stroke();
      }
      const a = -Math.PI / 2 + (Math.min(100, f.energy) / 100) * Math.PI * 2;
      ctx.lineWidth = 2.6;
      ctx.strokeStyle = full ? "#8800ff" : "#2a1b3d";
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + Math.cos(a) * (r - 4), cy + Math.sin(a) * (r - 4));
      ctx.stroke();
      ctx.restore();
      if (full) h.glow(cx, cy, 5, p.main);
      break;
    }
    default:
      break;
  }
}

// The effects of the moves only a boss has (and of the shared kinds in a boss's hands that need its own touch). Called while the move plays.
export function moveFx(h: FxHost, look: BossLook, f: F, kind: string, pose: StickPose, at: (v: Vec) => Vec, now: number) {
  const { ctx } = h;
  const p = look.palette;
  const mv = f.move ? MOVES[f.move] : null;
  const j = pose.joints;
  const body = { x: f.x, y: f.y - BODY.h * 0.55 };
  ctx.save();
  ctx.lineCap = "round";
  if ((f.action === "attack" || f.action === "kick") && mv && f.move === "oniCut" && f.t >= mv.from - 1 && f.t <= mv.to + 5) {
    // Three blades cross at once: three lines through the point of the cut.
    const k = Math.min(1, (f.t - mv.from + 2) / 4), fade = Math.max(0, 1 - Math.max(0, f.t - mv.to) / 5);
    const cx = f.x + f.facing * 70, cy = f.y - BODY.h * 0.62;
    ctx.globalAlpha = fade;
    for (const [a, w] of [[-0.55, 5], [0.05, 6], [0.62, 5]] as const) {
      const len = 120 * k, dx = Math.cos(a) * len, dy = Math.sin(a) * len;
      ctx.strokeStyle = p.main;
      ctx.lineWidth = w + 3;
      ctx.beginPath();
      ctx.moveTo(cx - dx * f.facing, cy - dy);
      ctx.lineTo(cx + dx * f.facing, cy + dy);
      ctx.stroke();
      ctx.strokeStyle = p.core;
      ctx.lineWidth = w - 2;
      ctx.stroke();
    }
  } else if (f.action === "special" && kind === "time_stop_barrage") {
    // The tell: a gold ring spreads from him and the page holds its breath; while time is stopped, ghost fists in gold and violet fly at the target.
    if (f.t === 1 && h.once(f.slot, "stop")) {
      h.rings.push({ x: body.x, y: body.y, r: 10, grow: 26, life: 0, max: 26, color: p.main, width: 9 });
      h.rings.push({ x: body.x, y: body.y, r: 4, grow: 34, life: 0, max: 22, color: p.sub, width: 4 });
    }
    if (f.t >= 10 && f.ultEnd > 0) {
      ctx.globalAlpha = 0.6;
      for (let i = 0; i < 6; i++) {
        const x = f.x + f.facing * (45 + hash(now / 40 + i) * 70), y = f.y - BODY.h * (0.35 + hash(now / 33 + i * 3) * 0.55);
        ctx.fillStyle = i % 2 ? p.main : p.sub;
        ctx.beginPath();
        ctx.arc(x, y, 8 + hash(i + now / 50) * 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillRect(Math.min(x, x - f.facing * 34), y - 2.5, 34, 5);
      }
    }
  } else if ((f.action === "attack" || f.action === "kick") && mv && (f.move === "dempsey" || f.move === "gazelleHook") && f.t < mv.to + 3) {
    // The weave: an infinity sign of ghost glove, drawn round the chest while the punch is wound up.
    ctx.globalAlpha = 0.45 * (1 - f.t / (mv.to + 3));
    ctx.strokeStyle = p.main;
    ctx.lineWidth = 4;
    ctx.beginPath();
    for (let a = 0; a <= Math.PI * 2 + 0.05; a += 0.2) ctx.lineTo(body.x + f.facing * 30 + Math.cos(a) * 42, body.y + Math.sin(a * 2) * 18);
    ctx.stroke();
  } else if ((f.action === "attack" || f.action === "kick") && mv && f.move === "kaitenGeri" && f.t >= mv.from - 2 && f.t <= mv.to + 4) {
    // The rolling kick: a ring of black-and-crimson motion round the flip.
    ctx.globalAlpha = 0.5;
    ctx.strokeStyle = p.main;
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.arc(body.x + f.facing * 10, body.y - 10, 54, -2.4 + (f.t - mv.from) * 0.5, 0.4 + (f.t - mv.from) * 0.5);
    ctx.stroke();
  }
  if (f.action === "special" && kind === "counter" && f.landed && f.t >= 40 && f.t <= 44 && h.once(f.slot, "smash")) {
    // The counter lands: a heavy crater ring at his feet and the page jolts.
    h.rings.push({ x: f.x + f.facing * 60, y: f.y - 4, r: 14, grow: 12, life: 0, max: 16, color: p.main, width: 8 });
    h.shake(12);
    for (let i = 0; i < 14; i++) h.particles.push({ x: f.x + f.facing * 60 + (rnd() - 0.5) * 40, y: f.y - 4, vx: (rnd() - 0.5) * 7, vy: -2 - rnd() * 5, life: 0, max: 22, color: rnd() < 0.5 ? "#0e0b12" : p.main, size: 3 + rnd() * 3 });
  }
  ctx.restore();
  void j;
}
