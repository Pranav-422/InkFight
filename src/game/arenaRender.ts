// Arena 1, Inferno Crater, drawn procedurally in the game's comic-ink style (heavy black outlines, flat charcoal rock,
// molten orange / red / gold). No image assets: the five moods of the same valley are drawn once each to an offscreen
// canvas (sky, volcano, spires, cliffs, floor slab) and crossfaded over two seconds at a scene change; only the live bits
// (floating rocks on chains, cracks, meteors, rising boulders, lava, embers) are drawn every frame. The storyboard in
// docs/design/arena-1 is a reference, never a background.
//
// render.ts calls back() before the fighters, mid() right after the page and floor, front() over everything and hud() last.

import { ARENA_TUNE, arenaTick, arenaWorld, CONSTELLATIONS, lavaY, platformsAt, ROCK_DEFS, SCENE_NAMES, sceneAt, starInfo, type ArenaGameEvent, type ArenaState, type Platform } from "./arena";
import { drawStar, starColor } from "./arenaStars";
import type { Cue, Slot } from "./sim";
import { ARENA, TICK_HZ } from "./space";

// What the stage drawing reads from a snapshot.
type StageState = { arena?: ArenaState; timer: number; phase: string; phaseT: number; cue?: Cue };

// Where the constellations hang: in a row across the sky while they are being chosen, then one over each fighter's side.
const STAR_SIZE = 140;
export const ROW = (i: number) => ({ x: 130 + 175 * i, y: 18 });
const HOME = [{ x: 262, y: 140 }, { x: 698, y: 140 }];
const PANEL = { w: 240, h: 232 }; // a ceremony pop-up
const DULL = 0.5; // how brightly the two chosen constellations glow while the fight goes on
const SLOT_COLOR = ["#e5482d", "#2f5be0"];
const ease = (p: number) => p * p * (3 - 2 * p);

// How hot the air looks, 0..1 (a function of the world clock): nothing in scene 1; the heatwave builds as scene 2's sky comes in (over the
// weather fade), holds through scene 2, then settles to a lower level for the rest of the fight (scenes 3-5 have their own fire).
export function heatAt(world: number): number {
  const sc = ARENA_TUNE.scenes, F = ARENA_TUNE.weather.fade;
  if (world < sc[1]) return 0;
  if (world < sc[2]) return ease(Math.min(1, (world - sc[1]) / F));
  return 0.45 + 0.55 * (1 - ease(Math.min(1, (world - sc[2]) / F)));
}

// The backdrop covers more than the 960 x 540 arena so the camera can zoom out and look up (a fighter on the final platform
// jumps above the old top edge).
export const WORLD = { x0: -170, x1: ARENA.w + 170, y0: -440, y1: ARENA.h + 170 };

const INK = "#0f0d12";

type Look = {
  sky: [string, string, string]; // top → horizon
  glow: number; // volcano / crater glow, 0..1
  streaks: number; // lava streaks on the volcano
  plume: number; // puffs in the smoke plume
  ash: number; // dark cloud mass across the top, 0..1
  stone: string; // the volcano's body
  spires: string;
  rock: string; // cliffs
  facet: string;
  cloud: string;
  seams: number; // glowing seams in the floor slab
  erupt: boolean;
};

const LOOKS: Look[] = [
  { sky: ["#1b2a62", "#4663a6", "#f4a85c"], glow: 0.12, streaks: 1, plume: 2, ash: 0, stone: "#343a58", spires: "#262431", rock: "#1c1a24", facet: "#2c2a38", cloud: "#6d7fb8", seams: 0, erupt: false },
  { sky: ["#3a2f58", "#bb5a3a", "#f8a94e"], glow: 0.3, streaks: 2, plume: 4, ash: 0, stone: "#4a3a48", spires: "#2d2230", rock: "#1f1a22", facet: "#312a34", cloud: "#d58a62", seams: 0, erupt: false },
  { sky: ["#3f171a", "#b53c1c", "#f58c28"], glow: 0.55, streaks: 4, plume: 7, ash: 0.15, stone: "#4a2c2c", spires: "#2a181c", rock: "#1c1316", facet: "#2e1c20", cloud: "#a14a2c", seams: 6, erupt: false },
  { sky: ["#0c0505", "#43090b", "#a5190f"], glow: 0.82, streaks: 8, plume: 12, ash: 0.7, stone: "#3a1c1c", spires: "#1e0d10", rock: "#150b0e", facet: "#251215", cloud: "#2a0d0d", seams: 11, erupt: false },
  { sky: ["#140303", "#7a0e06", "#ff6c1c"], glow: 1, streaks: 11, plume: 16, ash: 1, stone: "#33160f", spires: "#1c0b0b", rock: "#130809", facet: "#241012", cloud: "#2b0c08", seams: 16, erupt: true },
];

// A small seeded random generator: the same scene always bakes the same rocks.
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Ember = { x: number; y: number; vx: number; vy: number; life: number; max: number; size: number; ash: boolean };
type Decal = { x: number; born: number };

export class ArenaView {
  private baked = new Map<number, HTMLCanvasElement>();
  private scale = 1;
  private embers: Ember[] = [];
  private craters: Decal[] = [];
  private dust: { x: number; born: number }[] = [];
  private lastScene = -1;
  private rand = rng(99);
  // How hard to shake: set by the renderer from the sim's tremors. "Reduce flashes" scales it down.
  constructor(private fontDisplay: string, private fontBody: string) {}

  // Canvas pixels per world unit: the baked layers are drawn at that resolution (capped, so memory stays modest on a phone).
  setScale(k: number) {
    const r = Math.min(1.25, Math.max(0.45, k));
    if (Math.abs(r - this.scale) > 0.12) {
      this.scale = r;
      this.baked.clear();
    }
  }

  // ---------------------------------------------------------------- baked layers

  private bake(i: number): HTMLCanvasElement {
    const hit = this.baked.get(i);
    if (hit) return hit;
    const L = LOOKS[i];
    const r = this.scale;
    const c = document.createElement("canvas");
    c.width = Math.round((WORLD.x1 - WORLD.x0) * r);
    c.height = Math.round((WORLD.y1 - WORLD.y0) * r);
    const g = c.getContext("2d")!;
    g.setTransform(r, 0, 0, r, -WORLD.x0 * r, -WORLD.y0 * r);
    g.lineJoin = "round";
    g.lineCap = "round";
    const R = rng(1000 + i * 31);
    this.sky(g, L, R, i);
    this.volcano(g, L, R, i);
    this.lavaRiver(g, L, R);
    this.cliffs(g, L);
    this.floor(g, L, R, i);
    // Keep three layers at most: this one, the one it fades from and the next one.
    if (this.baked.size >= 3) for (const k of this.baked.keys()) if (Math.abs(k - i) > 1) this.baked.delete(k);
    this.baked.set(i, c);
    return c;
  }

  private sky(g: CanvasRenderingContext2D, L: Look, R: () => number, i: number) {
    const gr = g.createLinearGradient(0, WORLD.y0, 0, 420);
    gr.addColorStop(0, L.sky[0]);
    gr.addColorStop(0.62, L.sky[1]);
    gr.addColorStop(1, L.sky[2]);
    g.fillStyle = gr;
    g.fillRect(WORLD.x0, WORLD.y0, WORLD.x1 - WORLD.x0, 420 - WORLD.y0 + 2);
    // A few stars in the clean twilight.
    if (i === 0) {
      g.fillStyle = "rgba(255,255,255,.7)";
      for (let n = 0; n < 26; n++) g.fillRect(WORLD.x0 + R() * (WORLD.x1 - WORLD.x0), -120 + R() * 220, 2, 2);
    }
    // Sun / glow behind the mountain.
    const glow = g.createRadialGradient(520, 330, 10, 520, 330, 520);
    glow.addColorStop(0, `rgba(255,190,90,${0.1 + L.glow * 0.5})`);
    glow.addColorStop(1, "rgba(255,120,40,0)");
    g.fillStyle = glow;
    g.fillRect(WORLD.x0, WORLD.y0, WORLD.x1 - WORLD.x0, 760);
    // Clouds: flat shapes with an ink outline.
    const clouds = 5 + Math.round(L.ash * 5);
    for (let n = 0; n < clouds; n++) {
      const x = WORLD.x0 + R() * (WORLD.x1 - WORLD.x0), y = -60 + R() * 280 - L.ash * 60, s = 40 + R() * 70;
      g.fillStyle = L.cloud;
      g.globalAlpha = 0.55 + L.ash * 0.4;
      g.strokeStyle = INK;
      g.lineWidth = 3;
      g.beginPath();
      g.moveTo(x - s * 1.2, y + s * 0.3);
      g.bezierCurveTo(x - s * 1.3, y - s * 0.4, x - s * 0.5, y - s * 0.7, x - s * 0.1, y - s * 0.3);
      g.bezierCurveTo(x, y - s * 0.9, x + s * 0.9, y - s * 0.8, x + s * 0.9, y - s * 0.1);
      g.bezierCurveTo(x + s * 1.5, y - s * 0.1, x + s * 1.4, y + s * 0.4, x + s * 1.0, y + s * 0.4);
      g.closePath();
      g.fill();
      g.globalAlpha = 1;
      g.stroke();
    }
    // The dark ash mass of the late scenes: heavy overlapping lobes across the top.
    if (L.ash > 0) {
      g.fillStyle = L.cloud;
      g.strokeStyle = INK;
      g.lineWidth = 4;
      for (let x = WORLD.x0 - 40; x < WORLD.x1 + 40; x += 90) {
        const h = 90 + R() * 120 * L.ash;
        g.beginPath();
        g.moveTo(x, WORLD.y0);
        g.lineTo(x, 40 + h - 190);
        g.quadraticCurveTo(x + 45, 40 + h - 150 + R() * 40, x + 90, 40 + h - 190);
        g.lineTo(x + 90, WORLD.y0);
        g.closePath();
        g.globalAlpha = 0.85;
        g.fill();
        g.globalAlpha = 1;
        g.stroke();
      }
    }
  }

