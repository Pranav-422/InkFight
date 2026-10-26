// Canvas renderer. Draws an interpolated snapshot: the sketchbook arena, each
// fighter as a posed stickman wearing its drawing's head, special-move effects,
// impact FX (smears, rings, ink splats, hit-stop shake) and the HUD.

import { normClass } from "../lib/stats";
import { ARENA_TUNE } from "./arena";
import { bossLook } from "./bossLook";
import { auraBack, auraFx, auraGlow, moveFx, type FxHost } from "./bossFx";
import { starColor } from "./arenaStars";
import { ArenaView, ROW } from "./arenaRender";
import { getReduceFlashes } from "./flashes";
import { play, type Sfx } from "./sound";
import { itemOf, MOVES, SKILL_INFO, STYLE_INFO, type SideSkill } from "./moves";
import { ceremonyPose, poseFor } from "./poses";
import { resolvePose, type BoneName, type Vec } from "./skeleton";
import type { Sprite } from "./sprite";
import { ARENA, BEAM, BODY, SPECIAL_DURATION, TICK_HZ, TIME_STOP, WINS_NEEDED, type GameEvent, type PassiveId, type Slot, type Snapshot, type SpecialKind } from "./sim";
import { AVERAGE_BUILD, drawStick, solveStick, STICK_REST, type Build, type StickPose } from "./stickman";

const C = {
  paper: "#fff9ed",
  ink: "#17171a",
  muted: "#6b6a66",
  line: "#e4e1d9",
  hit: "#e5482d",
  guard: "#2f5be0",
  gold: "#f2b705",
};

export type Particle = { x: number; y: number; vx: number; vy: number; life: number; max: number; text?: string; color: string; size: number; g?: number }; // g: gravity (default 0.25; steam rises)
export type Ring = { x: number; y: number; r: number; grow: number; life: number; max: number; color: string; width: number };
type Stain = { x: number; y: number; r: number; life: number; color: string };
type F = Snapshot["fighters"][number];
type Doodle = { x: number; y: number; kind: number; speed: number; spin: number; size: number };

// buffs: the admin buff is on for that side (shown, so the other player knows).
export type HudInfo = { names: [string, string]; specialNames: [string, string]; ultNames?: [string, string]; you: Slot; buffs?: [boolean, boolean] };

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
// Element status colours: the halo on the stickman and the badge beside its head.
const STATUS_COLOR: Record<string, string> = { FIRE: "#ff8a1f", ELECTRIC: "#3d8bff", FROST: "#6fc3ee", POISON: "#3fae3a", BLEED: "#d3202a", GRAVITY: "#8a4fe0" };
const TIP = { hand: "handF", handB: "handB", foot: "footF", footB: "footB", knee: "kneeF", head: "head" } as const;

export class Renderer {
  private ctx: CanvasRenderingContext2D;
  private particles: Particle[] = [];
  private rings: Ring[] = [];
  private stains: Stain[] = [];
  private shake = 0;
  private flash = 0; // white screen flash, frames left
  private dim: { slot: Slot; life: number } | null = null; // special start: darken + speed lines
  private impact: { x: number; y: number; until: number } | null = null; // impact frame: where (world) and until when
  private view = { cx: ARENA.w / 2, cy: ARENA.h / 2, z: 1 }; // the camera as drawn this frame (world → screen)
  private formTint = 0; // 0..1: the page takes the boss's second colour once its second form is out (eased)
  private cine = 0; // 0..1: how far into the ultimate's blackout we are (eased)
  private banner: { text: string; color: string; life: number } | null = null;
  private arenaView: ArenaView | null = null; // an arena fight's backdrop and live hazards (src/game/arenaRender.ts)
  private lastEventId = 0;
  private invert = 0; // 0..1: the page inverted while the Overdue's time is stopped (eased)
  private epoch: [number, number] = [0, 0]; // counts each fighter's moves, so an effect that starts on a tick is started once
  private lastT: [number, number] = [0, 0];
  private seen = new Set<string>();
  // What the bosses' effects (src/game/bossFx.ts) draw with: the context, the particle lists, and a few of our own helpers.
  private readonly fxHost: FxHost = {
    ctx: null as unknown as CanvasRenderingContext2D,
    particles: this.particles,
    rings: this.rings,
    once: (slot, key) => {
      const k = `${slot}:${key}#${this.epoch[slot as 0 | 1]}`;
      if (this.seen.has(k)) return false;
      if (this.seen.size > 60) this.seen.clear();
      this.seen.add(k);
      return true;
    },
    glow: (x, y, r, color) => this.glowBall(x, y, r, color),
    shake: (n) => (this.shake = Math.max(this.shake, getReduceFlashes() ? n * 0.4 : n)),
  };
  private fontDisplay = "sans-serif";
  private fontBody = "sans-serif";
  sprites: [Sprite | null, Sprite | null] = [null, null];
  classes: [string, string] = ["Fighter", "Fighter"];
  items: [string, string] = ["", ""]; // "" = the class's default item (see itemOf)
  builds: [Build, Build] = [AVERAGE_BUILD, AVERAGE_BUILD]; // body proportions from DUR / SPD (stickman.ts buildFor)
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

