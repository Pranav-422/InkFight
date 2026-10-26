// Draws real Renderer frames of a computer-played arena fight at chosen moments, for the screenshots in docs/changes/sprint-7b.md.
// Bundled by run.cjs (esbuild) and opened in headless Chromium (Playwright). It is a development tool, not part of the game.

import { arenaTick, arenaWorld } from "../../src/game/arena";
import { cpuThink, newBrain } from "../../src/game/cpu";
import { CLASS_ITEM, CLASS_SPECIAL, CLASS_STYLE } from "../../src/game/moves";
import { Renderer } from "../../src/game/render";
import { createMatch, EMPTY_INPUT, snapshot, step, type Match } from "../../src/game/sim";
import { ruleStats } from "../../src/lib/stats";

const neutral = { size: "medium", pose: "neutral", dominant_colors: [] } as const;
const kit = (cls: string) => ({ ...ruleStats(cls, { ...neutral, dominant_colors: [] }), class: cls, item: CLASS_ITEM[cls], style: CLASS_STYLE[cls], specialKind: CLASS_SPECIAL[cls] });

// A moment to draw: every field given must hold. phase / cue: the sim's; phaseT: ticks into the phase; tick: the match clock;
// world: the world clock; scene: 1-5; settle: frames to draw first (the camera and the fades ease in real time).
// locked: constellations locked so far (the ceremony). ko: let the fight end (otherwise nobody dies).
export type Spec = { name: string; phase?: string; cue?: string; phaseT?: number; tick?: number; world?: number; scene?: number; settle?: number; ko?: boolean; locked?: number };
export type Opts = { seed?: number; a?: string; b?: string; protect?: boolean; skipTo?: number };

declare global {
  interface Window {
    capture: (specs: Spec[], opts?: Opts) => Record<string, string>;
    trace: Match | null;
  }
}

const holds = (m: Match, s: Spec) =>
  (s.phase === undefined || m.phase === s.phase) &&
  (s.cue === undefined || m.cue?.id === s.cue) &&
  (s.phaseT === undefined || m.phaseT >= s.phaseT) &&
  (s.tick === undefined || arenaTick(m) >= s.tick) &&
  (s.world === undefined || arenaWorld(m) >= s.world) &&
  (s.scene === undefined || (m.arena?.scene ?? -1) + 1 >= s.scene) &&
  (s.locked === undefined || (m.arena?.pick.filter(Boolean).length ?? 0) >= s.locked);

window.capture = (specs, opts = {}) => {
  let seed = opts.seed ?? 5;
  Math.random = () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const canvas = document.getElementById("c") as HTMLCanvasElement;
  const r = new Renderer(canvas);
  r.resize();
  const ia = { ...EMPTY_INPUT }, ib = { ...EMPTY_INPUT };
  const m = createMatch(kit(opts.a ?? "Sword"), kit(opts.b ?? "Fighter"), [ia, ib], { arena: "inferno" });
  window.trace = m;
  const brains = [newBrain("normal"), newBrain("normal")];
  const hud = { names: ["Sir Scribbles", "Margin Fist"] as [string, string], specialNames: ["Slash", "Wave"] as [string, string], you: 0 as 0 | 1 };
  const out: Record<string, string> = {};
  const pending = [...specs];
  let prev = snapshot(m);
  let now = performance.now();
  for (let t = 0; pending.length && t < 30000; t++) {
    cpuThink(m, 0, brains[0], ia);
    cpuThink(m, 1, brains[1], ib);
    step(m, [ia, ib]);
    // Nobody dies unless a shot wants the knockout: the scenes are what is being looked at.
    if (opts.protect !== false && !pending.some((s) => s.ko)) for (const f of m.fighters) f.hp = Math.max(f.hp, m.defs[f.slot].maxHp * 0.4);
    const cur = snapshot(m);
    r.ingest(cur, hud);
    const hit = pending.filter((s) => holds(m, s));
    if (hit.length) {
      for (const s of hit) {
        for (let k = 0; k < (s.settle ?? 45); k++) {
          now += 16;
          r.draw(prev, cur, 1, hud, now);
        }
        out[s.name] = canvas.toDataURL("image/png");
        pending.splice(pending.indexOf(s), 1);
      }
    } else if (t % 4 === 0) {
      now += 16 * 4;
      r.draw(prev, cur, 1, hud, now); // keeps particles and the camera moving while the sim runs
    }
    prev = cur;
  }
  if (pending.length) console.log("never reached:", pending.map((s) => s.name).join(", "));
  return out;
};