  private volcano(g: CanvasRenderingContext2D, L: Look, R: () => number, i: number) {
    // Far spires along the horizon.
    g.fillStyle = L.spires;
    g.strokeStyle = INK;
    g.lineWidth = 2.5;
    for (let x = WORLD.x0; x < WORLD.x1; x += 38 + R() * 46) {
      const w = 36 + R() * 56, h = 50 + R() * 110;
      g.beginPath();
      g.moveTo(x, 424);
      g.lineTo(x + w * 0.3, 424 - h * 0.6);
      g.lineTo(x + w * (0.4 + R() * 0.2), 424 - h);
      g.lineTo(x + w * 0.7, 424 - h * 0.5);
      g.lineTo(x + w, 424);
      g.closePath();
      g.fill();
      g.stroke();
    }
    // The volcano: big, in the middle distance, never hiding the fighters.
    const crater = { x: 520, y: 196 };
    const body = g.createLinearGradient(0, 190, 0, 430);
    body.addColorStop(0, L.stone);
    body.addColorStop(1, L.spires);
    g.fillStyle = body;
    g.strokeStyle = INK;
    g.lineWidth = 4;
    g.beginPath();
    g.moveTo(170, 430);
    g.lineTo(250, 360 + R() * 10);
    g.lineTo(330, 300);
    g.lineTo(420, 236 + R() * 8);
    g.lineTo(crater.x - 52, crater.y + 6);
    g.lineTo(crater.x - 24, crater.y - 10);
    g.lineTo(crater.x, crater.y + 8);
    g.lineTo(crater.x + 26, crater.y - 12);
    g.lineTo(crater.x + 54, crater.y + 4);
    g.lineTo(630, 260 + R() * 8);
    g.lineTo(720, 320);
    g.lineTo(800, 372 + R() * 8);
    g.lineTo(880, 430);
    g.closePath();
    g.fill();
    g.stroke();
    // Ridge hatching.
    g.lineWidth = 2;
    g.globalAlpha = 0.55;
    for (let n = 0; n < 16; n++) {
      const t = R();
      const x0 = 260 + t * 520, y0 = 280 + R() * 120;
      g.beginPath();
      g.moveTo(x0, y0);
      g.lineTo(x0 + 8 + R() * 16, y0 + 18 + R() * 24);
      g.stroke();
    }
    g.globalAlpha = 1;
    // Lava streaks down the slopes (more of them, hotter, as the scenes go on).
    for (let n = 0; n < L.streaks; n++) {
      let x = crater.x + (R() - 0.5) * 90, y = crater.y + 10;
      const dir = x < crater.x ? -1 : 1;
      const pts: [number, number][] = [[x, y]];
      for (let s = 0; s < 6; s++) {
        x += dir * (10 + R() * 26) * (1 + n * 0.04);
        y += 22 + R() * 22;
        pts.push([x, y]);
      }
      for (const [w, col] of [[7, INK], [4, "#ff6a1a"], [1.8, "#ffd24a"]] as const) {
        g.strokeStyle = col;
        g.lineWidth = w;
        g.globalAlpha = 0.35 + L.glow * 0.65;
        g.beginPath();
        pts.forEach(([px, py], k) => (k ? g.lineTo(px, py) : g.moveTo(px, py)));
        g.stroke();
      }
      g.globalAlpha = 1;
    }
    // Crater glow.
    const cg = g.createRadialGradient(crater.x, crater.y, 4, crater.x, crater.y, 40 + L.glow * 110);
    cg.addColorStop(0, `rgba(255,224,120,${0.35 + L.glow * 0.65})`);
    cg.addColorStop(0.4, `rgba(255,110,30,${0.2 + L.glow * 0.5})`);
    cg.addColorStop(1, "rgba(255,80,20,0)");
    g.fillStyle = cg;
    g.fillRect(crater.x - 200, crater.y - 200, 400, 400);
    // The plume: puffs rising and leaning right, bigger as they climb.
    for (let n = 0; n < L.plume; n++) {
      const t = n / Math.max(1, L.plume - 1);
      const px = crater.x + 6 + t * (60 + 90 * L.glow) + (R() - 0.5) * 26;
      const py = crater.y - 14 - t * (90 + 170 * L.glow);
      const pr = 16 + t * (26 + 40 * L.glow) + R() * 8;
      g.fillStyle = L.glow > 0.7 ? "#2b1612" : "#6a6068";
      g.strokeStyle = INK;
      g.lineWidth = 3;
      g.beginPath();
      g.arc(px, py, pr, 0, Math.PI * 2);
      g.fill();
      g.stroke();
      if (L.glow > 0.5) {
        g.fillStyle = `rgba(255,110,30,${0.18 * L.glow})`;
        g.beginPath();
        g.arc(px - pr * 0.25, py + pr * 0.35, pr * 0.7, 0, Math.PI * 2);
        g.fill();
      }
    }
    // Eruption: a fountain of lava and flying rock above the crater.
    if (L.erupt) {
      for (let n = 0; n < 14; n++) {
        const a = -Math.PI / 2 + (R() - 0.5) * 1.5;
        const len = 90 + R() * 150;
        for (const [w, col] of [[8, INK], [5, "#ff5a14"], [2, "#ffd54a"]] as const) {
          g.strokeStyle = col;
          g.lineWidth = w;
          g.beginPath();
          g.moveTo(crater.x, crater.y);
          g.quadraticCurveTo(crater.x + Math.cos(a) * len * 0.6, crater.y + Math.sin(a) * len * 1.1, crater.x + Math.cos(a) * len * 1.1, crater.y + Math.sin(a) * len * 0.5 + 40);
          g.stroke();
        }
      }
    }
    // Falling meteorites in the far sky of the warning scene (the real ones, with markers, are live).
    if (i >= 3) {
      for (let n = 0; n < 4; n++) {
        const mx = 100 + R() * 760, my = 40 + R() * 140;
        g.strokeStyle = "#ff8a2a";
        g.lineWidth = 3;
        g.beginPath();
        g.moveTo(mx, my);
        g.lineTo(mx - 34, my - 54);
        g.stroke();
        g.fillStyle = "#ffd24a";
        g.beginPath();
        g.arc(mx, my, 4, 0, Math.PI * 2);
        g.fill();
      }
    }
  }

  // The lava river behind the arena: a glowing band between the mountain's foot and the floor.
  private lavaRiver(g: CanvasRenderingContext2D, L: Look, R: () => number) {
    const gr = g.createLinearGradient(0, 410, 0, 470);
    gr.addColorStop(0, `rgba(255,120,30,${0.35 + L.glow * 0.4})`);
    gr.addColorStop(1, `rgba(190,40,10,${0.55 + L.glow * 0.3})`);
    g.fillStyle = gr;
    g.beginPath();
    g.moveTo(WORLD.x0, 428);
    for (let x = WORLD.x0; x <= WORLD.x1; x += 40) g.lineTo(x, 424 + Math.sin(x * 0.04) * 4 + R() * 3);
    g.lineTo(WORLD.x1, 470);
    g.lineTo(WORLD.x0, 470);
    g.closePath();
    g.fill();
    g.strokeStyle = `rgba(255,214,90,${0.4 + L.glow * 0.5})`;
    g.lineWidth = 2;
    for (let n = 0; n < 8; n++) {
      const y = 430 + R() * 34, x0 = WORLD.x0 + R() * 900;
      g.beginPath();
      g.moveTo(x0, y);
      g.lineTo(x0 + 70 + R() * 90, y + (R() - 0.5) * 4);
      g.stroke();
    }
  }

  // Tall jagged cliffs on both sides: the arena's visual edges (the walls the sim already has). Decoration only.
  private cliffs(g: CanvasRenderingContext2D, L: Look) {
    for (const side of [0, 1]) {
      const R = rng(500 + side * 77);
      const dir = side === 0 ? 1 : -1; // which way the rock lies from the edge towards the centre
      const outer = side === 0 ? WORLD.x0 : WORLD.x1; // far edge of the backdrop
      const at = (x: number) => (side === 0 ? x : ARENA.w - x); // x measured from this side's wall
      const edge: [number, number][] = [];
      for (let y = WORLD.y0; y <= WORLD.y1 + 40; y += 34 + R() * 22) {
        const spike = R() < 0.18 ? 30 + R() * 26 : 0;
        edge.push([62 + (R() - 0.5) * 40 + spike - (y < 120 ? 20 : 0), y]);
      }
      g.fillStyle = L.rock;
      g.strokeStyle = INK;
      g.lineWidth = 5;
      g.beginPath();
      g.moveTo(outer, WORLD.y0);
      for (const [x, y] of edge) g.lineTo(at(x), y);
      g.lineTo(outer, WORLD.y1 + 40);
      g.closePath();
      g.fill();
      g.stroke();
      // Facets and hatching on the cliff face.
      for (let k = 0; k + 1 < edge.length; k++) {
        const [x0, y0] = edge[k], [x1, y1] = edge[k + 1];
        g.fillStyle = L.facet;
        g.beginPath();
        g.moveTo(at(x0), y0);
        g.lineTo(at(x1), y1);
        g.lineTo(at(x1 - 40 - R() * 50), y1 + 12);
        g.closePath();
        g.fill();
        g.strokeStyle = INK;
        g.lineWidth = 2;
        g.globalAlpha = 0.6;
        for (let h = 0; h < 3; h++) {
          const hx = x0 - 20 - R() * 60, hy = y0 + R() * (y1 - y0);
          g.beginPath();
          g.moveTo(at(hx), hy);
          g.lineTo(at(hx - 10 - R() * 10), hy + 16 + R() * 12);
          g.stroke();
        }
        g.globalAlpha = 1;
        // A glint of molten light on the edge facing the volcano.
        if (L.glow > 0.3 && R() < 0.5) {
          g.strokeStyle = `rgba(255,120,40,${0.2 + L.glow * 0.4})`;
          g.lineWidth = 2.5;
          g.beginPath();
          g.moveTo(at(x0), y0);
          g.lineTo(at(x1), y1);
          g.stroke();
        }
      }
      void dir;
    }
  }