  // preview: the small training room (MovePreview): camera close on the pair, no HUD or banners.
  constructor(
    private canvas: HTMLCanvasElement,
    private preview = false,
  ) {
    this.ctx = canvas.getContext("2d")!;
    this.fxHost.ctx = this.ctx;
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
    this.arenaView?.setScale(this.canvas.width / ARENA.w);
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

  private ingested = false; // the first snapshot has been seen (what it carries from before we joined stays silent)
  private quiet = false;
  private swing: [string, string] = ["", ""]; // the swing each fighter's whiff sound was last played for
  private cursor = -1; // the local player's cursor in the ceremony, to tick when it moves
  private heat = 0; // 0..1: how hot the arena's air looks right now (sweat and steam on the fighters)
  private scales: [number, number] = [1, 1]; // how big each fighter is drawn (the ring shrinks them a little, a buff grows them)
  private buffs: [number, number] = [0, 0]; // each fighter's plausibility buff in percent, once shown
  private auras: [string | null, string | null] = [null, null]; // the colour of a buffed fighter's constellation
  private spin = 0; // radians the fighter being drawn is spun about its body (the loser of an arena ending, in flight)
  private onStage = false; // an arena fight: fighters stand on platforms, so their shadows fall on what they stand on
  private revealed: [boolean, boolean] = [false, false]; // the reveal's two moments already sounded

  // Sound for the effect being shown (silent while catching up on events from before this renderer existed).
  private sfx(name: Sfx, power?: number) {
    if (!this.quiet) play(name, power);
  }

  // Turn new sim events into visual effects (deduped by id), and play their sounds.
  ingest(s: Snapshot, hud: HudInfo) {
    // A guest joining mid-match gets up to 16 old events in its first snapshot: show them, don't play them.
    const first = !this.ingested;
    this.quiet = first && s.phase !== "intro";
    this.ingested = true;
    for (const e of s.events) {
      if (e.id <= this.lastEventId) continue;
      this.lastEventId = e.id;
      this.effect(e, hud, s);
    }
    this.quiet = false;
    // The stars answering: a sound as each fighter's roll is shown.
    if (s.cue?.id === "reveal" && s.arena) {
      for (const o of [0, 1] as const) {
        if (!this.revealed[o] && s.phaseT >= ARENA_TUNE.buff.at[o]) {
          this.revealed[o] = true;
          if (!first) play("aura", Math.min(1, s.arena.buff[o] / 50));
        }
      }
    } else this.revealed = [false, false];
    // The ceremony's cursor: a tick for the local player each time it moves.
    if (s.cue?.id === "pick" && s.arena) {
      const c = s.arena.cur[hud.you];
      if (this.cursor >= 0 && c !== this.cursor && !first) play("tap");
      this.cursor = c;
    } else this.cursor = -1;
    // A swing: the swish when a punch or kick starts (a hit that lands plays its thud on top). timer + t is the same
    // number for the whole move, so it names the swing.
    for (const f of s.fighters) {
      if ((f.action !== "attack" && f.action !== "kick") || f.t > 3 || s.phase !== "fight") continue;
      const key = `${f.move}:${s.timer + f.t}`;
      if (this.swing[f.slot] === key) continue;
      this.swing[f.slot] = key;
      if (!first) play("whiff", f.action === "kick" ? 0.7 : 0.4);
    }
  }

  private effect(e: GameEvent, hud: HudInfo, s: Snapshot) {
    if (e.type === "hit") {
      // Blocked or absorbed: a tock. Otherwise a thud, lower and louder with the damage; a kick sounds heavier than a fist.
      const att = s.fighters[e.by];
      const vic = s.fighters[1 - e.by];
      const rubber = s.passives?.[1 - e.by] === "rubber" && att.action === "attack" && !e.special && !e.blocked && e.dmg > 0; // a punch bounces off the rubber man
      const crushed = !e.blocked && e.dmg > 0 && att.action === "kick" && (vic.pv?.noBlock ?? 0) > 0 && s.passives?.[e.by] === "guard-crush"; // a guard broken by the Compressed Kick
      if (e.blocked || e.dmg === 0) this.sfx("block");
      else this.sfx(att.action === "kick" ? "kick" : "punch", Math.min(1, e.dmg / 24 + (e.special ? 0.25 : 0)));
      const color = e.blocked ? C.guard : rubber ? "#ff8fb0" : C.hit;
      const big = e.special || e.dmg >= 10 || crushed;
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
      const text = e.dmg === 0 ? "ABSORBED" : rubber ? `BOING ${e.dmg}` : crushed ? `GUARD CRUSH ${e.dmg}` : `${words[e.id % words.length]} ${e.dmg}`; // 0: an ink bubble soaked it
      if (crushed) {
        // The guard shatters: shards of the arc fly off the defender.
        for (let i = 0; i < 12; i++) this.particles.push({ x: vic.x + vic.facing * 20, y: vic.y - BODY.h * (0.3 + Math.random() * 0.5), vx: vic.facing * (1 + Math.random() * 5), vy: -2 - Math.random() * 3, life: 0, max: 22, color: C.guard, size: 3 + Math.random() * 3 });
        this.shake = Math.max(this.shake, 12);
      }
      this.particles.push({ x: e.x, y: e.y - 24, vx: 0, vy: -1.2, life: 0, max: 36, text, color, size: e.special ? 30 : 22 });
      this.shake = Math.max(this.shake, e.special ? 13 : e.blocked ? 2 : 4 + e.dmg / 3);
      // A mace's overhead or slam cracks the floor; a sweep kicks up dust.
      const by = s.fighters[e.by];
      if (!e.blocked && (by.move === "overhead" || by.move === "slam")) {
        this.shake = Math.max(this.shake, 12);
        this.rings.push({ x: e.x, y: ARENA.ground, r: 14, grow: 9, life: 0, max: 16, color: C.ink, width: 5 });
        for (let i = 0; i < 3; i++) this.stains.push({ x: e.x + (i - 1) * 26, y: ARENA.ground + 3, r: 9 + i * 3, life: 0, color: C.ink });
      }
      if (by.move === "sweep" || by.move === "flyingKick") {
        for (let i = 0; i < 8; i++) this.particles.push({ x: e.x + (Math.random() - 0.5) * 50, y: ARENA.ground - 4, vx: (Math.random() - 0.5) * 6, vy: -2 - Math.random() * 4, life: 0, max: 20, color: C.muted, size: 3 + Math.random() * 3 });
      }
      if (e.special) this.flash = Math.max(this.flash, 3);
      // Impact frame on ultimate blows and Ink Flash crits: two ticks of inverted screen with speed lines from the
      // hit point. "Reduce flashes" swaps it for a soft ring.
      const stopped = s.fighters.some((f) => f.action === "special" && f.ult && s.ults?.[f.slot] === "time_stop_barrage"); // (the stopped page is already inverted: no strobing)
      if ((e.ult || e.crit) && !stopped) {
        if (getReduceFlashes()) this.rings.push({ x: e.x, y: e.y, r: 14, grow: 9, life: 0, max: 22, color: C.gold, width: 9 });
        else this.impact = { x: e.x, y: e.y, until: performance.now() + (2 * 1000) / TICK_HZ };
      }
      if (e.crit) this.particles.push({ x: e.x, y: e.y - 56, vx: 0, vy: -1, life: 0, max: 44, text: "INK FLASH!", color: C.gold, size: 26 });
    } else if (e.type === "special") {
      this.sfx(e.ult ? "ultimate" : "special");
      const name = (e.ult && hud.ultNames?.[e.by]) || hud.specialNames[e.by];
      this.banner = { text: `${name}!`, color: C.hit, life: e.ult ? 100 : 60 };
      // Only the ultimate gets the full blackout and speed lines; slot 1 is a quick flourish.
      this.dim = { slot: e.by, life: e.ult ? 24 : 8 };
      this.shake = Math.max(this.shake, e.ult ? 4 : 2);
    } else if (e.type === "dodge") {
      this.sfx("slip");
      // A quick afterimage ring and a word, no damage number.
      this.rings.push({ x: e.x, y: e.y, r: 18, grow: 3, life: 0, max: 10, color: C.guard, width: 2 });
      this.particles.push({ x: e.x, y: e.y - 30, vx: 0, vy: -1, life: 0, max: 28, text: ["SLIP", "MISS", "WHIFF"][e.id % 3], color: C.guard, size: 20 });
    } else if (e.type === "clash") {
      this.sfx("clash");
      // Two strikes meet: sparks and a burst of ink at the contact point, nobody takes damage.
      this.rings.push({ x: e.x, y: e.y, r: 6, grow: 9, life: 0, max: 14, color: C.gold, width: 6 });
      this.rings.push({ x: e.x, y: e.y, r: 2, grow: 14, life: 0, max: 12, color: C.ink, width: 2 });
      for (let i = 0; i < 16; i++) {
        const a = Math.random() * Math.PI * 2;
        const sp = 3 + Math.random() * 6;
        this.particles.push({ x: e.x, y: e.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 1, life: 0, max: 14 + Math.random() * 8, color: i % 2 ? C.gold : C.ink, size: 2 + Math.random() * 3 });
      }
      this.particles.push({ x: e.x, y: e.y - 30, vx: 0, vy: -1.3, life: 0, max: 30, text: "CLASH!", color: C.gold, size: 26 });
      this.shake = Math.max(this.shake, 8);
      this.flash = Math.max(this.flash, 2);
    } else if (e.type === "phase") {
      this.sfx("phase");
      // A boss changed form: new class look, the page bleeds red (see draw), a banner and a burst.
      this.classes[e.slot] = e.cls;
      this.items[e.slot] = e.item;
      this.banner = { text: e.banner ?? "FORM CHANGE", color: C.hit, life: 140 };
      const f = s.fighters[e.slot];
      this.shake = 24;
      this.flash = Math.max(this.flash, 5);
      this.rings.push({ x: f.x, y: f.y - BODY.h * 0.55, r: 12, grow: 18, life: 0, max: 26, color: C.hit, width: 10 });
      this.rings.push({ x: f.x, y: f.y - BODY.h * 0.55, r: 4, grow: 26, life: 0, max: 20, color: C.ink, width: 4 });
      for (let i = 0; i < 30; i++) {
        const a = Math.random() * Math.PI * 2;
        this.particles.push({ x: f.x, y: f.y - BODY.h * 0.55, vx: Math.cos(a) * (3 + Math.random() * 7), vy: Math.sin(a) * (3 + Math.random() * 7), life: 0, max: 30, color: Math.random() < 0.5 ? C.hit : C.ink, size: 3 + Math.random() * 4 });
      }
    } else if (e.type === "skill") {
      this.sfx("skill");
      const f = s.fighters[e.by];
      this.rings.push({ x: f.x, y: f.y - BODY.h * 0.55, r: 30, grow: 4, life: 0, max: 14, color: C.guard, width: 3 });
      this.particles.push({ x: f.x, y: f.y - BODY.h - 30, vx: 0, vy: -1, life: 0, max: 40, text: SKILL_INFO[e.kind].name.toUpperCase(), color: C.guard, size: 18 });
    } else if (e.type === "arena") {
      this.arenaEvent(e, s);
    } else if (e.type === "round") {
      this.sfx("round");
    } else if (e.type === "ko") {
      this.sfx("ko");
      this.shake = 20;
      this.flash = 6;
      const f = s.fighters[e.loser];
      this.rings.push({ x: f.x, y: f.y - BODY.h * 0.55, r: 10, grow: 16, life: 0, max: 22, color: C.hit, width: 8 });
    }
  }

  // The arena's cues (src/game/arena.ts): sound, dust, a floating damage number. The picture itself is drawn from the state.
  private arenaEvent(e: Extract<GameEvent, { type: "arena" }>, s: Snapshot) {
    const reduce = getReduceFlashes();
    this.arenaView?.event(e, performance.now());
    const dust = (x: number, n: number, color = C.muted) => {
      for (let i = 0; i < n; i++) this.particles.push({ x: x + (Math.random() - 0.5) * 60, y: ARENA.ground - 6, vx: (Math.random() - 0.5) * 4, vy: -1 - Math.random() * 3, life: 0, max: 24 + Math.random() * 14, color, size: 3 + Math.random() * 4 });
    };
    if (e.kind === "scene") {
      // Scene 1 is the start of the fight; the others are a rumble, and scene 5 is the eruption.
      if (e.n === 3 || e.n === 4) this.sfx("rumble");
      if (e.n === 5) {
        this.sfx("eruption");
        this.shake = Math.max(this.shake, reduce ? 4 : 10);
      }
      if (e.n === 2) this.sfx("hiss");
    } else if (e.kind === "crack") {
      this.sfx("crack");
      dust(e.x, 8);
    } else if (e.kind === "meteor") {
      this.sfx("meteor");
    } else if (e.kind === "impact") {
      this.sfx("impact");
      this.shake = Math.max(this.shake, reduce ? 4 : 13);
      this.rings.push({ x: e.x, y: ARENA.ground - 6, r: 12, grow: 9, life: 0, max: 18, color: "#ff8a22", width: 6 });
      this.rings.push({ x: e.x, y: ARENA.ground - 6, r: 4, grow: 14, life: 0, max: 14, color: C.ink, width: 3 });
      for (let i = 0; i < 14; i++) {
        const a = -Math.PI / 2 + (Math.random() - 0.5) * 2.2;
        const sp = 3 + Math.random() * 7;
        this.particles.push({ x: e.x, y: ARENA.ground - 8, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 0, max: 22 + Math.random() * 14, color: i % 3 ? "#ff8a22" : C.ink, size: 2 + Math.random() * 4 });
      }
    } else if (e.kind === "rumble") {
      this.sfx("rumble");
    } else if (e.kind === "rise") {
      this.sfx("grind");
      dust(e.x, 10, "#b9a47c");
    } else if (e.kind === "burn") {
      this.particles.push({ x: e.x, y: e.y - 18, vx: 0, vy: -1.1, life: 0, max: 34, text: `-${e.n}`, color: "#ff8a22", size: 20 });
      if (s.fighters[e.slot ?? 0]?.hp > 0) this.sfx("hiss");
    } else if (e.kind === "star") {
      // A constellation locked: a chime, a gold ring and sparks where it hangs in the row.
      this.sfx("chime");
      const at = ROW(e.n ?? 0);
      this.rings.push({ x: at.x, y: at.y, r: 20, grow: 3.2, life: 0, max: 26, color: C.gold, width: 5 });
      this.rings.push({ x: at.x, y: at.y, r: 8, grow: 5.5, life: 0, max: 20, color: "#ffffff", width: 2 });
      for (let i = 0; i < 16; i++) {
        const an = Math.random() * Math.PI * 2, sp = 1.5 + Math.random() * 4;
        this.particles.push({ x: at.x, y: at.y, vx: Math.cos(an) * sp, vy: Math.sin(an) * sp, life: 0, max: 30 + Math.random() * 16, color: i % 2 ? C.gold : "#ffffff", size: 2 + Math.random() * 3 });
      }
    } else if (e.kind === "boot") {
      // The winner's kick lands on the loser: a thud, a flash, a ring and sparks, "BOOT!".
      this.sfx("kick", 1);
      this.sfx("impact");
      this.shake = Math.max(this.shake, reduce ? 6 : 16);
      if (!reduce) this.flash = Math.max(this.flash, 3);
      this.rings.push({ x: e.x, y: e.y, r: 12, grow: 12, life: 0, max: 18, color: C.gold, width: 9 });
      this.rings.push({ x: e.x, y: e.y, r: 4, grow: 18, life: 0, max: 14, color: "#ffffff", width: 3 });
      for (let i = 0; i < 20; i++) {
        const an = Math.random() * Math.PI * 2, sp = 3 + Math.random() * 7;
        this.particles.push({ x: e.x, y: e.y, vx: Math.cos(an) * sp, vy: Math.sin(an) * sp - 1, life: 0, max: 26, color: i % 2 ? C.gold : "#ffffff", size: 3 + Math.random() * 4 });
      }
      this.particles.push({ x: e.x, y: e.y - 40, vx: 0, vy: -1.1, life: 0, max: 50, text: "BOOT!", color: C.hit, size: 40 });
    } else if (e.kind === "splash") {
      // The loser hits the lava: a heavy splash, droplets and a spout.
      this.sfx("splash");
      this.shake = Math.max(this.shake, reduce ? 3 : 9);
      for (const [r, grow, max] of [[8, 7, 24], [3, 11, 18]] as const) this.rings.push({ x: e.x, y: e.y, r, grow, life: 0, max, color: "#ffb13a", width: 6 });
      for (let i = 0; i < 34; i++) {
        const an = -Math.PI / 2 + (Math.random() - 0.5) * 1.8, sp = 4 + Math.random() * 8;
        this.particles.push({ x: e.x + (Math.random() - 0.5) * 30, y: e.y, vx: Math.cos(an) * sp * 0.6, vy: Math.sin(an) * sp, life: 0, max: 30 + Math.random() * 20, color: i % 3 ? "#ff8a22" : "#ffe07a", size: 4 + Math.random() * 6, g: 0.33 });
      }
    } else if (e.kind === "shoot") {
      this.sfx("shoot"); // the loser's constellation falls
    } else if (e.kind === "ring") {
      // The walls start to rise: stone grinding, dust off the two posts.
      this.sfx("grind");
      this.shake = Math.max(this.shake, reduce ? 3 : 8);
      for (const px of [258, 702]) for (let i = 0; i < 10; i++) this.particles.push({ x: px + (Math.random() - 0.5) * 24, y: e.y - 6, vx: (Math.random() - 0.5) * 3, vy: -1 - Math.random() * 2.5, life: 0, max: 30 + Math.random() * 14, color: "#b9a47c", size: 3 + Math.random() * 4 });
    } else if (e.kind === "cue") {
      this.sfx(s.cue?.id === "open" ? "shimmer" : "round"); // a guided pause begins (the stars waking has its own sound)
      this.banner = null; // (a special's name from the last moment of the fight must not sit on the headline)
    } else if (e.kind === "warp") {
      this.sfx("skill");
      this.rings.push({ x: e.x, y: e.y - BODY.h * 0.5, r: 14, grow: 7, life: 0, max: 18, color: C.gold, width: 5 });
      for (let i = 0; i < 10; i++) this.particles.push({ x: e.x + (Math.random() - 0.5) * 50, y: e.y - 6, vx: (Math.random() - 0.5) * 4, vy: -1 - Math.random() * 3, life: 0, max: 26, color: C.gold, size: 3 + Math.random() * 3 });
    } else if (e.kind === "rescue") {
      this.sfx("skill");
      this.rings.push({ x: e.x, y: e.y - BODY.h * 0.5, r: 14, grow: 6, life: 0, max: 18, color: C.gold, width: 5 });
      this.particles.push({ x: e.x, y: e.y - BODY.h - 20, vx: 0, vy: -1, life: 0, max: 50, text: "BACK UP!", color: C.gold, size: 22 });
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
    if (this.preview) {
      tz = 1.5;
      tx = (fighters[0].x + fighters[1].x) / 2;
      ty = ARENA.ground - BODY.h * 0.6;
    } else if (cur.slow > 0) {
      const loser = fighters.find((f) => f.action === "ko") ?? fighters[0];
      tz = 1.35;
      tx = (loser.x + fighters[1 - loser.slot].x) / 2;
      ty = loser.y - BODY.h * 0.6;
    } else if (cur.fighters.some((f) => f.locked)) {
      // An ultimate has grabbed its target: push in on the pair.
      tz = 1.35;
      tx = (fighters[0].x + fighters[1].x) / 2;
      ty = ARENA.ground - BODY.h * 0.6;
    } else if (sp) {
      tz = 1.14;
      tx = sp.x + sp.facing * 80;
      ty = sp.y - BODY.h * 0.6;
    }
    // An arena fight: keep both fighters in frame (zoomed out and looking up when one is on a platform), unless a special or the KO has the camera.
    if (cur.arena && !this.arenaView) this.arenaView = new ArenaView(this.fontDisplay, this.fontBody);
    if (cur.arena && this.arenaView && !this.preview && tz === 1) {
      const w = this.arenaView.camera(fighters, cur.cue, cur.arena);
      tz = w.z;
      tx = w.x;
      ty = w.y;
    }
    const ease = 1 - Math.exp(-Math.min(0.05, Math.max(0.001, (now - this.lastNow) / 1000)) * 6);
    this.cam.z += (tz - this.cam.z) * ease;
    this.cam.x += (tx - this.cam.x) * ease;
    this.cam.y += (ty - this.cam.y) * ease;
    const z = this.cam.z, hw = ARENA.w / 2 / z, hh = ARENA.h / 2 / z;
    // The arena's backdrop reaches past the old edges (WORLD in arenaRender.ts), so a zoomed-out or raised camera needs no clamp there.
    const cx = cur.arena ? Math.min(ARENA.w / 2 + 120, Math.max(ARENA.w / 2 - 120, this.cam.x)) : Math.min(ARENA.w - hw, Math.max(hw, this.cam.x));
    const cy = cur.arena ? Math.min(ARENA.h - hh + 120, Math.max(-300 + hh, this.cam.y)) : Math.min(ARENA.h - hh, Math.max(hh, this.cam.y));
    this.view = { cx, cy, z };
    if (cur.arena && this.arenaView) {
      this.arenaView.setScale(canvas.width / ARENA.w);
      // The ground trembles before a boulder rises and while it does, and at the eruption.
      const t = this.arenaView.tremor(cur);
      if (t > 0 && cur.phase === "fight") this.shake = Math.max(this.shake, t * (getReduceFlashes() ? 0.35 : 1));
    }

    ctx.save();
    ctx.translate(ARENA.w / 2, ARENA.h / 2);
    ctx.scale(z, z);
    ctx.translate(-cx, -cy);
    if (this.shake > 0.3) {
      ctx.translate((Math.random() - 0.5) * this.shake, (Math.random() - 0.5) * this.shake);
      this.shake *= 0.85;
    }
    if (cur.arena && this.arenaView) {
      this.arenaView.back(ctx, cur, now, this.view, getReduceFlashes());
      this.heat = this.arenaView.heat(cur);
      this.scales = this.arenaView.fighterScales(cur);
      this.buffs = this.arenaView.buffShown(cur);
      this.auras = [0, 1].map((i) => (this.buffs[i] > 0 && cur.arena?.pick[i] ? starColor(cur.arena.pick[i]!) : null)) as [string | null, string | null];
      this.onStage = true;
      this.dimOverlay();
      this.arenaView.mid(ctx, cur, now, getReduceFlashes());
    } else this.background();
    this.drawStains();
    // The ultimate blacks out the page (fighters and effects are drawn over it).
    // (the Overdue's time stop doesn't black the page out: it inverts it, below)
    const stopper = cur.fighters.find((f) => f.action === "special" && f.ult && cur.ults?.[f.slot] === "time_stop_barrage" && f.t >= TIME_STOP.start - 2);
    const ultOn = !stopper && cur.fighters.some((f) => f.action === "special" && f.ult);
    this.cine += ((ultOn ? 1 : 0) - this.cine) * ease;
    this.invert += ((stopper ? 1 : 0) - this.invert) * ease * 1.5;
    if (this.cine > 0.01) {
      ctx.fillStyle = `rgba(5,5,12,${0.62 * this.cine})`;
      ctx.fillRect(-20, -20, ARENA.w + 40, ARENA.h + 40);
    }
    this.formTint += ((cur.bossPhase === 2 ? 1 : 0) - this.formTint) * ease;
    if (this.formTint > 0.01) {
      // The second form tints the page in the boss's own second colour.
      const tint = cur.bossFloor ? bossLook(cur.bossFloor)?.palette.sub ?? "#9e1b1b" : "#9e1b1b";
      const [r, g, b] = [1, 3, 5].map((i) => parseInt(tint.slice(i, i + 2), 16));
      ctx.fillStyle = `rgba(${r},${g},${b},${0.14 * this.formTint})`;
      ctx.fillRect(-20, -20, ARENA.w + 40, ARENA.h + 40);
    }
    for (const h of cur.hazards ?? []) this.hazard(h, fighters[1 - h.owner], now);
    if (this.dim) this.speedLines(fighters[this.dim.slot]);

    // Whoever is doing a special is drawn on top.
    const order = [...fighters].sort((a, b) => (a.action === "special" ? 1 : 0) - (b.action === "special" ? 1 : 0));
    const ending = cur.arena && this.arenaView ? this.arenaView.ending(cur) : null;
    for (const f of order) {
      // The loser of an arena ending tumbles off the edge and sinks into the lava: spun about the body, and cut off at the lava's surface.
      const clip = ending?.clip[f.slot] ?? null;
      this.spin = ending?.spin[f.slot] ?? 0;
      if (this.spin !== 0) {
        ctx.save();
        // A pale rim round the loser, so the dark drawing reads against the dark cliffs and the slab on its way down.
        ctx.shadowColor = "rgba(255,236,190,.9)";
        ctx.shadowBlur = 14;
      }
      if (clip !== null) {
        ctx.save();
        ctx.beginPath();
        ctx.rect(-4000, -4000, 8000, 4000 + clip);
        ctx.clip();
      }
      this.fighter(f, (f.ult ? cur.ults?.[f.slot] : null) ?? cur.specials[f.slot], cur.styles[f.slot], now, hud.you === f.slot, cur.skills?.[f.slot], cur.passives?.[f.slot] ?? null);
      if (clip !== null) ctx.restore();
      if (this.spin !== 0) ctx.restore();
    }
    this.spin = 0;
    this.lastNow = now;
    for (const p of projectiles) this.projectile(p.kind, p.x, p.y, p.r, p.vx, now, p.owner, fighters[p.owner].x);
    this.fx();
    if (cur.arena && this.arenaView) this.arenaView.front(ctx, cur, now, getReduceFlashes());
    ctx.restore();

    // Time stopped: the page inverted (softer with "Reduce flashes").
    if (this.invert > 0.02) {
      ctx.save();
      ctx.globalCompositeOperation = "difference";
      ctx.fillStyle = `rgba(255,255,255,${(getReduceFlashes() ? 0.4 : 1) * Math.min(1, this.invert)})`;
      ctx.fillRect(0, 0, ARENA.w, ARENA.h);
      ctx.restore();
    }
    if (this.flash > 0) {
      if (!getReduceFlashes()) {
        ctx.fillStyle = `rgba(255,255,255,${0.35 * this.flash})`;
        ctx.fillRect(0, 0, ARENA.w, ARENA.h);
      }
      this.flash--;
    }
    if (this.impact) {
      if (now < this.impact.until) this.impactFrame(this.impact.x, this.impact.y);
      else this.impact = null;
    }
    // KO slow-motion: cinema bars.
    if (cur.slow > 0) {
      const bar = Math.min(1, cur.slow / 10) * 44;
      ctx.fillStyle = C.ink;
      ctx.fillRect(0, 0, ARENA.w, bar);
      ctx.fillRect(0, ARENA.h - bar, ARENA.w, bar);
    }
    if (this.preview) return;
    this.hud(cur, hud, now);
    this.phaseText(cur);
  }

  // A drawn threat: the crosshair and column of a delayed cut (remote detonation, the Overdue's knives).
  // It darkens as it nears the cut and flashes for the last 8 ticks.
  private hazard(h: Snapshot["hazards"][number], target: F, now: number) {
    const { ctx } = this;
    const p = 1 - h.left / h.max, flash = h.left <= 8 && Math.floor(now / 70) % 2 === 0;
    ctx.save();
    ctx.lineCap = "round";
    if (h.knife) {
      // A knife hanging in the air where it will fall: it drops the last stretch and sticks in the floor.
      const fall = Math.max(0, 1 - h.left / 14), y = 40 + (ARENA.ground - 60) * fall * fall;
      ctx.strokeStyle = `rgba(136,0,255,${0.18 + 0.3 * p})`;
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 8]);
      ctx.beginPath();
      ctx.moveTo(h.x, 40);
      ctx.lineTo(h.x, ARENA.ground);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = flash ? "#ffffff" : "#d9dee5";
      ctx.strokeStyle = C.ink;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(h.x, y + 26);
      ctx.lineTo(h.x - 6, y);
      ctx.lineTo(h.x + 6, y);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = "#2a1b3d";
      ctx.fillRect(h.x - 4, y - 14, 8, 14);
      ctx.restore();
      return;
    }
    ctx.strokeStyle = flash ? "#ffffff" : `rgba(190,30,30,${0.25 + 0.6 * p})`;
    ctx.fillStyle = `rgba(190,30,30,${0.06 + 0.16 * p})`;
    ctx.fillRect(h.x - h.w / 2, 60, h.w, ARENA.ground - 60);
    ctx.lineWidth = 2 + 2 * p;
    ctx.beginPath();
    ctx.moveTo(h.x - h.w / 2, 60);
    ctx.lineTo(h.x - h.w / 2, ARENA.ground);
    ctx.moveTo(h.x + h.w / 2, 60);
    ctx.lineTo(h.x + h.w / 2, ARENA.ground);
    ctx.stroke();
    const cy = target.y - BODY.h * 0.55, r = 30 - 10 * p;
    ctx.beginPath();
    ctx.arc(h.x, cy, r, 0, Math.PI * 2);
    ctx.moveTo(h.x - r - 10, cy);
    ctx.lineTo(h.x + r + 10, cy);
    ctx.moveTo(h.x, cy - r - 10);
    ctx.lineTo(h.x, cy + r + 10);
    ctx.stroke();
    ctx.restore();
  }

