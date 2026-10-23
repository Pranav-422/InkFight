// Canvas renderer. Draws an interpolated snapshot: the sketchbook arena, each
// fighter as a posed stickman wearing its drawing's head, special-move effects,
// impact FX (smears, rings, ink splats, hit-stop shake) and the HUD.

import { MOVES, STYLE_INFO } from "./moves";
import { ceremonyPose, poseFor } from "./poses";
import { resolvePose, type BoneName, type Vec } from "./skeleton";
import type { Sprite } from "./sprite";
import { ARENA, BEAM, BODY, TICK_HZ, WINS_NEEDED, type GameEvent, type Slot, type Snapshot, type SpecialKind } from "./sim";
import { drawStick, solveStick, STICK_REST, type StickPose } from "./stickman";

const C = {
  paper: "#f7f5f0",
  ink: "#17171a",
  muted: "#6b6a66",
  line: "#e4e1d9",
  hit: "#e5482d",
  guard: "#2f5be0",
  gold: "#f2b705",
};

type Particle = { x: number; y: number; vx: number; vy: number; life: number; max: number; text?: string; color: string; size: number };
type Ring = { x: number; y: number; r: number; grow: number; life: number; max: number; color: string; width: number };
type Stain = { x: number; y: number; r: number; life: number; color: string };
type F = Snapshot["fighters"][number];
type Doodle = { x: number; y: number; kind: number; speed: number; spin: number; size: number };

export type HudInfo = { names: [string, string]; specialNames: [string, string]; you: Slot };

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const TIP = { hand: "handF", handB: "handB", foot: "footF", footB: "footB", knee: "kneeF", head: "head" } as const;

export class Renderer {
  private ctx: CanvasRenderingContext2D;
  private particles: Particle[] = [];
  private rings: Ring[] = [];
  private stains: Stain[] = [];
  private shake = 0;
  private flash = 0; // white screen flash, frames left
  private dim: { slot: Slot; life: number } | null = null; // special start: darken + speed lines
  private banner: { text: string; color: string; life: number } | null = null;
  private lastEventId = 0;
  private fontDisplay = "sans-serif";
  private fontBody = "sans-serif";
  sprites: [Sprite | null, Sprite | null] = [null, null];
  classes: [string, string] = ["Brawler", "Brawler"];
  private limbs: [Record<BoneName, number> | null, Record<BoneName, number> | null] = [null, null];
  private trails: [StickPose[], StickPose[]] = [[], []];
  private smears: [Vec[], Vec[]] = [[], []];
  private touchdown: [number, number] = [0, 0]; // meteor landing tick already shown
  private lastNow = 0;
  private cam = { z: 1, x: ARENA.w / 2, y: ARENA.h / 2 };
  private phase: Snapshot["phase"] = "intro";
  private roundWinner: Slot | null = null;
  // Faint doodles drifting across the page behind the fight.
  private doodles: Doodle[] = Array.from({ length: 9 }, (_, i) => ({
    x: (i / 9) * ARENA.w + Math.random() * 80,
    y: 130 + Math.random() * 230,
    kind: i % 5,
    speed: 0.12 + Math.random() * 0.25,
    spin: (Math.random() - 0.5) * 0.01,
    size: 14 + Math.random() * 18,
  }));

