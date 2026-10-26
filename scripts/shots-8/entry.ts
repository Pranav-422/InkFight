// Draws real Renderer frames of the dungeon bosses: an idle frame and a signature-move frame per boss, for the screenshots in
// docs/changes/sprint-8-bosses.md, and a sheet of all ten heads. Bundled by run.mjs (esbuild) and opened in headless Chromium (Playwright).
// It is a development tool, not part of the game.

import { cpuThink, newBrain } from "../../src/game/cpu";
import { bossFighter, bossKnobs, bossPersona, bossRun } from "../../src/game/dungeon";
import { BOSS_LOOKS } from "../../src/game/bossLook";
import { bossSprite } from "../../src/game/bossSprite";
import { CLASS_ITEM, CLASS_SPECIAL, CLASS_STYLE, MOVES, type MoveName } from "../../src/game/moves";
import { Renderer } from "../../src/game/render";
import { createMatch, EMPTY_INPUT, snapshot, step } from "../../src/game/sim";
import { loadSpriteCached } from "../../src/game/sprite";
import { buildFor } from "../../src/game/stickman";
import { clampStats, ruleStats } from "../../src/lib/stats";

const neutral = { size: "medium", pose: "neutral", dominant_colors: [] } as const;
const kit = (cls: string) => ({ ...ruleStats(cls, { ...neutral, dominant_colors: [] }), class: cls, item: CLASS_ITEM[cls], style: CLASS_STYLE[cls], specialKind: CLASS_SPECIAL[cls] });

// One frame. at: "idle" (the boss standing), "move" (a chain move of the boss's, in its active frames), "special" / "ult" (the boss casts, `t` ticks in),
// "walk" (walking toward you), "hit" (the boss is struck), "form2" (just after the form change). gap: px between the two fighters (default: the
// move's reach, or 300 for idle). settle: frames to draw first (the camera and the fades ease in real time).
export type Spec = { name: string; floor: number; at: "idle" | "move" | "special" | "ult" | "walk" | "hit" | "form2" | "armed"; move?: MoveName; t?: number; gap?: number; settle?: number; player?: string; zoom?: boolean };
export type Opts = { seed?: number };
declare global {
  interface Window {
    captureBoss: (specs: Spec[], opts?: Opts) => Promise<Record<string, string>>;
    bossHeads: () => string;
  }
}

