// Canvas renderer. Draws an interpolated snapshot: the sketchbook arena, each
// fighter as a posed stickman wearing its drawing's head, projectiles, hit FX and HUD.

import { poseFor } from "./poses";
import { resolvePose, type BoneName } from "./skeleton";
import type { Sprite } from "./sprite";
import { drawStick, solveStick, STICK_REST, type StickPose } from "./stickman";
import { ARENA, BODY, TICK_HZ, WINS_NEEDED, type GameEvent, type Slot, type Snapshot, type SpecialKind } from "./sim";

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

export type HudInfo = { names: [string, string]; specialNames: [string, string]; you: Slot };

export class Renderer {
  private ctx: CanvasRenderingContext2D;
  private particles: Particle[] = [];
  private shake = 0;
  private banner: { text: string; color: string; life: number } | null = null;
  private lastEventId = 0;
  private fontDisplay = "sans-serif";
  private fontBody = "sans-serif";
  sprites: [Sprite | null, Sprite | null] = [null, null];
  classes: [string, string] = ["Brawler", "Brawler"];
  private trails: [StickPose[], StickPose[]] = [[], []];
  private limbs: [Record<BoneName, number> | null, Record<BoneName, number> | null] = [null, null];
  private lastNow = 0;

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
  }

  // Turn new server events into visual effects (deduped by id).
  ingest(s: Snapshot, hud: HudInfo) {
    for (const e of s.events) {
      if (e.id <= this.lastEventId) continue;
      this.lastEventId = e.id;
      this.effect(e, hud);
    }
  }

  private effect(e: GameEvent, hud: HudInfo) {
    if (e.type === "hit") {
      const color = e.blocked ? C.guard : C.hit;
      const n = e.special ? 18 : 9;
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2;
        const sp = 2 + Math.random() * (e.special ? 7 : 4);
        this.particles.push({ x: e.x, y: e.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 1, life: 0, max: 18 + Math.random() * 10, color, size: 2 + Math.random() * 3 });
      }
      const words = e.blocked ? ["BLOCK", "NOPE"] : e.special ? ["KRAKA-BOOM", "WHAM!!", "SPLAT"] : ["POW", "BAM", "BONK", "SMACK", "OOF"];
      this.particles.push({ x: e.x, y: e.y - 20, vx: 0, vy: -1.2, life: 0, max: 36, text: `${words[e.id % words.length]} ${e.dmg}`, color, size: e.special ? 30 : 22 });
      this.shake = Math.max(this.shake, e.special ? 12 : e.blocked ? 2 : 5);
    } else if (e.type === "special") {
      this.banner = { text: `${hud.specialNames[e.by]}!`, color: C.hit, life: 70 };
    } else if (e.type === "ko") {
      this.shake = 18;
    }
  }

  draw(prev: Snapshot | null, cur: Snapshot, alpha: number, hud: HudInfo, now: number) {
    const { ctx, canvas } = this;
    const k = canvas.width / ARENA.w;
    ctx.setTransform(k, 0, 0, k, 0, 0);

    // Interpolate fighter/projectile positions between the last two snapshots.
    const lerp = (a: number, b: number) => a + (b - a) * alpha;
    const fighters = cur.fighters.map((f, i) => {
      const p = prev?.fighters[i];
      return p ? { ...f, x: lerp(p.x, f.x), y: lerp(p.y, f.y) } : f;
    });
    const projectiles = cur.projectiles.map((pr) => {
      const p = prev?.projectiles.find((q) => q.id === pr.id);
      return p ? { ...pr, x: lerp(p.x, pr.x) } : pr;
    });

    ctx.save();
    if (this.shake > 0.3) {
      ctx.translate((Math.random() - 0.5) * this.shake, (Math.random() - 0.5) * this.shake);
      this.shake *= 0.85;
    }
    this.background();

    fighters.forEach((f) => this.fighter(f, cur.specials[f.slot], now, hud.you === f.slot));
    this.lastNow = now;
    for (const p of projectiles) this.projectile(p.kind, p.x, p.y, p.r, p.vx, now);
    this.fx();
    ctx.restore();

    this.hud(cur, hud, now);
    this.phaseText(cur);
  }

  private background() {
    const { ctx } = this;
    ctx.fillStyle = C.paper;
    ctx.fillRect(-20, -20, ARENA.w + 40, ARENA.h + 40);
    // Notebook rules + margin, very faint: the arena is a page.
    ctx.strokeStyle = "rgba(47,91,224,.07)";
    ctx.lineWidth = 1;
    for (let y = 150; y < ARENA.ground; y += 34) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(ARENA.w, y);
      ctx.stroke();
    }
    ctx.strokeStyle = "rgba(229,72,45,.14)";
    ctx.beginPath();
    ctx.moveTo(64, 120);
    ctx.lineTo(64, ARENA.h);
    ctx.stroke();
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

  private fighter(f: Snapshot["fighters"][number], special: SpecialKind, now: number, isYou: boolean) {
    const { ctx } = this;
    const sprite = this.sprites[f.slot];

    // Shadow shrinks while airborne.
    const air = Math.min(1, (ARENA.ground - f.y) / 200);
    ctx.fillStyle = `rgba(23,23,26,${0.12 * (1 - air * 0.6)})`;
    ctx.beginPath();
    ctx.ellipse(f.x, ARENA.ground + 4, 46 * (1 - air * 0.4), 7, 0, 0, Math.PI * 2);
    ctx.fill();

    let dx = 0, dy = 0;
    const motion = poseFor(f, special, now);
    dx = motion.lunge * f.facing;
    if (f.action === "idle" && f.grounded && f.moving) dy = -Math.abs(Math.sin(now / 105)) * 5;
    if (f.action === "hit") dx += (Math.random() - 0.5) * 6;
    const h = BODY.h * 1.06;

    // Ease each joint toward its target so moves read as motion, not snapping.
    const target = resolvePose(STICK_REST, motion.pose);
    const prev = this.limbs[f.slot];
    const dt = Math.min(0.05, Math.max(0, (now - this.lastNow) / 1000));
    const k = 1 - Math.exp(-dt * 24);
    const cur = {} as Record<BoneName, number>;
    for (const name of Object.keys(target) as BoneName[]) {
      const p0 = prev?.[name] ?? target[name];
      cur[name] = p0 + Math.atan2(Math.sin(target[name] - p0), Math.cos(target[name] - p0)) * k;
    }
    this.limbs[f.slot] = cur;
    const pose = solveStick(cur);

    // Afterimages while a special (or a punch/kick's active frames) is out.
    const trail = this.trails[f.slot];
    const striking = f.action === "special" || (f.action === "attack" && f.t >= 6 && f.t <= 12) || f.action === "kick";
    if (striking) {
      trail.unshift(pose);
      trail.length = Math.min(trail.length, 5);
    } else trail.length = 0;

    const hurt = f.action === "hit" && f.t < 8;
    const ink = hurt ? C.hit : (sprite?.ink ?? C.ink);
    const cls = this.classes[f.slot];
    const accent = cls === "Tank" || cls === "Mage" ? C.guard : cls === "Brawler" ? C.hit : C.gold;

    ctx.save();
    ctx.translate(f.x + dx, f.y + dy);
    ctx.scale(f.facing, 1);
    if (motion.fall) {
      // Fall backwards, unless that would land outside the arena. Lift a little so
      // the flopped-out limbs lie on the ground instead of through it.
      ctx.translate(0, (motion.fall / 1.45) * 16);
      const behind = f.x - f.facing * h;
      ctx.rotate(behind < 0 || behind > ARENA.w ? -motion.fall : motion.fall);
    }
    if (f.action === "ko") ctx.globalAlpha = 0.75;
    trail.slice(1).forEach((p, i) => {
      ctx.globalAlpha = 0.22 - i * 0.04;
      drawStick(ctx, p, { ink: f.action === "special" ? C.hit : C.muted, head: null, cls, accent });
    });
    ctx.globalAlpha = f.action === "ko" ? 0.75 : 1;
    if (f.armorTicks > 0 || f.action === "special") {
      ctx.shadowColor = f.action === "special" ? C.hit : C.guard;
      ctx.shadowBlur = 22;
    }
    drawStick(ctx, pose, { ink, head: sprite?.head ?? null, cls, accent });
    ctx.restore();

    if (f.blocking) {
      ctx.strokeStyle = C.guard;
      ctx.lineWidth = 5;
      ctx.globalAlpha = 0.75;
      ctx.beginPath();
      ctx.arc(f.x + f.facing * 10, f.y - BODY.h * 0.55, 70, f.facing > 0 ? -0.9 : Math.PI - 0.9, f.facing > 0 ? 0.9 : Math.PI + 0.9);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    if (isYou && f.action !== "ko") {
      const top = f.y - h - 16 + dy;
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

  private projectile(kind: string, x: number, y: number, r: number, vx: number, now: number) {
    const { ctx } = this;
    ctx.save();
    if (kind === "arrow") {
      const d = Math.sign(vx);
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
    } else {
      const color = kind === "orb" ? C.gold : C.guard;
      ctx.shadowColor = color;
      ctx.shadowBlur = 24;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(x, y, r * (1 + Math.sin(now / 60) * 0.08), 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = C.ink;
      ctx.lineWidth = 3;
      ctx.stroke();
    }
    ctx.restore();
  }

  private fx() {
    const { ctx } = this;
    this.particles = this.particles.filter((p) => p.life < p.max);
    for (const p of this.particles) {
      p.life++;
      p.x += p.vx;
      p.y += p.vy;
      if (!p.text) p.vy += 0.25;
      const a = 1 - p.life / p.max;
      ctx.globalAlpha = Math.max(0, a);
      ctx.fillStyle = p.color;
      if (p.text) {
        ctx.font = `800 ${p.size}px ${this.fontDisplay}`;
        ctx.textAlign = "center";
        ctx.lineWidth = 5;
        ctx.strokeStyle = C.paper;
        ctx.strokeText(p.text, p.x, p.y);
        ctx.fillText(p.text, p.x, p.y);
      } else {
        ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
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
        ctx.fillText(`${Math.ceil(f.hp)} / ${s.maxHp[slot]}`, left ? x : x + barW, 84);
      }

      // Energy / special meter
      const full = f.energy >= 100;
      const ex = left ? x + 80 : x;
      this.bar(ex, 76, barW - 80, 7, f.energy / 100, full ? (Math.floor(now / 200) % 2 ? C.hit : C.gold) : C.gold, !left);
      if (full) {
        ctx.font = `800 ${Math.round(12 * z)}px ${this.fontDisplay}`;
        ctx.fillStyle = C.hit;
        ctx.textAlign = left ? "right" : "left";
        ctx.fillText("SPECIAL READY", left ? x + barW : x, 100 + 6 * (z - 1));
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
    this.roundRect(x, y, w, h, r);
    ctx.fill();
    const fw = Math.max(0, Math.min(1, pct)) * w;
    if (fw > 0) {
      ctx.fillStyle = color;
      this.roundRect(fromRight ? x + w - fw : x, y, fw, h, Math.min(r, fw / 2));
      ctx.fill();
    }
  }

  private roundRect(x: number, y: number, w: number, h: number, r: number) {
    const { ctx } = this;
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, r);
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
      this.big(this.banner.text, this.banner.color, 190, 34);
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