  // The rubber man's arm (or leg) while it strikes: drawn out to the length of the move's reach, then drawn back in.
  private stretchLimb(pose: StickPose, f: F) {
    const mv = MOVES[f.move!];
    const env = Math.min(1, Math.max(0, (f.t - (mv.from - 4)) / 4)) * (1 - Math.min(1, Math.max(0, (f.t - mv.to) / 6)));
    if (env <= 0) return;
    const j = pose.joints;
    const pull = (from: Vec, mid: keyof typeof j, tip: keyof typeof j, want: number) => {
      const d = Math.hypot(j[tip].x - from.x, j[tip].y - from.y) || 1;
      const len = d + (want - d) * env, ux = (j[tip].x - from.x) / d, uy = (j[tip].y - from.y) / d;
      j[tip] = { x: from.x + ux * len, y: from.y + uy * len };
      j[mid] = { x: from.x + ux * len * 0.5, y: from.y + uy * len * 0.5 };
    };
    const reach = mv.reach + BODY.w / 2 - 6;
    if (mv.tip === "foot" || mv.tip === "footB") pull(j.hip, mv.tip === "foot" ? "kneeF" : "kneeB", mv.tip === "foot" ? "footF" : "footB", reach * 0.95);
    else {
      pull(j.shoulder, "elbowF", "handF", reach);
      if (f.move === "bazooka") pull(j.shoulder, "elbowB", "handB", reach * 0.92);
    }
  }