function seedRandom(seed: number) {
  Math.random = () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

window.bossHeads = () => {
  const c = document.getElementById("c") as HTMLCanvasElement;
  const cols = 5;
  c.width = 300 * cols;
  c.height = 300 * Math.ceil(BOSS_LOOKS.length / cols);
  const g = c.getContext("2d")!;
  g.fillStyle = "#fff9ed";
  g.fillRect(0, 0, c.width, c.height);
  BOSS_LOOKS.forEach((look, i) => {
    const x = (i % cols) * 300, y = Math.floor(i / cols) * 300;
    g.strokeStyle = "#ddd";
    g.strokeRect(x, y, 300, 300);
    g.drawImage(bossSprite(look).head!, x, y);
    g.fillStyle = "#555";
    g.font = "14px sans-serif";
    g.fillText(String(look.floor), x + 8, y + 18);
  });
  return c.toDataURL("image/png");
};

window.captureBoss = async (specs, opts = {}) => {
  const out: Record<string, string> = {};
  const canvas = document.getElementById("c") as HTMLCanvasElement;
  for (const s of specs) {
    seedRandom((opts.seed ?? 5) + s.floor * 101);
    const r = new Renderer(canvas);
    r.resize();
    const ia = { ...EMPTY_INPUT }, ib = { ...EMPTY_INPUT };
    const run = bossRun(s.floor);
    const fighter = bossFighter(s.floor);
    const m = createMatch(kit(s.player ?? "Fighter"), fighter, [ia, ib], { boss: run.spec });
    r.classes = [s.player ?? "Fighter", fighter.class];
    r.items = ["", fighter.item ?? ""];
    r.builds = [buildFor(70, 70), (() => { const c = clampStats(fighter); return buildFor(c.def, c.spd); })()];
    r.sprites[1] = await loadSpriteCached(fighter.imageUrl, null, 0, false);
    const hud = { names: ["Sir Scribbles", fighter.name] as [string, string], specialNames: ["Slash", fighter.specialMove] as [string, string], ultNames: ["Meteor", fighter.ultMove ?? ""] as [string, string], you: 0 as 0 | 1 };
    const boss = newBrain("hard", run.cpu, run.persona);
    const useCpu = s.at === "walk" || s.at === "hit";
    let prev = snapshot(m);
    let now = performance.now();
    const b = m.fighters[1], a = m.fighters[0];
    const place = (gap: number) => {
      a.x = 480 - gap / 2;
      b.x = 480 + gap / 2;
    };
    let captured = false, started = false;
    for (let t = 0; t < 4000 && !captured; t++) {
      boss.knobs = bossKnobs(run, m.boss?.phase);
      boss.persona = bossPersona(run, m.boss?.phase);
      if (useCpu) cpuThink(m, 1, boss, ib);
      if (m.phase === "fight" && !started && m.phaseT > 130) { // (once the FIGHT banner has gone)
        started = true;
        const mv = s.move ? MOVES[s.move] : null;
        place(s.gap ?? (mv ? mv.reach + 62 : 300));
        if (s.at === "special" || s.at === "ult" || s.at === "armed") b.energy = 100;
        if (s.at === "form2") {
          b.hp = 104;
          place(90);
        }
        if (s.at === "armed") {
          // the state the passive's tell shows: stacks on the arm, the blade armed, the guard cracked, the ki gathered, the meter full
          if (s.floor === 2) b.pv.heat = 3;
          if (s.floor === 4) b.pv.cracks = 2;
          if (s.floor === 5) b.pv.still = 40;
          if (s.floor === 9) b.pv.charge = 150;
        }
        if (s.floor === 5 && s.at === "move") b.pv.still = 40; // a draw, not a plain swing
      }
      if (started) {
        // the buttons
        const idle = b.action === "idle" && b.grounded;
        if (s.at === "move" && s.move && idle && (b.cooldown === 0 || b.comboT > 0)) {
          const kick = !(Object.values(m.defs[1].kit?.punch ?? []) as string[]).includes(s.move) && (m.defs[1].kit?.kick ?? []).includes(s.move);
          const type = kick || MOVES[s.move].tip.startsWith("foot") || MOVES[s.move].tip === "knee" ? "kick" : "attack";
          ib[type]++;
        }
        if ((s.at === "special" || s.at === "ult") && idle && b.energy >= 50) {
          ib.block = s.at === "ult";
          ib.special++;
        } else if (s.at === "special" || s.at === "ult") ib.block = false;
        if (s.at === "form2" && a.action === "idle" && a.cooldown === 0 && m.boss?.phase === 1) ia.attack++;
        if (s.at === "hit" && idle && a.action === "idle" && a.cooldown === 0) ia.attack++;
        if (s.at === "walk") a.hp = Math.max(a.hp, 150);
      }
      step(m, [ia, ib]);
      for (const f of m.fighters) f.hp = Math.max(f.hp, m.boss?.phase === 1 && f.slot === 1 && s.at === "form2" ? 90 : m.defs[f.slot].maxHp * 0.4);
      const cur = snapshot(m);
      r.ingest(cur, hud);
      const mv = s.move ? MOVES[s.move] : null;
      const ready =
        started &&
        ((s.at === "idle" && m.phase === "fight" && b.action === "idle" && !b.moving && m.phaseT > 135) ||
          (s.at === "armed" && m.phase === "fight" && b.action === "idle" && m.phaseT > 135) ||
          (s.at === "walk" && b.moving && b.action === "idle" && m.phaseT > 60) ||
          (s.at === "hit" && b.action === "hit" && b.t >= 2) ||
          (s.at === "move" && b.action !== "idle" && b.move === s.move && mv !== null && b.t >= Math.max(mv.from, (s.t ?? mv.from)) && b.t <= mv.to + 1) ||
          ((s.at === "special" || s.at === "ult") && b.action === "special" && b.t >= (s.t ?? 12) && m.freeze === 0) ||
          (s.at === "form2" && m.boss?.phase === 2 && m.freeze < 36));
      if (ready) {
        for (let k = 0; k < (s.settle ?? 20); k++) {
          now += 16;
          r.draw(prev, cur, 1, hud, now);
        }
        out[s.name] = canvas.toDataURL("image/png");
        captured = true;
      } else if (t % 3 === 0) {
        now += 16 * 3;
        r.draw(prev, cur, 1, hud, now);
      }
      prev = cur;
    }
    if (!captured) console.log("never reached:", s.name);
  }
  return out;
};