  // The floor slab: a thin top strip, the front face in blocks, glowing seams as the scenes go on, lava lake below.
  private floor(g: CanvasRenderingContext2D, L: Look, R: () => number, i: number) {
    const top = ARENA.ground - 18, y = ARENA.ground;
    // Lava lake under and in front of the slab.
    // Calm early on (a dull glow), molten by the eruption.
    const heat = 0.55 + 0.45 * L.glow;
    const mix = (r: number, gg: number, b: number) => `rgb(${Math.round(r * heat)},${Math.round(gg * heat)},${Math.round(b * heat)})`;
    const lake = g.createLinearGradient(0, y + 52, 0, WORLD.y1);
    lake.addColorStop(0, mix(255, 122, 26));
    lake.addColorStop(0.45, mix(195, 38, 12));
    lake.addColorStop(1, mix(74, 10, 6));
    g.fillStyle = lake;
    g.fillRect(WORLD.x0, y + 52, WORLD.x1 - WORLD.x0, WORLD.y1 - y - 52);
    g.strokeStyle = "rgba(255,214,90,.55)";
    g.lineWidth = 2;
    for (let n = 0; n < 14; n++) {
      const lx = WORLD.x0 + R() * (WORLD.x1 - WORLD.x0), ly = y + 70 + R() * 90;
      g.beginPath();
      g.moveTo(lx, ly);
      g.quadraticCurveTo(lx + 30, ly - 5, lx + 60 + R() * 40, ly + 2);
      g.stroke();
    }
    // The slab face.
    g.fillStyle = "#2a2631";
    g.fillRect(WORLD.x0, y, WORLD.x1 - WORLD.x0, 52);
    g.strokeStyle = INK;
    g.lineWidth = 2.5;
    for (let row = 0; row < 2; row++) {
      let x = WORLD.x0 - (row ? 40 : 0);
      while (x < WORLD.x1) {
        const w = 70 + R() * 50;
        g.strokeRect(x, y + row * 26, w, 26);
        if (R() < 0.35) {
          g.fillStyle = "rgba(255,255,255,.05)";
          g.fillRect(x + 3, y + row * 26 + 3, w - 6, 8);
        }
        x += w;
      }
    }
    // The top strip, seen at a grazing angle: lighter stone with joints.
    g.fillStyle = "#41394a";
    g.fillRect(WORLD.x0, top, WORLD.x1 - WORLD.x0, 18);
    g.strokeStyle = "rgba(15,13,18,.75)";
    g.lineWidth = 2;
    for (let x = WORLD.x0 + R() * 30; x < WORLD.x1; x += 46 + R() * 40) {
      g.beginPath();
      g.moveTo(x, top);
      g.lineTo(x - 10 - R() * 14, y);
      g.stroke();
    }
    g.strokeStyle = INK;
    g.lineWidth = 4;
    g.beginPath();
    g.moveTo(WORLD.x0, y);
    g.lineTo(WORLD.x1, y);
    g.stroke();
    g.lineWidth = 2.5;
    g.beginPath();
    g.moveTo(WORLD.x0, top);
    g.lineTo(WORLD.x1, top);
    g.stroke();
    // Glowing seams: a faint warmth under the slab from the start, real fissures from scene 3.
    const warm = g.createLinearGradient(0, y + 44, 0, y + 54);
    warm.addColorStop(0, "rgba(255,110,30,0)");
    warm.addColorStop(1, `rgba(255,150,50,${0.25 + L.glow * 0.5})`);
    g.fillStyle = warm;
    g.fillRect(WORLD.x0, y + 44, WORLD.x1 - WORLD.x0, 10);
    for (let n = 0; n < L.seams; n++) {
      let sx = 30 + R() * 900, sy = top + 4;
      const pts: [number, number][] = [[sx, sy]];
      for (let s = 0; s < 5; s++) {
        sx += (R() - 0.5) * 26;
        sy += 7 + R() * 9;
        pts.push([sx, sy]);
      }
      for (const [w, col] of [[5, INK], [3, "#ff6a1a"], [1.2, "#ffd24a"]] as const) {
        g.strokeStyle = col;
        g.lineWidth = w;
        g.globalAlpha = 0.5 + L.glow * 0.5;
        g.beginPath();
        pts.forEach(([px, py], k) => (k ? g.lineTo(px, py) : g.moveTo(px, py)));
        g.stroke();
      }
      g.globalAlpha = 1;
    }
    // The foreground rocks that frame the lower corners (black, jagged, as in the storyboard).
    for (const side of [0, 1]) {
      const outer = side === 0 ? WORLD.x0 : WORLD.x1;
      const bx = (x: number) => (side === 0 ? x : ARENA.w - x);
      g.fillStyle = "#0d0b10";
      g.strokeStyle = INK;
      g.lineWidth = 4;
      g.beginPath();
      g.moveTo(outer, ARENA.h - 80);
      g.lineTo(bx(0), ARENA.h - 80);
      g.lineTo(bx(60), ARENA.h - 40);
      g.lineTo(bx(120), ARENA.h + 10);
      g.lineTo(bx(210), WORLD.y1);
      g.lineTo(outer, WORLD.y1);
      g.closePath();
      g.fill();
      g.stroke();
    }
    void i;
  }

  // ---------------------------------------------------------------- live layers

  // What the player sees behind everything: the baked scene (crossfaded at a change), floating rocks on chains.
  back(ctx: CanvasRenderingContext2D, s: StageState, now: number, cam: { cx: number }, reduce = false) {
    const tick = arenaTick(s);
    const scene = sceneAt(tick);
    // The weather changes slowly: the new scene's sky comes in over ARENA_TUNE.weather.fade ticks of the world clock (which runs in a pause too).
    const F = ARENA_TUNE.weather.fade;
    const world = arenaWorld(s);
    const into = world - ARENA_TUNE.scenes[scene];
    const heat = heatAt(world);
    const warp = heat * (reduce ? 0.5 : 3.4); // the heat haze bends the far background sideways, up to this many px
    if (scene > 0 && into < F) {
      this.backdrop(ctx, scene - 1, 1, warp, now);
      this.backdrop(ctx, scene, ease(into / F), warp, now);
    } else this.backdrop(ctx, scene, 1, warp, now);
    this.haze(ctx, heat, reduce);
    this.constellations(ctx, s, now);
    // Bake the next scene once this one has fully come in (so the change itself costs nothing, and the scene fading out isn't dropped).
    if (scene < LOOKS.length - 1 && !this.baked.has(scene + 1) && into > F + 60) this.bake(scene + 1);
    this.lastScene = scene;
    this.floating(ctx, now, cam.cx, scene, this.mood(s));
  }

  // The weather as a number: scene - 1 + how far into the next sky we are (0..4); scene 1 is 0.
  private mood(s: StageState): number {
    const scene = sceneAt(arenaTick(s));
    if (scene === 0) return 0;
    return scene - 1 + ease(Math.min(1, (arenaWorld(s) - ARENA_TUNE.scenes[scene]) / ARENA_TUNE.weather.fade));
  }

  // How hot the air looks right now (0..1), for the fighters' sweat and steam.
  heat(s: StageState): number {
    return heatAt(arenaWorld(s));
  }

  // One baked backdrop at an alpha. With heat, the band from the volcano's foot to the floor is drawn in thin slices, each shifted a little
  // sideways by a wave that rises with time: the far background wobbles like air over hot stone.
  private backdrop(ctx: CanvasRenderingContext2D, i: number, alpha: number, warp: number, now: number) {
    const img = this.bake(i);
    const W = WORLD.x1 - WORLD.x0, H = WORLD.y1 - WORLD.y0;
    ctx.globalAlpha = alpha;
    if (warp < 0.15) ctx.drawImage(img, WORLD.x0, WORLD.y0, W, H);
    else {
      const r = img.width / W, band = [300, 470], step = 5;
      ctx.drawImage(img, 0, 0, img.width, (band[0] - WORLD.y0) * r, WORLD.x0, WORLD.y0, W, band[0] - WORLD.y0);
      for (let y = band[0]; y < band[1]; y += step) {
        const dx = warp * Math.sin(y * 0.052 + now / 340) * (0.4 + 0.6 * Math.sin(y * 0.013 + now / 1300));
        ctx.drawImage(img, 0, (y - WORLD.y0) * r, img.width, step * r, WORLD.x0 + dx, y, W, step + 0.6);
      }
      ctx.drawImage(img, 0, (band[1] - WORLD.y0) * r, img.width, img.height - (band[1] - WORLD.y0) * r, WORLD.x0, band[1], W, WORLD.y1 - band[1]);
    }
    ctx.globalAlpha = 1;
  }