  // A boss's aura, by passive: what the fighter glows with right now (and how hard), or null.
  private bossGlow(f: F, passive: PassiveId, now: number): { color: string; blur: number } | null {
    const pv = f.pv ?? {};
    switch (passive) {
      case "fracture": {
        const h = pv.heat ?? 0;
        return h > 0 ? { color: "#ff3b3b", blur: 4 + h * 4 + (h >= 3 ? Math.sin(now / 45) * 3 : 0) } : null;
      }
      case "sheathed-draw":
        return (pv.still ?? 0) >= 20 ? { color: "#ffffff", blur: 16 } : (pv.still ?? 0) > 0 ? { color: "#8fb4ff", blur: 3 + (pv.still ?? 0) / 5 } : null;
      case "unbending-spine": {
        const mv = f.move ? MOVES[f.move] : null;
        return (f.action === "attack" || f.action === "kick") && mv && f.t < mv.from ? { color: "#000000", blur: 14 } : null;
      }
      case "whiteout-guard":
        return (pv.cracks ?? 0) >= 2 ? { color: "#dfe6ee", blur: 12 } : null;
      case "infinite-margin":
        return (pv.shimmer ?? 0) > 0 ? { color: "#8fd3e8", blur: 14 + Math.sin(now / 50) * 4 } : null;
      case "charge-up": {
        const k = Math.min(3, Math.floor((pv.charge ?? 0) / 60));
        return k > 0 ? { color: k >= 2 ? "#ffd700" : "#00ccff", blur: 6 + k * 5 } : null;
      }
      default:
        return null;
    }
  }