  constructor(private canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext("2d")!;
    const css = getComputedStyle(document.body);
    this.fontDisplay = css.getPropertyValue("--font-display").trim() || "sans-serif";
    this.fontBody = css.getPropertyValue("--font-body").trim() || "sans-serif";
  }

  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = this.canvas.clientWidth;
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(((w * ARENA.h) / ARENA.w) * dpr);
    this.page = null; // re-rendered at the new size
  }

  // The notebook page never changes: draw it once per canvas size, then blit it.
  private page: HTMLCanvasElement | null = null;
  private pageImage() {
    if (this.page) return this.page;
    const c = document.createElement("canvas");
    c.width = this.canvas.width;
    c.height = this.canvas.height;
    const g = c.getContext("2d")!;
    g.scale(c.width / ARENA.w, c.width / ARENA.w);
    g.fillStyle = C.paper;
    g.fillRect(0, 0, ARENA.w, ARENA.h);
    // Notebook rules + margin, very faint: the arena is a page.
    g.strokeStyle = "rgba(47,91,224,.07)";
    g.lineWidth = 1;
    for (let y = 150; y < ARENA.ground; y += 34) {
      g.beginPath();
      g.moveTo(0, y);
      g.lineTo(ARENA.w, y);
      g.stroke();
    }
    g.strokeStyle = "rgba(229,72,45,.14)";
    g.beginPath();
    g.moveTo(64, 120);
    g.lineTo(64, ARENA.h);
    g.stroke();
    return (this.page = c);
  }

  // Turn new sim events into visual effects (deduped by id).
  ingest(s: Snapshot, hud: HudInfo) {
    for (const e of s.events) {
      if (e.id <= this.lastEventId) continue;
      this.lastEventId = e.id;
      this.effect(e, hud, s);
    }
  }

  private effect(e: GameEvent, hud: HudInfo, s: Snapshot) {
    if (e.type === "hit") {
      const color = e.blocked ? C.guard : C.hit;
      const big = e.special || e.dmg >= 10;
      const n = e.special ? 22 : 10;
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2;
        const sp = 2 + Math.random() * (e.special ? 8 : 4.5);
        this.particles.push({ x: e.x, y: e.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 1.5, life: 0, max: 18 + Math.random() * 12, color: i % 3 ? color : C.ink, size: 2 + Math.random() * 4 });
      }
      // Impact ring, plus a thin outer one for big hits.
      this.rings.push({ x: e.x, y: e.y, r: 8, grow: big ? 7 : 4.5, life: 0, max: big ? 16 : 11, color: e.blocked ? C.guard : C.ink, width: big ? 6 : 4 });
      if (big) this.rings.push({ x: e.x, y: e.y, r: 4, grow: 11, life: 0, max: 12, color, width: 2 });
      // Ink splats that land on the paper floor and slowly fade.
      if (!e.blocked) {
        for (let i = 0; i < (e.special ? 5 : 2); i++) {
          this.stains.push({ x: e.x + (Math.random() - 0.5) * 120, y: ARENA.ground + 2 + Math.random() * 10, r: 3 + Math.random() * (e.special ? 9 : 5), life: 0, color: Math.random() < 0.6 ? C.hit : C.ink });
        }
      }
      const words = e.blocked ? ["BLOCK", "NOPE"] : e.special ? ["KRAKA-BOOM", "WHAM!!", "SPLAT", "DOOM"] : ["POW", "BAM", "BONK", "SMACK", "OOF", "THWACK"];
      this.particles.push({ x: e.x, y: e.y - 24, vx: 0, vy: -1.2, life: 0, max: 36, text: `${words[e.id % words.length]} ${e.dmg}`, color, size: e.special ? 30 : 22 });
      this.shake = Math.max(this.shake, e.special ? 13 : e.blocked ? 2 : 4 + e.dmg / 3);
      if (e.special) this.flash = Math.max(this.flash, 3);
    } else if (e.type === "special") {
      this.banner = { text: `${hud.specialNames[e.by]}!`, color: C.hit, life: 80 };
      this.dim = { slot: e.by, life: 24 };
      this.shake = Math.max(this.shake, 4);
    } else if (e.type === "ko") {
      this.shake = 20;
      this.flash = 6;
      const f = s.fighters[e.loser];
      this.rings.push({ x: f.x, y: f.y - BODY.h * 0.55, r: 10, grow: 16, life: 0, max: 22, color: C.hit, width: 8 });
    }
  }

  draw(prev: Snapshot | null, cur: Snapshot, alpha: number, hud: HudInfo, now: number) {
    const { ctx, canvas } = this;
    const k = canvas.width / ARENA.w;
    ctx.setTransform(k, 0, 0, k, 0, 0);

    // Interpolate fighter/projectile positions between the last two snapshots.
    const fighters = cur.fighters.map((f, i) => {
      const p = prev?.fighters[i];
      // A teleport jumps across the arena: don't slide it between the two spots.
      return p && Math.abs(p.x - f.x) < 120 ? { ...f, x: lerp(p.x, f.x, alpha), y: lerp(p.y, f.y, alpha) } : f;
    });
    const projectiles = cur.projectiles.map((pr) => {
      const p = prev?.projectiles.find((q) => q.id === pr.id);
      return p ? { ...pr, x: lerp(p.x, pr.x, alpha) } : pr;
    });

    this.phase = cur.phase;
    this.roundWinner = cur.roundWinner;

    // Camera: push in on a special as it starts, and hard on the knockout blow.
    let tz = 1, tx = ARENA.w / 2, ty = ARENA.h / 2;
    const sp = fighters.find((f) => f.action === "special" && f.t < 26);
    if (cur.slow > 0) {
      const loser = fighters.find((f) => f.action === "ko") ?? fighters[0];
      tz = 1.35;
      tx = (loser.x + fighters[1 - loser.slot].x) / 2;
      ty = loser.y - BODY.h * 0.6;
    } else if (sp) {
      tz = 1.14;
      tx = sp.x + sp.facing * 80;
      ty = sp.y - BODY.h * 0.6;
    }
    const ease = 1 - Math.exp(-Math.min(0.05, Math.max(0.001, (now - this.lastNow) / 1000)) * 6);
    this.cam.z += (tz - this.cam.z) * ease;
    this.cam.x += (tx - this.cam.x) * ease;
    this.cam.y += (ty - this.cam.y) * ease;
    const z = this.cam.z, hw = ARENA.w / 2 / z, hh = ARENA.h / 2 / z;
    const cx = Math.min(ARENA.w - hw, Math.max(hw, this.cam.x)), cy = Math.min(ARENA.h - hh, Math.max(hh, this.cam.y));

    ctx.save();
    ctx.translate(ARENA.w / 2, ARENA.h / 2);
    ctx.scale(z, z);
    ctx.translate(-cx, -cy);
    if (this.shake > 0.3) {
      ctx.translate((Math.random() - 0.5) * this.shake, (Math.random() - 0.5) * this.shake);
      this.shake *= 0.85;
    }
    this.background();
    this.drawStains();
    if (this.dim) this.speedLines(fighters[this.dim.slot]);

    // Whoever is doing a special is drawn on top.
    const order = [...fighters].sort((a, b) => (a.action === "special" ? 1 : 0) - (b.action === "special" ? 1 : 0));
    for (const f of order) this.fighter(f, cur.specials[f.slot], cur.styles[f.slot], now, hud.you === f.slot);
    this.lastNow = now;
    for (const p of projectiles) this.projectile(p.kind, p.x, p.y, p.r, p.vx, now);
    this.fx();
    ctx.restore();

    if (this.flash > 0) {
      ctx.fillStyle = `rgba(255,255,255,${0.35 * this.flash})`;
      ctx.fillRect(0, 0, ARENA.w, ARENA.h);
      this.flash--;
    }
    // KO slow-motion: cinema bars.
    if (cur.slow > 0) {
      const bar = Math.min(1, cur.slow / 10) * 44;
      ctx.fillStyle = C.ink;
      ctx.fillRect(0, 0, ARENA.w, bar);
      ctx.fillRect(0, ARENA.h - bar, ARENA.w, bar);
    }
    this.hud(cur, hud, now);
    this.phaseText(cur);
  }

  private background() {
    const { ctx } = this;
    ctx.fillStyle = C.paper;
    ctx.fillRect(-20, -20, ARENA.w + 40, ARENA.h + 40); // under the page when the camera shakes
    ctx.drawImage(this.pageImage(), 0, 0, ARENA.w, ARENA.h);
    this.drawDoodles();
    if (this.dim) {
      ctx.fillStyle = `rgba(23,23,26,${0.4 * Math.min(1, this.dim.life / 8)})`;
      ctx.fillRect(-20, -20, ARENA.w + 40, ARENA.h + 40);
      if (--this.dim.life <= 0) this.dim = null;
    }
    // Ground: a slightly wobbly ink line.
    ctx.strokeStyle = C.ink;
    ctx.lineWidth = 3;
    ctx.lineCap = "round";
    ctx.beginPath();
    for (let x = 10; x <= ARENA.w - 10; x += 40) {
      const y = ARENA.ground + Math.sin(x * 0.05) * 1.2;
      if (x === 10) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }

  private drawDoodles() {
    const { ctx } = this;
    ctx.save();
    ctx.strokeStyle = "rgba(23,23,26,.13)";
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    for (const d of this.doodles) {
      d.x += d.speed;
      if (d.x > ARENA.w + 40) d.x = -40;
      const bob = Math.sin((d.x + d.y) / 60) * 6;
      ctx.save();
      ctx.translate(d.x, d.y + bob);
      ctx.rotate(d.x * d.spin);
      const s = d.size;
      ctx.beginPath();
      if (d.kind === 0) {
        // star
        for (let i = 0; i < 5; i++) {
          const a = (i * 4 * Math.PI) / 5 - Math.PI / 2;
          if (i) ctx.lineTo(Math.cos(a) * s, Math.sin(a) * s);
          else ctx.moveTo(Math.cos(a) * s, Math.sin(a) * s);
        }
        ctx.closePath();
      } else if (d.kind === 1) {
        // spiral scribble
        for (let a = 0; a < Math.PI * 5; a += 0.3) ctx.lineTo(Math.cos(a) * a * s * 0.07, Math.sin(a) * a * s * 0.07);
      } else if (d.kind === 2) {
        // cloud
        ctx.arc(-s * 0.5, 0, s * 0.45, Math.PI * 0.9, Math.PI * 1.9);
        ctx.arc(s * 0.1, -s * 0.15, s * 0.55, Math.PI, Math.PI * 1.95);
        ctx.arc(s * 0.7, 0, s * 0.4, Math.PI * 1.2, Math.PI * 0.1);
        ctx.lineTo(-s * 0.9, s * 0.15);
      } else if (d.kind === 3) {
        // paper plane
        ctx.moveTo(-s, 0);
        ctx.lineTo(s, -s * 0.4);
        ctx.lineTo(-s * 0.3, s * 0.5);
        ctx.closePath();
        ctx.moveTo(s, -s * 0.4);
        ctx.lineTo(-s * 0.2, s * 0.05);
      } else {
        // squiggle
        for (let x = -s; x <= s; x += 3) ctx.lineTo(x, Math.sin(x / 4) * s * 0.2);
      }
      ctx.stroke();
      ctx.restore();
    }
    ctx.restore();
  }

  private drawStains() {
    const { ctx } = this;
    this.stains = this.stains.filter((s) => ++s.life < 240).slice(-60);
    for (const s of this.stains) {
      ctx.globalAlpha = 0.55 * (1 - s.life / 240);
      ctx.fillStyle = s.color;
      ctx.beginPath();
      ctx.ellipse(s.x, s.y, s.r * 1.6, s.r * 0.5, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  // Radial speed lines around whoever just started a special.
  private speedLines(f: F) {
    const { ctx } = this;
    const cx = f.x, cy = f.y - BODY.h * 0.55;
    ctx.save();
    ctx.strokeStyle = "rgba(255,255,255,.7)";
    ctx.lineWidth = 2;
    for (let i = 0; i < 28; i++) {
      const a = (i / 28) * Math.PI * 2 + Math.random() * 0.1;
      const r0 = 140 + Math.random() * 60, r1 = r0 + 120 + Math.random() * 200;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0);
      ctx.lineTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1);
      ctx.stroke();
    }
    ctx.restore();
  }

  private fighter(f: F, special: SpecialKind, style: Snapshot["styles"][number], now: number, isYou: boolean) {
    const { ctx } = this;
    const sprite = this.sprites[f.slot];
    const cls = this.classes[f.slot];

    // Shadow shrinks while airborne.
    const air = Math.min(1, (ARENA.ground - f.y) / 200);
    ctx.fillStyle = `rgba(23,23,26,${0.12 * (1 - air * 0.6)})`;
    ctx.beginPath();
    ctx.ellipse(f.x, ARENA.ground + 4, 46 * (1 - air * 0.4), 7, 0, 0, Math.PI * 2);
    ctx.fill();

    // Round intro: taunts. After a KO / time-out: the winner celebrates.
    const ceremony = f.action === "idle" && f.grounded && !f.moving && (this.phase === "intro" || (this.phase !== "fight" && this.roundWinner === f.slot));
    const motion = ceremony ? ceremonyPose(this.phase === "intro" ? "intro" : "win", f.slot, now) : poseFor(f, special, now);
    let dx = motion.lunge * f.facing;
    if (f.action === "hit") dx += (Math.random() - 0.5) * 6;
    const h = BODY.h * 1.06;

    // Ease each joint toward its target so moves read as motion, not snapping.
    // Strikes snap faster than everything else.
    const target = resolvePose(STICK_REST, motion.pose);
    const prev = this.limbs[f.slot];
    const dt = Math.min(0.05, Math.max(0, (now - this.lastNow) / 1000));
    const striking = f.action === "attack" || f.action === "kick" || f.action === "special";
    const k = 1 - Math.exp(-dt * (striking ? 38 : 22));
    const cur = {} as Record<BoneName, number>;
    for (const name of Object.keys(target) as BoneName[]) {
      const p0 = prev?.[name] ?? target[name];
      cur[name] = p0 + Math.atan2(Math.sin(target[name] - p0), Math.cos(target[name] - p0)) * k;
    }
    this.limbs[f.slot] = cur;
    const pose = solveStick(cur);
    // Keep the lowest foot on the floor: bent legs crouch the body instead of sinking it.
    const lift = f.grounded && f.action !== "ko" ? -Math.max(pose.joints.footF.y, pose.joints.footB.y) : 0;
    const dir = motion.flip ? -f.facing : f.facing;
    const toWorld = (v: Vec): Vec => ({ x: f.x + dx + dir * v.x, y: f.y + lift + v.y });

    // Smear trail on the striking limb, like the swoosh in hand-drawn fight animation.
    const smear = this.smears[f.slot];
    const mv = f.move ? MOVES[f.move] : null;
    const normal = (f.action === "attack" || f.action === "kick") && mv;
    const smearing = (normal && f.t >= mv.from - 2 && f.t <= mv.to + 2) || (f.action === "special" && (special === "uppercut" || special === "slash" || special === "spiral") && f.t >= 4 && f.t <= 24);
    if (smearing) {
      smear.unshift(toWorld(pose.joints[normal ? TIP[mv.tip] : "handF"]));
      smear.length = Math.min(smear.length, 7);
    } else smear.length = 0;
    const chain = normal ? STYLE_INFO[style][f.action === "attack" ? "punch" : "kick"] : null;
    const finisher = !!chain && chain.length > 1 && f.combo === chain.length - 1;
    if (smear.length > 2) {
      const color = f.action === "special" ? (special === "uppercut" ? C.gold : C.hit) : finisher ? C.hit : "rgba(23,23,26,.55)";
      this.drawSmear(smear, color, f.action === "special" || finisher ? 26 : 18);
    }

    // Afterimages while a special is out.
    const trail = this.trails[f.slot];
    if (f.action === "special" && special !== "beam") {
      trail.unshift(pose);
      trail.length = Math.min(trail.length, 5);
    } else trail.length = 0;

    const hurt = f.action === "hit" && f.t < 8;
    const accent = cls === "Tank" || cls === "Mage" ? C.guard : cls === "Brawler" ? C.hit : C.gold;
    const look = { ink: hurt ? C.hit : (sprite?.ink ?? C.ink), head: sprite?.head ?? null, prop: sprite?.prop ?? null, cls, accent, width: sprite?.width ?? 7 };

    ctx.save();
    ctx.translate(f.x + dx, f.y + lift);
    ctx.scale(dir, 1);
    if (motion.fall) {
      // Fall backwards, unless that would land outside the arena. Lift a little so
      // the flopped-out limbs lie on the ground instead of through it.
      ctx.translate(0, (motion.fall / 1.45) * 34);
      const behind = f.x - f.facing * h;
      ctx.rotate(behind < 0 || behind > ARENA.w ? -motion.fall : motion.fall);
    }
    const base = (f.action === "ko" ? 0.75 : 1) * motion.alpha;
    trail.slice(1).forEach((p, i) => {
      ctx.globalAlpha = (0.24 - i * 0.05) * Math.max(0.3, motion.alpha);
      drawStick(ctx, p, { ...look, ink: C.hit, head: null, prop: null });
    });
    ctx.globalAlpha = base;
    if (f.armorTicks > 0 || f.action === "special") {
      ctx.shadowColor = f.action === "special" ? C.hit : C.guard;
      ctx.shadowBlur = 12; // blur cost grows with radius, and it runs per stroke
    }
    if (base > 0.02) drawStick(ctx, pose, look);
    ctx.restore();
    ctx.globalAlpha = 1;

    if (f.action === "special") this.specialFx(f, special, pose, toWorld, now);

    if (f.blocking) {
      ctx.strokeStyle = C.guard;
      ctx.lineWidth = 5;
      ctx.globalAlpha = 0.75;
      ctx.beginPath();
      ctx.arc(f.x + f.facing * 10, f.y - BODY.h * 0.55, 70, f.facing > 0 ? -0.9 : Math.PI - 0.9, f.facing > 0 ? 0.9 : Math.PI + 0.9);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    if (isYou && f.action !== "ko" && motion.alpha > 0.5) {
      const top = f.y + lift - h - 16;
      ctx.fillStyle = C.hit;
      ctx.beginPath();
      ctx.moveTo(f.x - 8, top - 10);
      ctx.lineTo(f.x + 8, top - 10);
      ctx.lineTo(f.x, top);
      ctx.fill();
      ctx.font = `800 13px ${this.fontDisplay}`;
      ctx.textAlign = "center";
      ctx.fillText("YOU", f.x, top - 15);
    }
  }

  // Tapered swoosh through recent positions of a fist / foot.
  private drawSmear(pts: Vec[], color: string, width: number) {
    const { ctx } = this;
    const left: Vec[] = [], right: Vec[] = [];
    for (let i = 0; i < pts.length; i++) {
      const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
      const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
      const nx = -(b.y - a.y) / len, ny = (b.x - a.x) / len;
      const w = (width / 2) * (1 - i / pts.length);
      left.push({ x: pts[i].x + nx * w, y: pts[i].y + ny * w });
      right.push({ x: pts[i].x - nx * w, y: pts[i].y - ny * w });
    }
    ctx.save();
    ctx.fillStyle = color;
    ctx.globalAlpha = 0.85;
    ctx.beginPath();
    left.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
    for (let i = right.length - 1; i >= 0; i--) ctx.lineTo(right[i].x, right[i].y);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  private specialFx(f: F, kind: SpecialKind, pose: StickPose, toWorld: (v: Vec) => Vec, now: number) {
    const { ctx } = this;
    const t = f.t;
    const hand = toWorld(pose.joints.handF);
    const j = pose.joints;
    const mid = toWorld({ x: (j.handF.x + j.handB.x) / 2, y: (j.handF.y + j.handB.y) / 2 });
    ctx.save();
    if (kind === "beam") {
      if (t < BEAM.fireFrom) {
        // Charging ball between the cupped hands, with sparks being sucked in.
        this.glowBall(mid.x, mid.y, 6 + t * 0.55 + Math.sin(now / 30) * 2, C.guard);
        for (let i = 0; i < 3; i++) {
          const a = Math.random() * Math.PI * 2, d = 40 + Math.random() * 40;
          this.particles.push({ x: mid.x + Math.cos(a) * d, y: mid.y + Math.sin(a) * d, vx: -Math.cos(a) * 3, vy: -Math.sin(a) * 3, life: 0, max: 12, color: "#9fb6ff", size: 2.5 });
        }
      } else if (t <= BEAM.fireTo + 6) {
        const fade = t > BEAM.fireTo ? 1 - (t - BEAM.fireTo) / 6 : 1;
        const end = f.facing > 0 ? ARENA.w + 20 : -20;
        const thick = (30 + Math.sin(now / 18) * 6) * fade;
        ctx.globalAlpha = fade;
        ctx.shadowColor = C.guard;
        ctx.shadowBlur = 30;
        ctx.fillStyle = C.guard;
        ctx.fillRect(Math.min(hand.x, end), hand.y - thick / 2, Math.abs(end - hand.x), thick);
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(Math.min(hand.x, end), hand.y - thick / 5, Math.abs(end - hand.x), (thick * 2) / 5);
        this.glowBall(hand.x, hand.y, thick * 0.9, C.guard);
        this.shake = Math.max(this.shake, 3);
      }
    } else if (kind === "spiral" && t < 40) {
      // Spinning sphere in the palm: a glowing core with orbiting rings.
      const r = Math.min(22, 8 + t * 1.2);
      const cx = hand.x + f.facing * 10;
      this.glowBall(cx, hand.y, r, "#5aa2ff");
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 2.5;
      for (let i = 0; i < 3; i++) {
        ctx.beginPath();
        ctx.ellipse(cx, hand.y, r * 1.25, r * 0.5, now / 45 + (i * Math.PI * 2) / 3, 0, Math.PI * 1.3);
        ctx.stroke();
      }
    } else if (kind === "slash" && t >= 4 && t <= 22) {
      // Big crescent swipe in front of the blade.
      ctx.globalAlpha = 1 - (t - 4) / 18;
      ctx.translate(f.x + f.facing * 40, f.y - BODY.h * 0.55);
      ctx.scale(f.facing, 1);
      ctx.fillStyle = C.hit;
      ctx.beginPath();
      ctx.arc(0, 0, 95, -1.3, 1.1);
      ctx.arc(-22, 0, 80, 1.1, -1.3, true);
      ctx.fill();
    } else if (kind === "teleport" && t >= 2 && t <= 14) {
      // Vanishing streaks.
      ctx.strokeStyle = C.ink;
      ctx.lineWidth = 2;
      ctx.globalAlpha = 0.6;
      for (let i = 0; i < 7; i++) {
        const x = f.x + (Math.random() - 0.5) * 60, y = f.y - Math.random() * BODY.h;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x, y - 50);
        ctx.stroke();
      }
    } else if (kind === "barrage" && t >= 6 && t < 42) {
      // Ghost fists everywhere in front.
      ctx.fillStyle = C.ink;
      ctx.globalAlpha = 0.35;
      for (let i = 0; i < 5; i++) {
        const x = f.x + f.facing * (55 + Math.random() * 45), y = f.y - BODY.h * (0.45 + Math.random() * 0.4);
        ctx.beginPath();
        ctx.arc(x, y, 7 + Math.random() * 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillRect(Math.min(x, x - f.facing * 26), y - 2, 26, 4);
      }
    } else if (kind === "meteor") {
      if (t > 14 && !f.hitN) {
        const foot = toWorld(j.footF);
        for (let i = 0; i < 3; i++) {
          this.particles.push({ x: foot.x + (Math.random() - 0.5) * 16, y: foot.y - 10, vx: -f.facing * Math.random() * 2, vy: -2 - Math.random() * 3, life: 0, max: 16, color: i ? C.gold : C.hit, size: 4 + Math.random() * 5 });
        }
      }
      if (f.hitN && this.touchdown[f.slot] !== f.hitN) {
        this.touchdown[f.slot] = f.hitN;
        this.rings.push({ x: f.x, y: ARENA.ground, r: 20, grow: 12, life: 0, max: 18, color: C.ink, width: 6 });
        this.shake = Math.max(this.shake, 14);
        for (let i = 0; i < 18; i++) {
          this.particles.push({ x: f.x + (Math.random() - 0.5) * 60, y: ARENA.ground - 4, vx: (Math.random() - 0.5) * 9, vy: -3 - Math.random() * 6, life: 0, max: 24, color: C.muted, size: 3 + Math.random() * 4 });
        }
      }
    } else if (kind === "uppercut" && t >= 8 && t <= 16) {
      for (let i = 0; i < 2; i++) {
        this.particles.push({ x: hand.x, y: hand.y, vx: (Math.random() - 0.5) * 3, vy: -1 - Math.random() * 2, life: 0, max: 14, color: i ? C.gold : C.hit, size: 5 + Math.random() * 4 });
      }
    }
    ctx.restore();
  }

  private glowBall(x: number, y: number, r: number, color: string) {
    const { ctx } = this;
    ctx.save();
    ctx.shadowColor = color;
    ctx.shadowBlur = 26;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.arc(x, y, r * 0.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  private projectile(kind: SpecialKind, x: number, y: number, r: number, vx: number, now: number) {
    const { ctx } = this;
    const d = Math.sign(vx);
    ctx.save();
    if (kind === "arrow") {
      ctx.strokeStyle = C.ink;
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(x - d * 40, y);
      ctx.lineTo(x + d * 10, y);
      ctx.moveTo(x + d * 10, y);
      ctx.lineTo(x - d * 4, y - 9);
      ctx.moveTo(x + d * 10, y);
      ctx.lineTo(x - d * 4, y + 9);
      ctx.stroke();
      ctx.strokeStyle = "rgba(23,23,26,.25)";
      ctx.beginPath();
      ctx.moveTo(x - d * 40, y);
      ctx.lineTo(x - d * 120, y);
      ctx.stroke();
    } else if (kind === "wave") {
      // A crescent of ground rolling forward, kicking up dust.
      ctx.fillStyle = C.ink;
      ctx.beginPath();
      ctx.moveTo(x - d * 40, ARENA.ground);
      ctx.quadraticCurveTo(x, ARENA.ground - r * 3.2, x + d * 18, ARENA.ground);
      ctx.fill();
      ctx.strokeStyle = C.gold;
      ctx.lineWidth = 3;
      ctx.stroke();
      if (Math.random() < 0.7) this.particles.push({ x: x - d * 10, y: ARENA.ground - 6, vx: -d * Math.random() * 2, vy: -2 - Math.random() * 3, life: 0, max: 18, color: C.muted, size: 3 + Math.random() * 3 });
    } else {
      const color = kind === "orb" ? C.gold : C.guard;
      const rr = r * (1 + Math.sin(now / 60) * 0.08);
      // Comet tail.
      ctx.globalAlpha = 0.35;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(x, y - rr);
      ctx.lineTo(x - d * rr * 4, y);
      ctx.lineTo(x, y + rr);
      ctx.fill();
      ctx.globalAlpha = 1;
      this.glowBall(x, y, rr, color);
      ctx.strokeStyle = C.ink;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(x, y, rr, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  }

  private fx() {
    const { ctx } = this;
    this.rings = this.rings.filter((r) => r.life < r.max);
    for (const r of this.rings) {
      r.life++;
      r.r += r.grow * (1 - r.life / r.max);
      ctx.globalAlpha = 1 - r.life / r.max;
      ctx.strokeStyle = r.color;
      ctx.lineWidth = r.width * (1 - r.life / r.max) + 1;
      ctx.beginPath();
      ctx.arc(r.x, r.y, r.r, 0, Math.PI * 2);
      ctx.stroke();
    }
    this.particles = this.particles.filter((p) => p.life < p.max).slice(-400);
    for (const p of this.particles) {
      p.life++;
      p.x += p.vx;
      p.y += p.vy;
      if (!p.text) p.vy += 0.25;
      ctx.globalAlpha = Math.max(0, 1 - p.life / p.max);
      ctx.fillStyle = p.color;
      if (p.text) {
        ctx.font = `800 ${p.size}px ${this.fontDisplay}`;
        ctx.textAlign = "center";
        ctx.lineWidth = 5;
        ctx.strokeStyle = C.paper;
        ctx.strokeText(p.text, p.x, p.y);
        ctx.fillText(p.text, p.x, p.y);
      } else {
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size / 2, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
  }

  private hud(s: Snapshot, hud: HudInfo, now: number) {
    const { ctx } = this;
    const barW = 360;
    const pad = 28;
    // On a phone the arena is drawn at ~0.4x; enlarge HUD text so it stays readable.
    const z = Math.min(1.9, Math.max(1, 560 / this.canvas.clientWidth));

    for (const slot of [0, 1] as Slot[]) {
      const f = s.fighters[slot];
      const left = slot === 0;
      const x = left ? pad : ARENA.w - pad - barW;
      const hpPct = f.hp / s.maxHp[slot];

      ctx.font = `800 ${Math.round(22 * z)}px ${this.fontDisplay}`;
      ctx.fillStyle = C.ink;
      ctx.textAlign = left ? "left" : "right";
      const name = z > 1.2 ? (hud.you === slot ? "YOU" : hud.names[slot]) : hud.names[slot] + (hud.you === slot ? "  (you)" : "");
      ctx.fillText(name, left ? x : x + barW, 40, barW - 70);

      // Round wins as dots next to the name
      for (let i = 0; i < WINS_NEEDED; i++) {
        const cx = left ? x + barW - 10 - i * 18 : x + 10 + i * 18;
        ctx.beginPath();
        ctx.arc(cx, 33, 6, 0, Math.PI * 2);
        ctx.fillStyle = i < s.wins[slot] ? C.gold : C.line;
        ctx.fill();
      }

      // HP bar
      this.bar(x, 52, barW, 16, hpPct, hpPct > 0.5 ? C.ink : hpPct > 0.25 ? C.gold : C.hit, !left);
      if (z < 1.2) {
        ctx.font = `600 12px ${this.fontBody}`;
        ctx.fillStyle = C.muted;
        ctx.fillText(`${Math.ceil(f.hp)} / ${s.maxHp[slot]}  ·  ${s.styles[slot]}`, left ? x : x + barW, 98);
      }

      // Energy / special meter
      const full = f.energy >= 100;
      const ex = left ? x + 80 : x;
      this.bar(ex, 76, barW - 80, 7, f.energy / 100, full ? (Math.floor(now / 200) % 2 ? C.hit : C.gold) : C.gold, !left);
      if (full) {
        ctx.font = `800 ${Math.round(12 * z)}px ${this.fontDisplay}`;
        ctx.fillStyle = C.hit;
        ctx.textAlign = left ? "right" : "left";
        ctx.fillText("SPECIAL READY", left ? x + barW : x, 98 + 6 * (z - 1));
      }
      // Combo counter while a chain is running.
      if ((f.action === "attack" || f.action === "kick") && f.combo > 0) {
        ctx.font = `800 ${Math.round(18 * z)}px ${this.fontDisplay}`;
        ctx.fillStyle = C.hit;
        ctx.textAlign = left ? "left" : "right";
        ctx.fillText(`${f.combo + 1} HIT COMBO`, left ? x : x + barW, 124 + 8 * (z - 1));
      }
    }

    // Round timer
    const secs = Math.ceil(s.timer / TICK_HZ);
    ctx.textAlign = "center";
    ctx.font = `800 ${Math.round(36 * Math.min(z, 1.5))}px ${this.fontDisplay}`;
    ctx.fillStyle = secs <= 10 ? C.hit : C.ink;
    ctx.fillText(String(Math.max(0, secs)), ARENA.w / 2, 62);
    ctx.font = `600 ${Math.round(11 * z)}px ${this.fontBody}`;
    ctx.fillStyle = C.muted;
    ctx.fillText(`ROUND ${s.round}`, ARENA.w / 2, 82 + 8 * (z - 1));
  }

  private bar(x: number, y: number, w: number, h: number, pct: number, color: string, fromRight: boolean) {
    const { ctx } = this;
    const r = h / 2;
    ctx.fillStyle = C.line;
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, r);
    ctx.fill();
    const fw = Math.max(0, Math.min(1, pct)) * w;
    if (fw > 0) {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.roundRect(fromRight ? x + w - fw : x, y, fw, h, Math.min(r, fw / 2));
      ctx.fill();
    }
  }

  private phaseText(s: Snapshot) {
    let text: string | null = null;
    let color = C.ink;
    if (s.phase === "intro") text = s.phaseT < 90 ? `ROUND ${s.round}` : "READY…";
    else if (s.phase === "fight" && s.phaseT < 45) {
      text = "FIGHT!";
      color = C.hit;
    } else if (s.phase === "roundEnd") {
      text = s.roundWinner === null ? "DRAW!" : s.roundReason === "ko" ? "K.O.!" : "TIME!";
      color = C.hit;
    }
    if (this.banner) {
      this.big(this.banner.text, this.banner.color, 190, 38);
      if (--this.banner.life <= 0) this.banner = null;
    }
    if (text) this.big(text, color, ARENA.h / 2 - 20, 72);
  }

  private big(text: string, color: string, y: number, size: number) {
    const { ctx } = this;
    ctx.save();
    ctx.textAlign = "center";
    ctx.font = `800 ${size}px ${this.fontDisplay}`;
    ctx.lineWidth = size / 6;
    ctx.strokeStyle = C.paper;
    ctx.lineJoin = "round";
    ctx.strokeText(text, ARENA.w / 2, y);
    ctx.fillStyle = color;
    ctx.fillText(text, ARENA.w / 2, y);
    ctx.restore();
  }
}