  // An orange haze over the far air, thickest near the floor, and a pool of warm light round the foot of the volcano.
  private haze(ctx: CanvasRenderingContext2D, heat: number, reduce: boolean) {
    if (heat < 0.02) return;
    const a = heat * (reduce ? 0.12 : 0.26);
    const g = ctx.createLinearGradient(0, 220, 0, 480);
    g.addColorStop(0, "rgba(255,150,60,0)");
    g.addColorStop(1, `rgba(255,150,60,${a})`);
    ctx.fillStyle = g;
    ctx.fillRect(WORLD.x0, 220, WORLD.x1 - WORLD.x0, 260);
    const r = ctx.createRadialGradient(520, 410, 20, 520, 410, 380);
    r.addColorStop(0, `rgba(255,196,110,${a * 0.9})`);
    r.addColorStop(1, "rgba(255,150,60,0)");
    ctx.fillStyle = r;
    ctx.fillRect(WORLD.x0, 90, WORLD.x1 - WORLD.x0, 390);
  }

  // The constellations. While they are being chosen all five hang in a row (the ones a fighter's cursor rests on larger, with a ring in
  // their colour; a locked one with a gold ring); in the "settle" beat the unchosen ones fade and the two chosen ones glide over their
  // fighter's side; from then on only those two glow, dull. Light in the sky, drawn over the backdrop and behind everything else.
  private constellations(ctx: CanvasRenderingContext2D, s: StageState, now: number) {
    const a = s.arena;
    if (!a || s.phase === "intro") return;
    const cue = s.cue;
    const stage = cue?.id === "open" || cue?.id === "pick" || cue?.id === "settle" ? cue.id : null;
    const chosen = a.pick[0] !== null && a.pick[1] !== null;
    if (!stage && !chosen) return; // (a match whose ceremony was skipped has no constellations)
    const C = ARENA_TUNE.ceremony;
    // The sky darkens a little while the stars are the thing to look at.
    const dim = stage === "open" ? Math.min(1, s.phaseT / 60) : stage === "pick" ? 1 : stage === "settle" ? 1 - ease(Math.min(1, s.phaseT / C.settle)) : 0;
    if (dim > 0.01) {
      ctx.fillStyle = `rgba(4,8,30,${0.42 * dim})`;
      ctx.fillRect(WORLD.x0, WORLD.y0, WORLD.x1 - WORLD.x0, WORLD.y1 - WORLD.y0);
    }
    const wake = stage === "open" ? Math.min(1, s.phaseT / 90) : 1;
    const settle = stage === "settle" ? ease(Math.min(1, s.phaseT / C.settle)) : stage ? 0 : 1;
    CONSTELLATIONS.forEach((id, i) => {
      const owner = (a.pick[0] === id ? 0 : a.pick[1] === id ? 1 : -1) as Slot | -1;
      const row = ROW(i);
      const twinkle = 0.93 + 0.07 * Math.sin(now / 380 + i * 1.7);
      let x = row.x, y = row.y, size = STAR_SIZE, alpha = wake;
      const focus = stage === "pick" ? ([0, 1] as Slot[]).filter((sl) => a.pick[sl] === null && a.cur[sl] === i) : [];
      if (focus.length) size *= 1.12;
      if (owner >= 0 && stage !== "open" && stage !== "pick") {
        // Chosen: glide to the fighter's side and settle to a dull glow.
        x = row.x + (HOME[owner].x - row.x) * settle;
        y = row.y + (HOME[owner].y - row.y) * settle;
        size = STAR_SIZE + (104 - STAR_SIZE) * settle;
        alpha = 1 + (DULL - 1) * settle;
      } else if (owner >= 0 && !stage) {
        x = HOME[owner].x;
        y = HOME[owner].y;
        size = 104;
        alpha = DULL;
      } else if (stage === "settle" && owner < 0) alpha = 1 - Math.min(1, settle * 1.6);
      else if (!stage && owner < 0) return;
      drawStar(ctx, id, x, y, size, alpha * twinkle);
      if (stage !== "pick") return;
      // Who is looking at / has locked this one: a ring in their colour and a tag.
      const rings: { color: string; tag: string }[] = [];
      for (const sl of focus) rings.push({ color: SLOT_COLOR[sl], tag: `P${sl + 1}` });
      if (owner >= 0) rings.push({ color: "#f2b705", tag: `P${owner + 1} ✓` });
      rings.forEach((r, k) => {
        const pulse = 0.5 + 0.5 * Math.sin(now / 160 + k);
        ctx.save();
        ctx.strokeStyle = r.color;
        ctx.globalAlpha = 0.55 + 0.45 * pulse;
        ctx.lineWidth = 3;
        ctx.setLineDash(owner >= 0 ? [] : [8, 6]);
        ctx.beginPath();
        ctx.arc(x, y, size * 0.56 + k * 7, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.globalAlpha = 1;
        ctx.font = `800 14px ${this.fontDisplay}`;
        ctx.textAlign = "center";
        const w = ctx.measureText(r.tag).width + 14;
        ctx.fillStyle = r.color;
        ctx.fillRect(x - w / 2, y + size * 0.56 + 4 + k * 20, w, 19);
        ctx.fillStyle = owner >= 0 ? INK : "#fff";
        ctx.fillText(r.tag, x, y + size * 0.56 + 18 + k * 20);
        ctx.restore();
      });
    });
  }

  // Floating rocks hanging on chains, drifting a little, with parallax against the camera.
  private floating(ctx: CanvasRenderingContext2D, now: number, camX: number, scene: number, mood: number) {
    const rocks = [
      { x: 168, y: 150, w: 74, h: 112, ph: 0.3, par: 0.07 },
      { x: 806, y: 196, w: 52, h: 76, ph: 1.7, par: 0.05 },
      { x: 392, y: 118, w: 40, h: 56, ph: 2.9, par: 0.03 },
    ];
    const L = LOOKS[scene];
    // The molten edge builds with the weather instead of switching on at a scene.
    const glow = LOOKS[Math.floor(mood)].glow + (LOOKS[Math.min(4, Math.floor(mood) + 1)].glow - LOOKS[Math.floor(mood)].glow) * (mood - Math.floor(mood));
    for (const r of rocks) {
      const sway = Math.sin(now / 1700 + r.ph) * 5, bob = Math.sin(now / 1200 + r.ph * 2) * 6;
      const x = r.x + sway + (ARENA.w / 2 - camX) * r.par, y = r.y + bob;
      // Chain up to the sky.
      ctx.strokeStyle = INK;
      ctx.lineWidth = 3;
      for (let cy = y - r.h * 0.3; cy > WORLD.y0; cy -= 16) {
        ctx.beginPath();
        ctx.ellipse(x + Math.sin(cy / 40 + now / 2200) * 2, cy, 4, 7, 0, 0, Math.PI * 2);
        ctx.stroke();
      }
      // The rock: an inverted jagged block.
      ctx.fillStyle = L.rock;
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(x - r.w / 2, y - r.h * 0.3);
      ctx.lineTo(x + r.w / 2, y - r.h * 0.34);
      ctx.lineTo(x + r.w * 0.38, y + r.h * 0.1);
      ctx.lineTo(x + r.w * 0.12, y + r.h * 0.62);
      ctx.lineTo(x - r.w * 0.08, y + r.h * 0.45);
      ctx.lineTo(x - r.w * 0.4, y + r.h * 0.05);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = L.facet;
      ctx.beginPath();
      ctx.moveTo(x - r.w / 2, y - r.h * 0.3);
      ctx.lineTo(x + r.w * 0.05, y - r.h * 0.32);
      ctx.lineTo(x - r.w * 0.1, y + r.h * 0.4);
      ctx.lineTo(x - r.w * 0.4, y + r.h * 0.05);
      ctx.closePath();
      ctx.fill();
      if (glow > 0.3) {
        ctx.strokeStyle = `rgba(255,120,40,${glow * 0.5})`;
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.moveTo(x + r.w * 0.38, y + r.h * 0.1);
        ctx.lineTo(x + r.w * 0.12, y + r.h * 0.62);
        ctx.stroke();
      }
    }
  }

  // The floor's live state: crack zones, the dust and cracks of boulders about to rise, the boulders, the lava.
  mid(ctx: CanvasRenderingContext2D, s: { arena?: ArenaState; timer: number; cue?: Cue }, now: number) {
    const a = s.arena!;
    const tick = arenaTick(s);
    for (const c of a.cracks) this.crack(ctx, c, tick, now);
    for (const d of this.craters) {
      const age = (now - d.born) / 1000;
      if (age > 7) continue;
      ctx.fillStyle = `rgba(15,13,18,${0.5 * (1 - age / 7)})`;
      ctx.beginPath();
      ctx.ellipse(d.x, ARENA.ground - 8, 34, 7, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    this.craters = this.craters.filter((d) => now - d.born < 7000);
    const world = arenaWorld(s);
    const plats = platformsAt(world);
    for (const p of plats) this.platformFx(ctx, p, world, now);
    for (const p of plats) if (p.state === "rising" || p.state === "up") this.boulder(ctx, p, world, now);
    this.lava(ctx, tick, world, now);
    if (s.cue?.target) this.marks(ctx, s.cue, now);
  }

  // Guided pause: where each fighter has to stand, drawn on the surface under the fighters. A small mark is a pad with an arrow
  // over it; a wide one (the final platform) is a gold dashed line along its top with arrows at both ends.
  private marks(ctx: CanvasRenderingContext2D, cue: Cue, now: number) {
    const wide = cue.target![0].r > 60;
    cue.target!.forEach((mk, slot) => {
      const color = slot === 0 ? "#e5482d" : "#2f5be0";
      const done = cue.done[slot];
      const pulse = 0.5 + 0.5 * Math.sin(now / 200 + slot);
      const bob = Math.sin(now / 160 + slot * 2) * 4;
      ctx.save();
      ctx.lineJoin = "round";
      if (wide) {
        if (slot === 1) {
          ctx.restore();
          return; // one line for both fighters
        }
        const x0 = mk.x - mk.r, x1 = mk.x + mk.r;
        ctx.strokeStyle = INK;
        ctx.lineWidth = 9;
        ctx.beginPath();
        ctx.moveTo(x0, mk.y - 4);
        ctx.lineTo(x1, mk.y - 4);
        ctx.stroke();
        ctx.strokeStyle = `rgba(242,183,5,${0.65 + 0.35 * pulse})`;
        ctx.lineWidth = 5;
        ctx.setLineDash([16, 10]);
        ctx.lineDashOffset = -now / 40;
        ctx.stroke();
        ctx.setLineDash([]);
        for (const ax of [x0 + 30, x1 - 30, mk.x]) {
          ctx.fillStyle = "#f2b705";
          ctx.strokeStyle = INK;
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.moveTo(ax, mk.y - 38 + bob);
          ctx.lineTo(ax + 14, mk.y - 58 + bob);
          ctx.lineTo(ax - 14, mk.y - 58 + bob);
          ctx.closePath();
          ctx.fill();
          ctx.stroke();
        }
        ctx.restore();
        return;
      }
      // A stand-here pad.
      ctx.translate(mk.x, mk.y - 2);
      ctx.fillStyle = done ? "rgba(242,183,5,.6)" : `${color}40`;
      ctx.beginPath();
      ctx.ellipse(0, 0, mk.r + 6, (mk.r + 6) * 0.24, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = INK;
      ctx.lineWidth = 5;
      ctx.stroke();
      ctx.strokeStyle = done ? "#f2b705" : color;
      ctx.lineWidth = 3;
      ctx.setLineDash(done ? [] : [10, 6]);
      ctx.lineDashOffset = -now / 50;
      ctx.stroke();
      ctx.setLineDash([]);
      // Footprints, and the arrow that says "here".
      ctx.fillStyle = done ? "#f2b705" : `${color}cc`;
      for (const fx of [-mk.r * 0.35, mk.r * 0.35]) {
        ctx.beginPath();
        ctx.ellipse(fx, 0, 6, 2.6, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      if (!done) {
        ctx.fillStyle = color;
        ctx.strokeStyle = INK;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(0, -34 + bob);
        ctx.lineTo(13, -56 + bob);
        ctx.lineTo(-13, -56 + bob);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      }
      ctx.font = `800 15px ${this.fontDisplay}`;
      ctx.textAlign = "center";
      const label = done ? `P${slot + 1} ✓` : `P${slot + 1}`;
      const w = ctx.measureText(label).width + 16;
      ctx.fillStyle = done ? "#f2b705" : color;
      ctx.strokeStyle = INK;
      ctx.lineWidth = 3;
      ctx.fillRect(-w / 2, -80 + bob * (done ? 0 : 1), w, 22);
      ctx.strokeRect(-w / 2, -80 + bob * (done ? 0 : 1), w, 22);
      ctx.fillStyle = done ? INK : "#fff";
      ctx.fillText(label, 0, -64 + bob * (done ? 0 : 1));
      ctx.restore();
    });
  }

  private crack(ctx: CanvasRenderingContext2D, c: ArenaState["cracks"][number], tick: number, now: number) {
    const live = tick >= c.born + c.glow;
    const y = ARENA.ground;
    const grow = Math.min(1, (tick - c.born) / 24); // the fissure opens over the first 0.4 s
    const w = c.w * grow, x0 = c.x - w / 2;
    const pulse = 0.5 + 0.5 * Math.sin(now / (live ? 90 : 160));
    // Glow on the floor strip.
    const glow = ctx.createRadialGradient(c.x, y - 6, 4, c.x, y - 6, c.w * 0.9);
    glow.addColorStop(0, `rgba(255,150,40,${live ? 0.65 : 0.18 + 0.3 * Math.min(1, (tick - c.born) / c.glow)})`);
    glow.addColorStop(1, "rgba(255,80,20,0)");
    ctx.fillStyle = glow;
    ctx.fillRect(c.x - c.w, y - c.w * 0.9, c.w * 2, c.w * 1.1);
    // The fissure: the floor strip is seen at a grazing angle, so a crack zone is a flat glowing patch with a jagged edge, and the
    // crack runs on down the front of the slab.
    const R = rng(c.id * 17 + 3);
    const topY = y - 17, botY = y - 1, n = 7;
    ctx.beginPath();
    ctx.moveTo(x0, (topY + botY) / 2);
    for (let k = 1; k < n; k++) ctx.lineTo(x0 + (w * k) / n, topY + R() * 5 - 1);
    ctx.lineTo(x0 + w, (topY + botY) / 2);
    for (let k = n - 1; k > 0; k--) ctx.lineTo(x0 + (w * k) / n, botY - R() * 4 + 1);
    ctx.closePath();
    ctx.fillStyle = live ? `rgb(255,${150 + pulse * 70},40)` : `rgba(255,${100 + pulse * 60},30,${0.35 + 0.4 * Math.min(1, (tick - c.born) / c.glow)})`;
    ctx.fill();
    if (!live) {
      // Telegraph: hazard hatching, so a harmless crack reads differently from a leaking one.
      ctx.save();
      ctx.clip();
      ctx.strokeStyle = "rgba(15,13,18,.75)";
      ctx.lineWidth = 2.5;
      for (let hx = x0 - 20; hx < x0 + w + 20; hx += 9) {
        ctx.beginPath();
        ctx.moveTo(hx, topY - 2);
        ctx.lineTo(hx + 14, botY + 2);
        ctx.stroke();
      }
      ctx.restore();
    }
    ctx.strokeStyle = INK;
    ctx.lineWidth = 3.5;
    ctx.stroke();
    // Fissures down the front of the slab, lit from within.
    for (let f = 0; f < 3; f++) {
      let fx = x0 + w * (0.18 + 0.32 * f), fy = botY;
      const pts: [number, number][] = [[fx, fy]];
      for (let k = 0; k < 4; k++) {
        fx += (R() - 0.5) * 12;
        fy += 11 + R() * 4;
        pts.push([fx, fy]);
      }
      for (const [lw, col] of [[4.5, INK], [2.6, live ? "#ff7a1a" : "rgba(255,120,30,.55)"], [1.1, live ? "#ffe07a" : "rgba(255,210,120,.4)"]] as const) {
        ctx.strokeStyle = col;
        ctx.lineWidth = lw * grow;
        ctx.beginPath();
        pts.forEach(([px, py], k) => (k ? ctx.lineTo(px, py) : ctx.moveTo(px, py)));
        ctx.stroke();
      }
    }
    if (live) {
      // Leaking: bubbles popping on the surface, a drip down the face.
      for (let b = 0; b < 4; b++) {
        const t = ((now / 700 + b * 0.27 + c.x * 0.013) % 1);
        const bx = x0 + w * (0.15 + 0.7 * ((b * 0.37 + c.x * 0.01) % 1));
        ctx.fillStyle = "#ffe07a";
        ctx.strokeStyle = INK;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(bx, topY + 4 - t * 16, 2 + (1 - t) * 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
      ctx.fillStyle = "#ff8a22";
      ctx.fillRect(c.x - 2, y, 4, 40 + pulse * 6);
    }
  }

  // The warning for a rock about to rise: dust ring and hairline cracks on the floor, pebbles jumping. Louder as it nears.
  private platformFx(ctx: CanvasRenderingContext2D, p: Platform, tick: number, now: number) {
    if (p.state !== "warn" && !(p.state === "rising" && p.riseT < 20)) return;
    const def = ROCK_DEFS.find((d) => d.id === p.id)!;
    const t = p.state === "warn" ? (tick - def.warn) / (def.rise - def.warn) : 1;
    const cx = p.x + p.w / 2, y = ARENA.ground - 6;
    const pulse = (now / 600) % 1;
    ctx.strokeStyle = `rgba(214,190,150,${0.35 + 0.5 * t})`;
    ctx.lineWidth = 3;
    for (let k = 0; k < 2; k++) {
      const ph = (pulse + k * 0.5) % 1;
      ctx.beginPath();
      ctx.ellipse(cx, y, p.w * (0.35 + 0.7 * ph), 6 + 7 * ph, 0, 0, Math.PI * 2);
      ctx.globalAlpha = (1 - ph) * (0.5 + 0.5 * t);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    // Hairline cracks radiating from the spot, and pebbles that hop.
    ctx.strokeStyle = INK;
    ctx.lineWidth = 2.5;
    for (let k = 0; k < 5; k++) {
      const ox = p.x + (p.w * (k + 0.5)) / 5;
      ctx.beginPath();
      ctx.moveTo(ox, ARENA.ground - 16);
      ctx.lineTo(ox + (k % 2 ? 6 : -6), ARENA.ground - 5);
      ctx.lineTo(ox + (k % 2 ? -3 : 4), ARENA.ground + 4);
      ctx.stroke();
      const hop = Math.abs(Math.sin(now / (110 + k * 17) + k)) * (4 + 14 * t);
      ctx.fillStyle = "#5a5260";
      ctx.beginPath();
      ctx.arc(ox + Math.sin(now / 200 + k) * 3, ARENA.ground - 20 - hop, 2.4, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
  }

  // A boulder column standing on the floor: charcoal stone with a lit top slab, ink outline, seams that glow as the lava climbs.
  private boulder(ctx: CanvasRenderingContext2D, p: Platform, world: number, now: number) {
    const R = rng(p.id * 131);
    const top = p.top, bot = ARENA.ground + 10, x = p.x, w = p.w;
    const L = LOOKS[Math.min(4, sceneAt(world))];
    const heat = Math.max(0, Math.min(1, (ARENA.ground - lavaY(world) + 60) / 220));
    const shake = p.state === "rising" ? Math.sin(now / 24) * 1.6 : 0;
    ctx.save();
    ctx.translate(shake, 0);
    ctx.fillStyle = "#322d3a";
    ctx.strokeStyle = INK;
    ctx.lineWidth = 4.5;
    ctx.beginPath();
    ctx.moveTo(x - 4, bot);
    ctx.lineTo(x - 7 + R() * 4, top + 16);
    ctx.lineTo(x + w * 0.2, top + 3 + R() * 4);
    ctx.lineTo(x + w * 0.55, top - 1 + R() * 3);
    ctx.lineTo(x + w + 7 - R() * 4, top + 14);
    ctx.lineTo(x + w + 4, bot);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    // The top slab you stand on.
    ctx.fillStyle = "#5b5265";
    ctx.beginPath();
    ctx.moveTo(x - 5, top + 15);
    ctx.lineTo(x + w * 0.2, top + 2);
    ctx.lineTo(x + w * 0.55, top - 2);
    ctx.lineTo(x + w + 5, top + 13);
    ctx.lineTo(x + w + 3, top + 24);
    ctx.lineTo(x - 3, top + 25);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    // Strata: horizontal courses of stone, so a tall boulder reads as rock and not as a box.
    ctx.strokeStyle = "rgba(15,13,18,.55)";
    ctx.lineWidth = 2;
    for (let cy = top + 46; cy < bot - 6; cy += 34 + R() * 14) {
      ctx.beginPath();
      ctx.moveTo(x - 3, cy);
      ctx.lineTo(x + w * (0.3 + R() * 0.2), cy + (R() - 0.5) * 6);
      ctx.lineTo(x + w * (0.6 + R() * 0.2), cy + (R() - 0.5) * 6);
      ctx.lineTo(x + w + 3, cy + (R() - 0.5) * 4);
      ctx.stroke();
    }
    ctx.fillStyle = "rgba(255,255,255,.06)";
    ctx.fillRect(x + 2, top + 26, Math.min(14, w * 0.12), Math.max(0, bot - top - 30));
    // Cracks and hatching down the face; seams light up with the heat.
    ctx.lineWidth = 2.2;
    for (let k = 0; k < 4 + Math.floor(w / 80); k++) {
      const cx = x + 8 + R() * (w - 16), cy = top + 30 + R() * Math.max(10, bot - top - 50);
      ctx.strokeStyle = INK;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + (R() - 0.5) * 22, cy + 14 + R() * 18);
      ctx.stroke();
      if (heat > 0.05) {
        ctx.strokeStyle = `rgba(255,${110 + heat * 80},30,${0.25 + heat * 0.6})`;
        ctx.lineWidth = 1.6;
        ctx.stroke();
        ctx.lineWidth = 2.2;
      }
    }
    void L;
    ctx.restore();
    // Dust falling off a rising rock.
    if (p.state === "rising") {
      for (let k = 0; k < 5; k++) {
        const dx = p.x + R() * p.w + Math.sin(now / 90 + k) * 4, dy = top + 6 + ((now / 5 + k * 40) % 60);
        ctx.fillStyle = "rgba(214,190,150,.55)";
        ctx.beginPath();
        ctx.arc(dx, dy, 2 + (k % 3), 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  // Rising lava in scene 5: a glowing surface with a wavy edge, in front of the boulders and the floor.
  private lava(ctx: CanvasRenderingContext2D, tick: number, world: number, now: number) {
    const y = lavaY(world);
    if (y >= ARENA.h + 60 || tick < ARENA_TUNE.scenes[4]) return;
    const x0 = WORLD.x0, x1 = WORLD.x1, bottom = WORLD.y1;
    const gr = ctx.createLinearGradient(0, y, 0, y + 200);
    gr.addColorStop(0, "#ff8a22");
    gr.addColorStop(0.18, "#ee4a14");
    gr.addColorStop(1, "#6a0c06");
    ctx.fillStyle = gr;
    ctx.beginPath();
    ctx.moveTo(x0, bottom);
    for (let x = x0; x <= x1; x += 24) ctx.lineTo(x, y + Math.sin(x * 0.035 + now / 420) * 3.5 + Math.sin(x * 0.011 - now / 900) * 3);
    ctx.lineTo(x1, bottom);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = INK;
    ctx.lineWidth = 3.5;
    ctx.beginPath();
    for (let x = x0; x <= x1; x += 24) {
      const yy = y + Math.sin(x * 0.035 + now / 420) * 3.5 + Math.sin(x * 0.011 - now / 900) * 3;
      if (x === x0) ctx.moveTo(x, yy);
      else ctx.lineTo(x, yy);
    }
    ctx.stroke();
    ctx.strokeStyle = "rgba(255,226,120,.8)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let x = x0; x <= x1; x += 24) {
      const yy = y + 5 + Math.sin(x * 0.035 + now / 420 + 1) * 3;
      if (x === x0) ctx.moveTo(x, yy);
      else ctx.lineTo(x, yy);
    }
    ctx.stroke();
    // Bubbles.
    for (let b = 0; b < 9; b++) {
      const t = (now / 900 + b * 0.31) % 1;
      const bx = 60 + ((b * 113 + 40) % 840);
      ctx.fillStyle = "#ffd96a";
      ctx.strokeStyle = INK;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(bx, y + 12 + t * 40, 2 + (1 - t) * 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
  }

  // Over the fighters: meteors with their markers, embers and ash, heat shimmer.
  front(ctx: CanvasRenderingContext2D, s: StageState, now: number, reduce: boolean) {
    const a = s.arena!;
    const tick = arenaTick(s);
    const T = ARENA_TUNE.meteor;
    for (const m of a.meteors) {
      const left = m.hit - tick;
      const p = Math.max(0, Math.min(1, 1 - left / T.warn));
      const r = T.r * (0.3 + 0.7 * p);
      const y = ARENA.ground - 3;
      // The marker: a growing shadow, a pulsing ring, a column of light.
      ctx.fillStyle = `rgba(15,13,18,${0.25 + 0.3 * p})`;
      ctx.beginPath();
      ctx.ellipse(m.x, y, r * 1.25, r * 0.28, 0, 0, Math.PI * 2);
      ctx.fill();
      const pulse = 0.5 + 0.5 * Math.sin(now / (150 - 90 * p));
      ctx.strokeStyle = `rgba(255,${70 + pulse * 90},30,${0.5 + 0.5 * p})`;
      ctx.lineWidth = 3.5;
      ctx.setLineDash([9, 6]);
      ctx.beginPath();
      ctx.ellipse(m.x, y, (T.r + T.reach) * 0.95, (T.r + T.reach) * 0.2, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.strokeStyle = `rgba(255,120,40,${0.15 + 0.25 * p})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(m.x, y);
      ctx.lineTo(m.x + 30, -120);
      ctx.stroke();
      // The rock itself falls in the last 0.6 s along a slant, trailing flame.
      const fall = 36;
      if (left <= fall) {
        const f = 1 - left / fall;
        const rx = m.x + (1 - f) * 150, ry = -80 + f * (y + 80 - 22);
        const tail = ctx.createLinearGradient(rx, ry, rx + 90, ry - 110);
        tail.addColorStop(0, "rgba(255,200,60,.95)");
        tail.addColorStop(1, "rgba(255,80,20,0)");
        ctx.strokeStyle = tail;
        ctx.lineWidth = 16;
        ctx.beginPath();
        ctx.moveTo(rx, ry);
        ctx.lineTo(rx + 90, ry - 110);
        ctx.stroke();
        ctx.fillStyle = "#3a2e2e";
        ctx.strokeStyle = INK;
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(rx - 22, ry + 4);
        ctx.lineTo(rx - 8, ry - 20);
        ctx.lineTo(rx + 14, ry - 18);
        ctx.lineTo(rx + 24, ry + 6);
        ctx.lineTo(rx + 4, ry + 22);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = "#ff8a22";
        ctx.beginPath();
        ctx.arc(rx + 3, ry - 2, 6, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    // Heat shimmer: wavy lines of bent light rising off the floor and tall faint plumes of hot air, strongest in the heatwave (scene 2),
    // lower for the rest of the fight. "Reduce flashes" turns it down to a whisper. No blur, no full-screen distortion.
    const heat = heatAt(arenaWorld(s));
    if (heat > 0.02) {
      const k = reduce ? 0.3 : 1;
      ctx.lineWidth = 2.5;
      for (let n = 0; n < 12; n++) {
        const yy = ARENA.ground - 24 - n * 18, ph = now / 400 + n * 1.3;
        ctx.strokeStyle = `rgba(255,232,188,${(0.06 + 0.22 * heat * (1 - n / 15)) * k})`;
        ctx.beginPath();
        const amp = (3 + 6 * heat) * (reduce ? 0.4 : 1);
        for (let x = 30; x <= ARENA.w - 30; x += 18) {
          const yv = yy + Math.sin(x * 0.028 + ph) * amp + Math.sin(x * 0.011 - ph * 0.6) * amp * 0.6;
          if (x === 30) ctx.moveTo(x, yv);
          else ctx.lineTo(x, yv);
        }
        ctx.stroke();
      }
      // Plumes of hot air: soft tall ellipses of pale light drifting side to side (one radial gradient, stretched).
      const plume = ctx.createRadialGradient(0, 0, 0, 0, 0, 50);
      plume.addColorStop(0, `rgba(255,222,165,${0.16 * heat * k})`);
      plume.addColorStop(1, "rgba(255,222,165,0)");
      ctx.fillStyle = plume;
      for (let n = 0; n < 8; n++) {
        ctx.save();
        ctx.translate(70 + n * 118 + Math.sin(now / 900 + n * 2) * 18, ARENA.ground - 100 - 18 * Math.sin(now / 1100 + n));
        ctx.scale(0.8 + 0.25 * Math.sin(now / 700 + n), 2.2);
        ctx.fillRect(-50, -50, 100, 100);
        ctx.restore();
      }
    }
    this.sparks(ctx, this.mood(s), arenaWorld(s), reduce);
  }

  // Embers drifting up and ash falling, capped.
  private sparks(ctx: CanvasRenderingContext2D, mood: number, world: number, reduce: boolean) {
    const cap = reduce ? 14 : 36;
    // The embers and the ash build up with the weather (mood 0..4), not at a scene's first tick.
    const rates = [0.04, 0.08, 0.16, 0.3, 0.45], lo = Math.floor(mood);
    const rate = (rates[lo] + (rates[Math.min(4, lo + 1)] - rates[lo]) * (mood - lo)) * (reduce ? 0.5 : 1);
    if (this.embers.length < cap && Math.random() < rate) {
      const ash = Math.random() < Math.max(0, Math.min(1, (mood - 2.2) / 1.4)) * 0.45;
      this.embers.push(
        ash
          ? { x: Math.random() * ARENA.w, y: -20, vx: (Math.random() - 0.3) * 0.5, vy: 0.5 + Math.random() * 0.8, life: 0, max: 520, size: 1.5 + Math.random() * 1.8, ash: true }
          : { x: 40 + Math.random() * 880, y: Math.min(ARENA.h, lavaY(world)) + 10, vx: (Math.random() - 0.5) * 0.7, vy: -(0.6 + Math.random() * 1.4), life: 0, max: 200 + Math.random() * 200, size: 1 + Math.random() * 2.2, ash: false },
      );
    }
    this.embers = this.embers.filter((e) => ++e.life < e.max && e.y > -60 && e.y < ARENA.h + 80);
    for (const e of this.embers) {
      e.x += e.vx + Math.sin((e.life + e.x) / 30) * 0.3;
      e.y += e.vy;
      const a = Math.min(1, e.life / 20) * (1 - e.life / e.max);
      ctx.fillStyle = e.ash ? `rgba(40,30,34,${0.7 * a})` : `rgba(255,${150 + (e.life % 70)},50,${a})`;
      ctx.beginPath();
      ctx.arc(e.x, e.y, e.size, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // ---------------------------------------------------------------- events, camera, HUD

  // An arena event from the sim: what the view keeps for itself (the renderer adds sound, shake and particles).
  event(e: ArenaGameEvent, now: number) {
    if (e.kind === "impact") {
      this.craters.push({ x: e.x, born: now });
      this.dust.push({ x: e.x, born: now });
    }
  }

  // How hard the ground is shaking right now (world px, before "reduce flashes"): rumbles before a boulder rises, while one
  // rises, the last seconds of scene 3 and 4, and the eruption at the start of scene 5.
  tremor(s: { arena?: ArenaState; timer: number }): number {
    const tick = arenaTick(s);
    const sc = ARENA_TUNE.scenes;
    let t = 0;
    if (tick >= sc[3] - 5 * TICK_HZ && tick < sc[3]) t = 1.5;
    if (tick >= sc[4] - 8 * TICK_HZ && tick < sc[4]) t = 2 + ((tick - (sc[4] - 8 * TICK_HZ)) / (8 * TICK_HZ)) * 3;
    if (tick >= sc[4] && tick < sc[4] + 4 * TICK_HZ) t = 5 * (1 - (tick - sc[4]) / (4 * TICK_HZ)) + 1;
    for (const p of platformsAt(arenaWorld(s))) {
      if (p.state === "warn") t = Math.max(t, 1.2);
      if (p.state === "rising") t = Math.max(t, 4);
    }
    return t;
  }

  // The camera for an arena fight: both fighters in frame, with room for their heads under the HUD, zoomed out when one is up
  // on a platform. A special's push-in or the KO (render.ts) override it.
  camera(fighters: { x: number; y: number }[], cue?: Cue): { z: number; x: number; y: number } {
    // The ceremony looks up: the sky with its constellations above, the two fighters standing below.
    if (cue?.id === "open" || cue?.id === "pick" || cue?.id === "settle") return { z: 0.85, x: ARENA.w / 2, y: 215 };
    // A pause that sends them up somewhere keeps that spot in frame too.
    const headTop = Math.min(...fighters.map((f) => f.y), ...(cue?.target?.map((t) => t.y) ?? [])) - 170 - 20;
    const feetBot = Math.max(...fighters.map((f) => f.y)) + 70;
    const hud = 130; // screen units the HUD takes at the top
    const z = Math.max(0.8, Math.min(1, ARENA.h / (feetBot - headTop + hud)));
    // Heads below the HUD; never look lower than the normal view when both stand on the floor.
    const y = Math.min(ARENA.h / 2, headTop - hud / z + ARENA.h / (2 * z));
    return { z, x: ARENA.w / 2, y };
  }

  // HUD pieces in screen space (960 x 540 units): the clock, the scene name, hazard warnings.
  hud(ctx: CanvasRenderingContext2D, s: StageState, now: number, z: number, info: { names: [string, string]; you: Slot }) {
    const a = s.arena!;
    const tick = arenaTick(s);
    const scene = sceneAt(tick);
    const secs = Math.max(0, Math.ceil(s.timer / TICK_HZ));
    // The opening ceremony has no clock or health bars yet (Renderer.hud skips them): a title card instead.
    const opening = s.cue?.id === "open" || s.cue?.id === "pick";
    if (opening) {
      const pop = Math.min(1, s.phaseT / 20);
      ctx.save();
      ctx.globalAlpha = pop;
      ctx.textAlign = "center";
      ctx.lineJoin = "round";
      ctx.lineWidth = 7;
      ctx.strokeStyle = INK;
      ctx.fillStyle = "#f2b705";
      ctx.font = `800 ${Math.round(13 * Math.min(z, 1.5))}px ${this.fontDisplay}`;
      ctx.strokeText("ARENA 1", ARENA.w / 2, 26);
      ctx.fillText("ARENA 1", ARENA.w / 2, 26);
      ctx.fillStyle = "#fff9ed";
      ctx.font = `800 ${Math.round(28 * Math.min(z, 1.5))}px ${this.fontDisplay}`;
      ctx.strokeText("INFERNO CRATER", ARENA.w / 2, 58 + 6 * (z - 1));
      ctx.fillText("INFERNO CRATER", ARENA.w / 2, 58 + 6 * (z - 1));
      ctx.restore();
    } else {
      ctx.textAlign = "center";
      ctx.font = `800 ${Math.round(36 * Math.min(z, 1.5))}px ${this.fontDisplay}`;
      ctx.fillStyle = secs <= 10 ? "#e5482d" : INK;
      ctx.fillText(`${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, "0")}`, ARENA.w / 2, 62);
      ctx.font = `700 ${Math.round(11 * z)}px ${this.fontBody}`;
      ctx.fillStyle = "#6b6a66";
      ctx.fillText(`${scene + 1}/5 · ${SCENE_NAMES[scene]}`, ARENA.w / 2, 82 + 8 * (z - 1));
    }
    if (s.cue) this.cueBanner(ctx, s.cue, now, z, opening ? (z > 1.25 ? 168 : 224) : undefined);
    if (s.cue?.id === "pick") this.pickUi(ctx, s, z, info);
    if (s.phase !== "fight") return;

    // A stamped tag when the scene changes (small, in the corner of the action, never blocking).
    const into = tick - ARENA_TUNE.scenes[scene];
    if (into < 3 * TICK_HZ) {
      const pop = Math.min(1, into / 8), fade = Math.min(1, (3 * TICK_HZ - into) / 30);
      ctx.save();
      ctx.translate(ARENA.w / 2, 140);
      ctx.rotate(-0.04);
      ctx.scale(0.8 + 0.2 * pop, 0.8 + 0.2 * pop);
      ctx.globalAlpha = fade;
      ctx.font = `800 ${Math.round(18 * Math.min(z, 1.3))}px ${this.fontDisplay}`;
      const label = `${scene + 1} · ${SCENE_NAMES[scene]}`;
      const w = ctx.measureText(label).width + 28;
      ctx.fillStyle = "#fff9ed";
      ctx.strokeStyle = INK;
      ctx.lineWidth = 3.5;
      ctx.fillRect(-w / 2, -16, w, 32);
      ctx.strokeRect(-w / 2, -16, w, 32);
      ctx.fillStyle = "#e5482d";
      ctx.fillText(label, 0, 6);
      ctx.restore();
    }

    // The first seconds of scene 5: how to come down from a platform (hold block, press jump).
    if (scene === 4 && into < 10 * TICK_HZ) {
      ctx.font = `700 ${Math.round(12 * z)}px ${this.fontBody}`;
      const tip = "On a platform: hold BLOCK and press JUMP to drop down";
      const tw = ctx.measureText(tip).width + 20;
      ctx.fillStyle = `rgba(15,13,18,${0.75 * Math.min(1, (10 * TICK_HZ - into) / 30)})`;
      ctx.fillRect(ARENA.w / 2 - tw / 2, ARENA.h - 30 - 4 * (z - 1), tw, 20 + 4 * (z - 1));
      ctx.fillStyle = "#fff9ed";
      ctx.fillText(tip, ARENA.w / 2, ARENA.h - 15);
    }

    // Warnings: one or two short red tags under the clock for what is about to hurt.
    const warns: string[] = [];
    if (a.cracks.some((c) => tick < c.born + c.glow)) warns.push("GROUND CRACKING");
    if (a.meteors.length) warns.push("METEOR INCOMING");
    if (platformsAt(arenaWorld(s)).some((p) => p.state === "warn")) warns.push("THE GROUND SHAKES");
    if (scene === 4 && lavaY(arenaWorld(s)) < ARENA.ground + 20) warns.push("LAVA ON THE FLOOR");
    warns.slice(0, 2).forEach((w, k) => {
      const pulse = 0.75 + 0.25 * Math.sin(now / 120);
      ctx.font = `800 ${Math.round(12 * z)}px ${this.fontDisplay}`;
      const tw = ctx.measureText(w).width + 18;
      const y = 118 + 8 * (z - 1) + k * (20 + 4 * (z - 1)); // under the HUD plates
      ctx.fillStyle = `rgba(229,72,45,${pulse})`;
      ctx.fillRect(ARENA.w / 2 - tw / 2, y - 13, tw, 18);
      ctx.fillStyle = "#fff";
      ctx.fillText(w, ARENA.w / 2, y);
    });
  }
  // The ceremony's pop-ups: one per fighter, black and grey like the select screen they are modelled on, with the five constellations
  // to choose from (the cursor in the fighter's colour) and the focused one's skill on a yellow plate. They slide in from the sides.
  // On a phone only the player's own is drawn, larger (the canvas is tiny there).
  private pickUi(ctx: CanvasRenderingContext2D, s: StageState, z: number, info: { names: [string, string]; you: Slot }) {
    const a = s.arena!;
    const compact = z > 1.25;
    const k = compact ? 1.25 : 1;
    const w = PANEL.w * k;
    const pop = ease(Math.min(1, s.phaseT / 14));
    for (const slot of compact ? [info.you] : ([0, 1] as Slot[])) {
      const side = slot === 0 ? -1 : 1;
      const x = compact ? (ARENA.w - w) / 2 : slot === 0 ? 10 : ARENA.w - 10 - w;
      const y = compact ? 205 : 252;
      ctx.save();
      ctx.globalAlpha = pop;
      this.panel(ctx, a, slot, x + (compact ? 0 : side * (1 - pop) * (w + 40)), y + (compact ? (1 - pop) * 80 : 0), k, info.names[slot], slot === info.you);
      ctx.restore();
    }
  }

  private panel(ctx: CanvasRenderingContext2D, a: ArenaState, slot: Slot, x: number, y: number, k: number, name: string, mine: boolean) {
    const { w: W, h: H } = PANEL;
    const color = SLOT_COLOR[slot];
    const locked = a.pick[slot] !== null;
    const poly = (pts: [number, number][]) => {
      ctx.beginPath();
      pts.forEach(([px, py], i) => (i ? ctx.lineTo(px, py) : ctx.moveTo(px, py)));
      ctx.closePath();
    };
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(k, k);
    ctx.lineJoin = "round";
    // The body: black, the top-right corner cut.
    ctx.fillStyle = "rgba(0,0,0,.45)";
    poly([[6, 6], [W - 14, 6], [W + 6, 26], [W + 6, H + 6], [6, H + 6]]);
    ctx.fill();
    ctx.fillStyle = "#0f0d12";
    poly([[0, 0], [W - 20, 0], [W, 20], [W, H], [0, H]]);
    ctx.fill();
    // The header: the player's tag and name.
    ctx.fillStyle = color;
    ctx.fillRect(5, 3, 28, 26);
    ctx.fillStyle = "#fff";
    ctx.font = `800 13px ${this.fontDisplay}`;
    ctx.textAlign = "center";
    ctx.fillText(`P${slot + 1}`, 19, 21);
    ctx.textAlign = "left";
    ctx.font = `800 14px ${this.fontDisplay}`;
    ctx.fillText(name, 40, 21, locked ? 92 : 150);
    if (locked) {
      ctx.fillStyle = "#f2b705";
      ctx.textAlign = "right";
      ctx.font = `800 12px ${this.fontDisplay}`;
      ctx.fillText("LOCKED ✓", W - 24, 21);
    }
    ctx.fillStyle = "#f2b705";
    ctx.fillRect(0, 32, W - 4, 3);
    // The five rows.
    CONSTELLATIONS.forEach((id, i) => {
      const ry = 40 + i * 28;
      const by = a.pick.indexOf(id);
      const chosen = by === slot, taken = by >= 0 && by !== slot;
      const focus = !locked && a.cur[slot] === i;
      ctx.fillStyle = chosen ? "#f2b705" : focus ? "#3b3b45" : taken ? "#17171b" : "#26262c";
      ctx.fillRect(7, ry, W - 14, 25);
      if (focus) {
        ctx.strokeStyle = color;
        ctx.lineWidth = 2.5;
        ctx.strokeRect(8, ry + 1, W - 16, 23);
        ctx.fillStyle = color;
        ctx.fillRect(7, ry, 6, 25);
      }
      ctx.fillStyle = "#0f0d12";
      ctx.fillRect(16, ry + 2, 34, 21);
      ctx.globalAlpha = taken || (locked && !chosen) ? 0.4 : 1;
      drawStar(ctx, id, 33, ry + 12.5, 28, 1);
      ctx.font = `800 14px ${this.fontDisplay}`;
      ctx.textAlign = "left";
      ctx.fillStyle = chosen ? "#0f0d12" : "#fff";
      ctx.fillText(starInfo(id).name.toUpperCase(), 58, ry + 17.5);
      ctx.globalAlpha = 1;
      ctx.textAlign = "right";
      ctx.font = `800 11px ${this.fontDisplay}`;
      if (taken) {
        ctx.fillStyle = SLOT_COLOR[by];
        ctx.fillText(`P${by + 1}`, W - 16, ry + 17);
      } else if (focus && mine) {
        ctx.fillStyle = color;
        ctx.fillText("◀  ▶", W - 16, ry + 17);
      } else if (chosen) {
        ctx.fillStyle = "#0f0d12";
        ctx.fillText("LOCKED", W - 16, ry + 17);
      }
    });
    // The yellow plate: what the focused constellation grants.
    const shown = locked ? a.pick[slot]! : CONSTELLATIONS[a.cur[slot]];
    const info = starInfo(shown);
    ctx.fillStyle = "#f2b705";
    poly([[0, 186], [W, 186], [W, H], [12, H]]);
    ctx.fill();
    ctx.fillStyle = "#0f0d12";
    ctx.textAlign = "left";
    ctx.font = `800 16px ${this.fontDisplay}`;
    ctx.fillText(info.name.toUpperCase(), 14, 205);
    let fs = 11.5;
    ctx.font = `700 ${fs}px ${this.fontBody}`;
    while (ctx.measureText(info.skill).width > W - 28 && fs > 8) ctx.font = `700 ${(fs -= 0.5)}px ${this.fontBody}`;
    ctx.fillText(info.skill, 14, 222);
    ctx.fillStyle = starColor(shown);
    ctx.fillRect(0, 186, 5, H - 186);
    // How to choose (on the player's own panel).
    if (mine && !locked) {
      ctx.fillStyle = "#0f0d12";
      ctx.fillRect(0, H + 6, W, 20);
      ctx.fillStyle = "#fff9ed";
      ctx.textAlign = "center";
      ctx.font = `700 10.5px ${this.fontBody}`;
      ctx.fillText("◀ ▶  CHOOSE    PUNCH  LOCKS IT", W / 2, H + 19.5);
    }
    ctx.restore();
  }

  // The headline of a guided pause, under the HUD: what to do, and who has done it (P1 ✓ / P2 ...).
  private cueBanner(ctx: CanvasRenderingContext2D, cue: Cue, now: number, z: number, y = 168 + 10 * (z - 1)) {
    const size = Math.round(30 * Math.min(z, 1.35));
    ctx.save();
    ctx.translate(ARENA.w / 2, y);
    ctx.rotate(-0.025);
    ctx.font = `800 ${size}px ${this.fontDisplay}`;
    ctx.textAlign = "center";
    const w = ctx.measureText(cue.text).width + 56;
    const h = size + 18;
    ctx.fillStyle = "rgba(0,0,0,.35)";
    ctx.fillRect(-w / 2 + 6, -h / 2 + 6, w, h);
    ctx.fillStyle = "#0f0d12";
    ctx.fillRect(-w / 2, -h / 2, w, h);
    ctx.fillStyle = "#f2b705";
    ctx.fillRect(-w / 2, h / 2 - 5, w, 5);
    ctx.fillStyle = "#fff9ed";
    ctx.fillText(cue.text, 0, size * 0.34);
    if (cue.target) {
      ctx.font = `800 ${Math.round(13 * Math.min(z, 1.3))}px ${this.fontDisplay}`;
      cue.done.forEach((d, slot) => {
        ctx.fillStyle = d ? "#f2b705" : slot === 0 ? "#ff7a5c" : "#7c9bff";
        ctx.fillText(`P${slot + 1} ${d ? "✓" : "…"}`, (slot === 0 ? -1 : 1) * (w / 2 - 34), h / 2 + 18);
      });
    }
    ctx.restore();
  }

}