  // The passive's other tells, drawn over the boss: the shield cracks, the ruled grid and blink ripple, sword sparks, ki rocks.
  // (x, y) is the fighter's feet in the world; hand is its front hand.
  private bossFx(f: F, passive: PassiveId, x: number, y: number, hand: Vec) {
    const { ctx } = this;
    const pv = f.pv ?? {};
    const rnd = Math.random;
    if (passive === "whiteout-guard" && (pv.cracks ?? 0) > 0) {
      ctx.save();
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 2.5;
      for (let i = 0; i < (pv.cracks ?? 0); i++) {
        ctx.beginPath();
        ctx.moveTo(hand.x + 6 + i * 3, hand.y - 22 + i * 14);
        ctx.lineTo(hand.x + 14 + i * 3, hand.y - 8 + i * 14);
        ctx.lineTo(hand.x + 8 + i * 3, hand.y + 2 + i * 14);
        ctx.stroke();
      }
      ctx.restore();
      if ((pv.cracks ?? 0) >= 2 && rnd() < 0.4) this.particles.push({ x: hand.x + (rnd() - 0.5) * 40, y: hand.y + (rnd() - 0.5) * 60, vx: 0, vy: -0.8, life: 0, max: 24, color: "#dfe6ee", size: 5 + rnd() * 4 });
    } else if (passive === "infinite-margin") {
      // A ruled-line grid shimmers around him; the blink is an ink-blot ripple on him.
      ctx.save();
      ctx.strokeStyle = `rgba(80,150,190,${(pv.shimmer ?? 0) > 0 ? 0.5 : 0.18})`;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      for (let i = 0; i < 6; i++) {
        ctx.moveTo(x - 70, y - i * 32);
        ctx.lineTo(x + 70, y - i * 32);
      }
      for (let i = -2; i <= 2; i++) {
        ctx.moveTo(x + i * 32, y);
        ctx.lineTo(x + i * 32, y - 190);
      }
      ctx.stroke();
      if ((pv.shimmer ?? 0) > 0) {
        const k = 1 - (pv.shimmer ?? 0) / 18;
        ctx.strokeStyle = C.ink;
        ctx.lineWidth = 4 * (1 - k) + 1;
        ctx.globalAlpha = 0.7;
        for (let i = 0; i < 3; i++) {
          ctx.beginPath();
          ctx.ellipse(x, y - BODY.h * 0.5, 20 + k * 90 + i * 14, 30 + k * 120 + i * 14, 0, 0, Math.PI * 2);
          ctx.stroke();
        }
      }
      ctx.restore();
    } else if (passive === "fracture" && (pv.heat ?? 0) >= 3 && rnd() < 0.7) {
      this.particles.push({ x: hand.x + (rnd() - 0.5) * 20, y: hand.y, vx: (rnd() - 0.5) * 1.5, vy: -1.5 - rnd() * 2, life: 0, max: 20, color: rnd() < 0.5 ? "#ff3b3b" : C.hit, size: 4 + rnd() * 4 });
    } else if (passive === "sheathed-draw" && (pv.still ?? 0) > 0 && rnd() < 0.5) {
      // Sparks crawl along the blade, then it flashes white.
      this.particles.push({ x: hand.x + f.facing * rnd() * 50, y: hand.y - rnd() * 60, vx: 0, vy: -0.4, life: 0, max: 12, color: (pv.still ?? 0) >= 20 ? "#ffffff" : "#8fb4ff", size: 2.5 });
    }
  }

  // The manga impact frame: the arena inverted, black and white wedges fanning out from the point of impact.
  private impactFrame(wx: number, wy: number) {
    const { ctx } = this;
    const { cx, cy, z } = this.view;
    const x = (wx - cx) * z + ARENA.w / 2, y = (wy - cy) * z + ARENA.h / 2;
    ctx.save();
    ctx.globalCompositeOperation = "difference";
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, ARENA.w, ARENA.h);
    ctx.globalCompositeOperation = "source-over";
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2 + 0.07 * (i % 3);
      const r0 = 24 + (i % 4) * 14, half = 0.012 + 0.014 * (i % 3);
      ctx.fillStyle = i % 2 ? "#000" : "#fff";
      ctx.beginPath();
      ctx.moveTo(x + Math.cos(a) * r0, y + Math.sin(a) * r0);
      ctx.lineTo(x + Math.cos(a - half) * 1400, y + Math.sin(a - half) * 1400);
      ctx.lineTo(x + Math.cos(a + half) * 1400, y + Math.sin(a + half) * 1400);
      ctx.fill();
    }
    ctx.restore();
  }

  private background() {
    const { ctx } = this;
    ctx.fillStyle = C.paper;
    ctx.fillRect(-20, -20, ARENA.w + 40, ARENA.h + 40); // under the page when the camera shakes
    ctx.drawImage(this.pageImage(), 0, 0, ARENA.w, ARENA.h);
    this.drawDoodles();
    this.dimOverlay();
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

  // A special starting darkens the page for a moment.
  private dimOverlay() {
    const { ctx } = this;
    if (!this.dim) return;
    ctx.fillStyle = `rgba(23,23,26,${0.4 * Math.min(1, this.dim.life / 8)})`;
    ctx.fillRect(-20, -20, ARENA.w + 40, ARENA.h + 40);
    if (--this.dim.life <= 0) this.dim = null;
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

  private fighter(f: F, special: SpecialKind, style: Snapshot["styles"][number], now: number, isYou: boolean, skill?: SideSkill, passive: PassiveId | null = null) {
    const { ctx } = this;
    const sprite = this.sprites[f.slot];
    const cls = this.classes[f.slot];
    const bl = sprite?.look ?? null; // a dungeon boss's look: its palette, aura, idle and outfit
    if (f.t < this.lastT[f.slot]) this.epoch[f.slot]++; // a new move began
    this.lastT[f.slot] = f.t;

    // Shadow shrinks while airborne. In an arena fight a fighter on a platform casts it on the platform.
    const sc = this.scales[f.slot];
    const shy = this.onStage && f.grounded ? f.y : ARENA.ground;
    const air = this.onStage && f.grounded ? 0 : Math.min(1, (ARENA.ground - f.y) / 200);
    ctx.fillStyle = `rgba(23,23,26,${0.12 * (1 - air * 0.6)})`;
    ctx.beginPath();
    ctx.ellipse(f.x, shy + 4, 46 * (1 - air * 0.4) * sc, 7 * sc, 0, 0, Math.PI * 2);
    ctx.fill();

    // Round intro: taunts. After a KO / time-out: the winner celebrates.
    const ceremony = f.action === "idle" && f.grounded && !f.moving && (this.phase === "intro" || (this.phase !== "fight" && this.roundWinner === f.slot));
    const motion = ceremony ? ceremonyPose(this.phase === "intro" ? "intro" : "win", f.slot, now) : poseFor(f, special, now, normClass(this.classes[f.slot] ?? ""), sprite?.look?.idle);
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
    const pose = solveStick(cur, this.builds[f.slot]);
    if (bl?.stretch && f.move && bl.stretch.includes(f.move) && (f.action === "attack" || f.action === "kick")) this.stretchLimb(pose, f);
    // Keep the lowest foot on the floor: bent legs crouch the body instead of sinking it.
    const lift = (f.grounded && f.action !== "ko" ? -Math.max(pose.joints.footF.y, pose.joints.footB.y) : 0) - (motion.hover ?? 0);
    const dir = motion.flip ? -f.facing : f.facing;
    const toWorld = (v: Vec): Vec => ({ x: f.x + dx + dir * v.x * sc, y: f.y + (lift + v.y) * sc });

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
      const color = f.action === "special" ? (special === "uppercut" ? (bl?.palette.sub ?? C.gold) : (bl?.palette.main ?? C.hit)) : finisher || (bl && mv?.crush) ? (bl?.palette.main ?? C.hit) : "rgba(23,23,26,.55)";
      this.drawSmear(smear, color, f.action === "special" || finisher ? 26 : 18);
    }
    // A sword's slashes leave a crescent where the blade swept (the smear only follows the hand).
    if (normal && (f.move === "iai" || f.move === "risingSlash" || f.move === "airSlash") && f.t >= mv.from - 1 && f.t <= mv.to + 3) {
      const sh = toWorld(pose.joints.shoulder);
      const rising = f.move === "risingSlash";
      const [a0, a1] = rising ? [0.9, -1.4] : f.move === "airSlash" ? [-1.3, 1.0] : [-0.5, 0.6];
      const k = Math.min(1, (f.t - mv.from + 1) / Math.max(1, mv.to - mv.from + 1));
      const span = (a1 - a0) * k;
      const ang = (a: number) => (f.facing > 0 ? a : Math.PI - a);
      ctx.save();
      ctx.globalAlpha = 0.7 * (1 - Math.max(0, f.t - mv.to) / 4);
      ctx.strokeStyle = finisher ? C.hit : C.ink;
      ctx.lineCap = "round";
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.arc(sh.x, sh.y, 75, ang(a0), ang(a0 + span), f.facing > 0 ? span < 0 : span > 0);
      ctx.stroke();
      ctx.restore();
    }

    // Afterimages while a special is out (and a boss's trail while its Afterimage is ready).
    const trail = this.trails[f.slot];
    const ghost = passive === "afterimage" && (f.pv?.cd ?? 1) === 0;
    if ((f.action === "special" && special !== "beam") || ghost || (f.draw && f.action === "attack")) {
      trail.unshift(pose);
      trail.length = Math.min(trail.length, 5);
    } else trail.length = 0;

    const hurt = f.action === "hit" && f.t < 8;
    const nc = normClass(cls);
    const accent = nc === "Tank" || nc === "Attacker" ? C.guard : nc === "Fighter" ? C.hit : C.gold;
    const look = { ink: hurt ? C.hit : (sprite?.ink ?? C.ink), head: sprite?.head ?? null, headScale: sprite?.headScale, headCenter: sprite?.headCenter, outfit: sprite?.look?.outfit, sheathed: !!sprite?.look?.sheathes && (f.action === "idle" || ((f.action === "attack" || f.action === "kick") && !!mv && f.t < mv.from) || (f.action === "special" && f.t < 3)), prop: sprite?.prop ?? null, cls, item: this.items[f.slot], accent, width: sprite?.width ?? 7, build: this.builds[f.slot], now };

    if (bl) auraBack(this.fxHost, bl, f, pose, toWorld, now);
    ctx.save();
    ctx.translate(f.x + dx, f.y);
    ctx.scale(sc, sc); // (the ring shrinks a fighter a little and a buff grows one; about the feet, so they stay on the floor)
    ctx.translate(0, lift);
    ctx.scale(dir, 1);
    if (this.spin) {
      ctx.translate(0, -70);
      ctx.rotate(this.spin * dir); // (screen direction: the mirror above flips it back)
      ctx.translate(0, 70);
    }
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
      drawStick(ctx, p, { ...look, ink: ghost ? (bl?.palette.main ?? "#6b6b73") : (bl?.palette.main ?? C.hit), head: null, prop: null, plain: true });
    });
    ctx.globalAlpha = base;
    const skillOn = f.skillT > 0 && f.action !== "ko" ? skill : undefined;
    if (f.armorTicks > 0 || f.action === "special") {
      ctx.shadowColor = f.action === "special" ? ((f.ult && bl?.palette.ult) || bl?.palette.main || C.hit) : C.guard; // (a boss's special glows in its own colour)
      ctx.shadowBlur = 12; // blur cost grows with radius, and it runs per stroke
    } else if (skillOn === "poise" || skillOn === "blade") {
      ctx.shadowColor = skillOn === "poise" ? C.gold : C.hit; // iron poise / element blade
      ctx.shadowBlur = 10;
    } else if (f.status) {
      ctx.shadowColor = STATUS_COLOR[f.status.kind] ?? C.muted; // a faint halo in the element's colour
      ctx.shadowBlur = 7;
    } else if (passive && this.bossGlow(f, passive, now)) {
      const g = this.bossGlow(f, passive, now)!;
      ctx.shadowColor = g.color;
      ctx.shadowBlur = g.blur;
    } else if (bl && f.action !== "ko") {
      const g = auraGlow(bl, f, now); // the boss's own aura, always on, in its colour
      ctx.shadowColor = g.color;
      ctx.shadowBlur = g.blur;
    } else if (this.auras[f.slot] && f.action !== "ko") {
      ctx.shadowColor = this.auras[f.slot]!; // the constellation's blessing: a glow in its colour
      ctx.shadowBlur = 13 + Math.sin(now / 240) * 3;
    } else if (f.tension > 0.1 && f.action !== "ko") {
      ctx.shadowColor = C.hit; // tension: a red aura that swells with it and pulses
      ctx.shadowBlur = 5 + f.tension * 10 + Math.sin(now / 90) * 2 * f.tension;
    }
    if (base > 0.02) drawStick(ctx, pose, look);
    ctx.restore();
    ctx.globalAlpha = 1;

    if (f.action === "special") this.specialFx(f, special, pose, toWorld, now);
    if (bl) {
      auraFx(this.fxHost, bl, f, pose, toWorld, now);
      moveFx(this.fxHost, bl, f, f.action === "special" ? special : "", pose, toWorld, now);
    }
    if (skillOn) this.skillFx(f, skillOn, f.x + dx, f.y + lift * sc, now);
    // A blessed fighter: little stars of its constellation circle it.
    if (this.auras[f.slot] && f.action !== "ko") {
      const col = this.auras[f.slot]!;
      for (let k = 0; k < 3; k++) {
        const ang = now / 800 + (k * Math.PI * 2) / 3, r = 52 * sc;
        const px = f.x + dx + Math.cos(ang) * r, py = f.y + lift * sc - 78 * sc + Math.sin(ang) * r * 0.75;
        ctx.save();
        ctx.globalCompositeOperation = "lighter";
        ctx.fillStyle = col;
        ctx.globalAlpha = 0.8;
        ctx.beginPath();
        for (let q = 0; q < 8; q++) {
          const a2 = (q * Math.PI) / 4, rr = q % 2 ? 2.2 : 6.5;
          ctx.lineTo(px + Math.cos(a2) * rr, py + Math.sin(a2) * rr);
        }
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }
    }
    // Embers rising off a fighter whose tension is up.
    if (f.tension > 0.3 && f.action !== "ko" && Math.random() < f.tension * 0.3) {
      this.particles.push({ x: f.x + dx + (Math.random() - 0.5) * 50, y: f.y + lift - Math.random() * BODY.h * 0.6, vx: (Math.random() - 0.5) * 0.8, vy: -1.4 - Math.random(), life: 0, max: 26, color: Math.random() < 0.5 ? C.hit : C.gold, size: 3 + Math.random() * 3 });
    }
    // The heatwave: sweat running off the head and steam off the shoulders (fewer with "Reduce flashes").
    if (this.heat > 0.15 && f.action !== "ko") {
      const k = this.heat * (getReduceFlashes() ? 0.35 : 1);
      if (Math.random() < 0.09 * k) this.particles.push({ x: f.x + dx + (Math.random() - 0.5) * 26, y: f.y + lift - BODY.h * (0.9 + Math.random() * 0.1), vx: (Math.random() - 0.5) * 1.4, vy: -1 - Math.random(), life: 0, max: 26, color: "#bfe6ff", size: 3.5 });
      if (Math.random() < 0.11 * k) this.particles.push({ x: f.x + dx + (Math.random() - 0.5) * 44, y: f.y + lift - BODY.h * (0.45 + Math.random() * 0.45), vx: (Math.random() - 0.3) * 0.5, vy: -0.6 - Math.random() * 0.5, life: 0, max: 50, color: "#fff3e6", size: 9 + Math.random() * 8, g: -0.012 });
    }
    if (f.status && f.action !== "ko") this.statusFx(f.status.kind, f.x + dx - f.facing * 38, f.y + (lift - 150) * sc, now);
    if (passive && f.action !== "ko") this.bossFx(f, passive, f.x + dx, f.y + lift, toWorld(pose.joints.handF));

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
      const top = f.y + (lift - h) * sc - 16;
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

  // Side skill while it lasts: a bubble, a reflect shield, a weave afterimage (poise and blade glow above).
  private skillFx(f: F, skill: SideSkill, x: number, y: number, now: number) {
    const { ctx } = this;
    const cy = y - BODY.h * 0.55;
    ctx.save();
    if (skill === "bubble" && f.bubble > 0) {
      const r = 84 + Math.sin(now / 120) * 3;
      ctx.fillStyle = "rgba(47,91,224,.10)";
      ctx.strokeStyle = "rgba(47,91,224,.55)";
      ctx.lineWidth = 3;
      ctx.setLineDash(f.bubble === 1 ? [10, 8] : []); // cracked after one hit
      ctx.beginPath();
      ctx.arc(x, cy, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    } else if (skill === "reflect") {
      ctx.strokeStyle = C.gold;
      ctx.lineWidth = 4;
      ctx.globalAlpha = 0.6 + Math.sin(now / 60) * 0.3;
      ctx.beginPath();
      ctx.arc(x + f.facing * 14, cy, 78, f.facing > 0 ? -1 : Math.PI - 1, f.facing > 0 ? 1 : Math.PI + 1);
      ctx.stroke();
    } else if (skill === "weave") {
      ctx.strokeStyle = C.guard;
      ctx.lineWidth = 2;
      ctx.globalAlpha = 0.5;
      ctx.setLineDash([4, 6]);
      ctx.beginPath();
      ctx.ellipse(x, cy, 44, 92, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
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
    const pal = this.sprites[f.slot]?.look?.palette; // a boss's moves are drawn in its own colours
    const main = (f.ult && pal?.ult) || pal?.main; // (the ultimate may have a colour of its own: the purple of two colours merged)
    const hand = toWorld(pose.joints.handF);
    const j = pose.joints;
    const mid = toWorld({ x: (j.handF.x + j.handB.x) / 2, y: (j.handF.y + j.handB.y) / 2 });
    ctx.save();
    if (kind === "beam") {
      if (t < BEAM.fireFrom) {
        // Charging ball between the cupped hands, with sparks being sucked in.
        this.glowBall(mid.x, mid.y, 6 + t * 0.55 + Math.sin(now / 30) * 2, main ?? C.guard);
        for (let i = 0; i < 3; i++) {
          const a = Math.random() * Math.PI * 2, d = 40 + Math.random() * 40;
          this.particles.push({ x: mid.x + Math.cos(a) * d, y: mid.y + Math.sin(a) * d, vx: -Math.cos(a) * 3, vy: -Math.sin(a) * 3, life: 0, max: 12, color: "#9fb6ff", size: 2.5 });
        }
      } else if (t <= BEAM.fireTo + 6) {
        const fade = t > BEAM.fireTo ? 1 - (t - BEAM.fireTo) / 6 : 1;
        const end = f.facing > 0 ? ARENA.w + 20 : -20;
        const thick = (30 + Math.sin(now / 18) * 6) * fade;
        ctx.globalAlpha = fade;
        ctx.shadowColor = main ?? C.guard;
        ctx.shadowBlur = 30;
        ctx.fillStyle = main ?? C.guard;
        ctx.fillRect(Math.min(hand.x, end), hand.y - thick / 2, Math.abs(end - hand.x), thick);
        ctx.fillStyle = pal?.core ?? "#ffffff";
        ctx.fillRect(Math.min(hand.x, end), hand.y - thick / 5, Math.abs(end - hand.x), (thick * 2) / 5);
        this.glowBall(hand.x, hand.y, thick * 0.9, main ?? C.guard);
        this.shake = Math.max(this.shake, 3);
      }
    } else if (kind === "spiral" && t < 40) {
      // Spinning sphere in the palm: a glowing core with orbiting rings.
      const r = Math.min(22, 8 + t * 1.2);
      const cx = hand.x + f.facing * 10;
      this.glowBall(cx, hand.y, r, main ?? "#5aa2ff");
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
      ctx.fillStyle = main ?? C.hit;
      ctx.beginPath();
      ctx.arc(0, 0, 95, -1.3, 1.1);
      ctx.arc(-22, 0, 80, 1.1, -1.3, true);
      ctx.fill();
    } else if (kind === "teleport" && t >= 2 && t <= 14) {
      // Vanishing streaks.
      ctx.strokeStyle = main ?? C.ink;
      ctx.lineWidth = 2;
      ctx.globalAlpha = 0.6;
      for (let i = 0; i < 7; i++) {
        const x = f.x + (Math.random() - 0.5) * 60, y = f.y - Math.random() * BODY.h;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x, y - 50);
        ctx.stroke();
      }
    } else if ((kind === "barrage" && t >= 6 && t < 42) || (f.ult && f.ultEnd > 0 && t >= SPECIAL_DURATION[kind])) {
      // Ghost fists everywhere in front.
      ctx.fillStyle = pal?.sub ?? C.ink;
      ctx.globalAlpha = 0.35;
      for (let i = 0; i < 5; i++) {
        const x = f.x + f.facing * (55 + Math.random() * 45), y = f.y - BODY.h * (0.45 + Math.random() * 0.4);
        ctx.beginPath();
        ctx.arc(x, y, 7 + Math.random() * 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillRect(Math.min(x, x - f.facing * 26), y - 2, 26, 4);
      }
    } else if (kind === "shatter" && t >= 11 && t <= 18) {
      // An open hand closing: cracks radiate from the grab.
      const gx = f.x + f.facing * 60, gy = f.y - BODY.h * 0.55;
      ctx.strokeStyle = pal ? (t % 2 ? pal.main : pal.sub) : C.ink;
      ctx.lineWidth = 3;
      ctx.globalAlpha = Math.max(0, 1 - (t - 11) / 8);
      ctx.beginPath();
      for (let i = 0; i < 9; i++) {
        const a = (i / 9) * Math.PI * 2 + 0.3, r0 = 8 + (t - 11) * 2, r1 = r0 + 22 + (i % 3) * 10;
        ctx.moveTo(gx + Math.cos(a) * r0, gy + Math.sin(a) * r0);
        ctx.lineTo(gx + Math.cos(a + 0.12) * (r0 + r1) / 2, gy + Math.sin(a + 0.12) * (r0 + r1) / 2);
        ctx.lineTo(gx + Math.cos(a) * r1, gy + Math.sin(a) * r1);
      }
      ctx.stroke();
      if (t === 12) this.rings.push({ x: gx, y: gy, r: 6, grow: 8, life: 0, max: 14, color: pal?.sub ?? C.gold, width: 5 });
    } else if (kind === "counter" && t < 26) {
      // The stance: a white-gold arc in front, brightest at the start of the 24-tick window.
      ctx.strokeStyle = t < 24 ? (pal?.main ?? C.gold) : "rgba(255,255,255,.5)";
      ctx.lineWidth = 6;
      ctx.globalAlpha = 0.5 + 0.4 * Math.sin(now / 50);
      ctx.beginPath();
      ctx.arc(f.x + f.facing * 6, f.y - BODY.h * 0.55, 80, f.facing > 0 ? -1.1 : Math.PI - 1.1, f.facing > 0 ? 1.1 : Math.PI + 1.1);
      ctx.stroke();
      if (f.landed && t >= 40 && t <= 42) this.rings.push({ x: f.x + f.facing * 50, y: f.y - BODY.h * 0.55, r: 10, grow: 10, life: 0, max: 14, color: pal?.main ?? C.gold, width: 6 });
    } else if (kind === "dash_slash" && t >= 10 && t <= 24) {
      // The streak the dash leaves: a long gold line along the path, fading.
      ctx.globalAlpha = Math.max(0, 1 - (t - 10) / 14);
      ctx.fillStyle = main ?? C.gold;
      const x0 = f.x - f.facing * (t <= 18 ? (t - 10) * 27.5 : 220), y0 = hand.y;
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.lineTo(f.x, y0 - 7);
      ctx.lineTo(f.x, y0 + 7);
      ctx.closePath();
      ctx.fill();
    } else if (kind === "remote_detonation" && t >= 2 && t <= 14) {
      // A pointed finger: a little red tick marks the cast.
      ctx.strokeStyle = pal ? pal.sub : C.hit;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(hand.x + f.facing * 12, hand.y, 7 + (t % 6), 0, Math.PI * 2);
      ctx.stroke();
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
        this.particles.push({ x: hand.x, y: hand.y, vx: (Math.random() - 0.5) * 3, vy: -1 - Math.random() * 2, life: 0, max: 14, color: i ? (pal?.sub ?? C.gold) : (pal?.main ?? C.hit), size: 5 + Math.random() * 4 });
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

  // Small animated badge beside a fighter's head for its element status. Kept to a few paths per frame.
  private statusFx(kind: string, x: number, y: number, now: number) {
    const { ctx } = this;
    ctx.save();
    ctx.translate(x, y);
    ctx.fillStyle = ctx.strokeStyle = STATUS_COLOR[kind] ?? C.muted;
    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";
    if (kind === "FIRE") {
      for (let i = -1; i <= 1; i++) {
        const h = 14 + Math.sin(now / 70 + i * 2) * 5 + (i ? 0 : 6);
        ctx.beginPath();
        ctx.moveTo(i * 8, 8);
        ctx.quadraticCurveTo(i * 8 - 6, 8 - h * 0.55, i * 8 + Math.sin(now / 90 + i) * 2, 8 - h);
        ctx.quadraticCurveTo(i * 8 + 6, 8 - h * 0.5, i * 8, 8);
        ctx.fill();
      }
    } else if (kind === "ELECTRIC") {
      const seed = Math.floor(now / 60);
      for (let b = 0; b < 2; b++) {
        const x0 = b * 14 - 7;
        ctx.beginPath();
        ctx.moveTo(x0, -14);
        for (let i = 1; i <= 3; i++) ctx.lineTo(x0 + Math.sin(seed * 7.1 + b * 3 + i * 5.3) * 6, -14 + i * 9);
        ctx.stroke();
      }
    } else if (kind === "FROST") {
      ctx.rotate(now / 900);
      ctx.lineWidth = 2;
      for (let i = 0; i < 3; i++) {
        ctx.rotate(Math.PI / 3);
        ctx.beginPath();
        ctx.moveTo(-10, 0);
        ctx.lineTo(10, 0);
        ctx.stroke();
      }
    } else if (kind === "POISON" || kind === "BLEED") {
      // Drops sliding down and fading.
      for (let i = 0; i < 3; i++) {
        const p = ((now / 22 + i * 9) % 28) / 28;
        const dx = (i - 1) * 9, dy = -12 + p * 28;
        ctx.globalAlpha = 1 - p * 0.8;
        ctx.beginPath();
        ctx.arc(dx, dy, 3.5, 0, Math.PI * 2);
        ctx.moveTo(dx - 3, dy - 1);
        ctx.lineTo(dx, dy - 8);
        ctx.lineTo(dx + 3, dy - 1);
        ctx.fill();
      }
    } else if (kind === "GRAVITY") {
      ctx.beginPath();
      for (let a = 0; a < Math.PI * 4; a += 0.5) ctx.lineTo(Math.cos(a + now / 150) * a * 1.7, Math.sin(a + now / 150) * a * 1.4);
      ctx.stroke();
    }
    ctx.restore();
  }

  private projectile(kind: SpecialKind | "blast", x: number, y: number, r: number, vx: number, now: number, owner: Slot, fromX = x) {
    const { ctx } = this;
    const d = Math.sign(vx);
    const pal = this.sprites[owner]?.look?.palette; // a boss's shots are in its colours
    ctx.save();
    if (kind === "blast") {
      // The Attacker's punch shot: an arrow for a bow, otherwise a ball of the drawing's own ink.
      const ink = pal?.main ?? this.sprites[owner]?.ink ?? C.ink;
      ctx.strokeStyle = ctx.fillStyle = ink;
      if (itemOf(this.items[owner], this.classes[owner]) === "bow") {
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(x - d * 26, y);
        ctx.lineTo(x + d * 8, y);
        ctx.moveTo(x + d * 8, y);
        ctx.lineTo(x - d * 2, y - 6);
        ctx.moveTo(x + d * 8, y);
        ctx.lineTo(x - d * 2, y + 6);
        ctx.moveTo(x - d * 26, y);
        ctx.lineTo(x - d * 32, y - 5);
        ctx.moveTo(x - d * 26, y);
        ctx.lineTo(x - d * 32, y + 5);
        ctx.stroke();
      } else {
        for (let i = 3; i > 0; i--) {
          ctx.globalAlpha = 0.45 - i * 0.1;
          ctx.beginPath();
          ctx.arc(x - d * i * 9, y, r * (1 - i * 0.18), 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.globalAlpha = 1;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = C.paper;
        ctx.beginPath();
        ctx.arc(x + d * r * 0.3, y - r * 0.3, r * 0.28, 0, Math.PI * 2);
        ctx.fill();
      }
    } else if (kind === "pull") {
      // Iron Reel: a hook on a line that runs back to the thrower's hand (a boss's is a sphere that pulls, with a swirl).
      if (pal) {
        this.glowBall(x, y, r * 0.8, pal.main);
        ctx.strokeStyle = pal.main;
        ctx.lineWidth = 2.5;
        for (let i = 0; i < 3; i++) {
          ctx.beginPath();
          ctx.ellipse(x, y, r * 1.5, r * 0.6, now / 120 + (i * Math.PI) / 3, 0, Math.PI * 1.4);
          ctx.stroke();
        }
      }
      ctx.strokeStyle = pal?.main ?? C.ink;
      ctx.lineWidth = 3;
      ctx.setLineDash([10, 6]);
      ctx.beginPath();
      ctx.moveTo(fromX + d * 40, y);
      ctx.lineTo(x - d * 8, y);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.arc(x, y, r * 0.8, d > 0 ? -2.4 : Math.PI - 2.4 - 0.4, d > 0 ? 2.4 : Math.PI + 2.4 + 0.4, d < 0);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(x + d * r * 0.7, y - r * 0.5);
      ctx.lineTo(x + d * (r * 0.7 + 8), y - r * 0.9);
      ctx.stroke();
    } else if (kind === "arrow" && pal) {
      // A thrown knife: a silver blade with a dark grip and a trail in the thrower's second colour.
      ctx.globalAlpha = 0.4;
      ctx.strokeStyle = pal.sub;
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(x - d * 24, y);
      ctx.lineTo(x - d * 90, y);
      ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.fillStyle = "#d9dee5";
      ctx.strokeStyle = C.ink;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(x + d * 22, y);
      ctx.lineTo(x - d * 8, y - 5);
      ctx.lineTo(x - d * 8, y + 5);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = "#2a1b3d";
      ctx.fillRect(Math.min(x - d * 8, x - d * 22), y - 3.5, 14, 7);
    } else if (kind === "arrow") {
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
      ctx.fillStyle = pal ? "#2a1a10" : C.ink;
      ctx.beginPath();
      ctx.moveTo(x - d * 40, ARENA.ground);
      ctx.quadraticCurveTo(x, ARENA.ground - r * 3.2, x + d * 18, ARENA.ground);
      ctx.fill();
      ctx.strokeStyle = pal?.main ?? C.gold;
      ctx.lineWidth = 3;
      ctx.stroke();
      if (Math.random() < 0.7) this.particles.push({ x: x - d * 10, y: ARENA.ground - 6, vx: -d * Math.random() * 2, vy: -2 - Math.random() * 3, life: 0, max: 18, color: C.muted, size: 3 + Math.random() * 3 });
    } else {
      const color = pal?.main ?? (kind === "orb" ? C.gold : C.guard);
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
      if (!p.text) p.vy += p.g ?? 0.25;
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
    // An arena fight has its own interface (src/game/arenaHud.ts): a black band across the top, gold plates, the pop-up of the opening ceremony.
    if (s.arena && this.arenaView) {
      this.arenaView.hud(ctx, s, now, Math.min(1.9, Math.max(1, 560 / this.canvas.clientWidth)), { names: hud.names, you: hud.you, admin: hud.buffs, buffs: this.buffs });
      return;
    }
    const barW = 360;
    const pad = 28;
    // On a phone the arena is drawn at ~0.4x; enlarge HUD text so it stays readable.
    const z = Math.min(1.9, Math.max(1, 560 / this.canvas.clientWidth));
    // KO slow-mo cinema bars are ink-dark: lay paper plates under the HUD so names and timer stay readable.
    if (s.slow > 0) {
      ctx.fillStyle = C.paper;
      for (const x of [pad - 12, ARENA.w - pad - barW - 12]) {
        ctx.beginPath();
        ctx.roundRect(x, 10, barW + 24, 98 + 8 * (z - 1), 12);
        ctx.fill();
      }
      ctx.beginPath();
      ctx.roundRect(ARENA.w / 2 - 50, 10, 100, 82 + 8 * (z - 1), 12);
      ctx.fill();
    }

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
      if (hud.buffs?.[slot]) {
        const w = Math.min(barW - 70, ctx.measureText(name).width) + 8;
        ctx.font = `800 ${Math.round(12 * z)}px ${this.fontDisplay}`;
        ctx.fillStyle = C.gold;
        ctx.fillText("BUFF", left ? x + w : x + barW - w, 40);
      }

      // Round wins as dots next to the name
      for (let i = 0; i < WINS_NEEDED; i++) {
        const cx = left ? x + barW - 10 - i * 18 : x + 10 + i * 18;
        ctx.beginPath();
        ctx.arc(cx, 33, 6, 0, Math.PI * 2);
        ctx.fillStyle = i < s.wins[slot] ? C.gold : C.line;
        ctx.fill();
      }

      // HP bar, and a thin tension bar under it once the fighter is hurt badly enough for it to start filling.
      this.bar(x, 52, barW, 16, hpPct, hpPct > 0.5 ? C.ink : hpPct > 0.25 ? C.gold : C.hit, !left);
      if (f.tension > 0) this.bar(x, 70, barW, 4, f.tension, f.tension >= 1 && Math.floor(now / 160) % 2 ? C.gold : C.hit, !left);
      if (z < 1.2) {
        ctx.font = `600 12px ${this.fontBody}`;
        ctx.fillStyle = C.muted;
        ctx.fillText(`${Math.ceil(f.hp)} / ${s.maxHp[slot]}  ·  ${s.styles[slot]}`, left ? x : x + barW, 98);
      }

      // Side skill: a short bar in the free space beside the energy meter (blue when ready).
      const skillPct = 1 - (f.skillCd ?? 0) / Math.max(1, s.skillCds?.[slot] ?? 1);
      this.bar(left ? x : x + barW - 72, 76, 72, 7, skillPct, skillPct >= 1 ? C.guard : C.muted, !left);

      // Energy / special meter
      // Half a meter fires the first special (L), a full one the ultimate (S + L): a notch marks the half.
      const full = f.energy >= 100;
      const half = f.energy >= 50;
      const ex = left ? x + 80 : x;
      const ew = barW - 80;
      this.bar(ex, 76, ew, 7, f.energy / 100, full ? (Math.floor(now / 200) % 2 ? C.hit : C.gold) : C.gold, !left);
      ctx.fillStyle = C.ink;
      ctx.fillRect(ex + ew / 2 - 1, 74, 2, 11);
      if (half) {
        ctx.font = `800 ${Math.round(12 * z)}px ${this.fontDisplay}`;
        ctx.fillStyle = full ? C.hit : C.gold;
        ctx.textAlign = left ? "right" : "left";
        ctx.fillText(full ? "ULTIMATE READY" : "SPECIAL READY", left ? x + barW : x, 98 + 6 * (z - 1));
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
    if (s.phase === "intro") text = s.phaseT < 90 ? (s.arena ? "ARENA 1" : `ROUND ${s.round}`) : "READY…";
    else if (s.phase === "fight" && s.phaseT < 45) {
      text = "FIGHT!";
      color = C.hit;
    } else if (s.phase === "roundEnd" && (!s.arena || s.phaseT < ARENA_TUNE.ending.wait)) {
      // (an arena's scripted ending runs for seconds: the word is there while the fall is read, then the winner walks over and it is the kick's turn)
      text = s.roundWinner === null ? "DRAW!" : s.roundReason === "ko" ? "K.O.!" : "TIME!";
      color = C.hit;
    }
    if (this.banner) {
      this.big(this.banner.text, this.banner.color, this.onStage ? 236 : 190, 38); // (an arena's banner sits lower: the clock's notch and the stamps are above)
      if (--this.banner.life <= 0) this.banner = null;
    }
    if (text) this.big(text, color, ARENA.h / 2 - 20, 72);
  }

  private big(text: string, color: string, y: number, size: number) {
    const { ctx } = this;
    if (this.onStage && this.arenaView) {
      this.arenaView.big(ctx, text, y, size); // an arena's words are drawn on plates, in its own colours
      return;
    }
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
