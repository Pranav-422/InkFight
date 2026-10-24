"use client";

// A small training room: the fighter being made, next to a dummy, running the real fight
// simulation and renderer. Picking a style or special plays it here exactly as it looks
// in a fight, so choosing is half the fun.

import { useEffect, useRef } from "react";
import { CLASS_CHAIN, MOVES, STYLE_INFO } from "@/game/moves";
import { Renderer } from "@/game/render";
import { ARENA, createMatch, deriveDef, EMPTY_INPUT, snapshot, step, TICK_HZ, type FighterStats, type Input, type Match, type Snapshot } from "@/game/sim";
import { loadSpriteCached } from "@/game/sprite";
import { buildFor } from "@/game/stickman";
import { clampStats, ruleStats } from "@/lib/stats";

export type Demo = { kind: "style" | "special" | "ult" | "item" | "skill"; n: number };
type Look = { imageUrl: string; class: string; item?: string | null; element?: string | null; style?: string | null; specialKind?: string | null; ultKind?: string | null; sideSkill?: string | null; pose?: string | null; rotation?: number; flipItem?: boolean };

const TICK_MS = 1000 / TICK_HZ;
const HOME: [number, number] = [400, 540]; // close enough for the punches to land
const NEUTRAL = { size: "medium", pose: "neutral", dominant_colors: [] } as const;

// The class's usual stat line, since the real one is only known once the fighter is made.
function statsFor(f: Look): FighterStats {
  return { ...ruleStats(f.class, { ...NEUTRAL, dominant_colors: [] }), class: f.class, item: f.item, element: f.element, style: f.style, specialKind: f.specialKind, ultKind: f.ultKind, sideSkill: f.sideSkill };
}

// ultPress: S + L still has to be pressed (block held with the special), then BLOCK is let go once it started.
type Room = { m: Match; input: Input; script: { type: "attack" | "kick"; left: number }[]; ultPress?: boolean; guard?: boolean };

// Back to the start marks, then play the pick: a style's punch and kick chains, the
// special at full energy, or one swing with the new item.
function play(r: Room, f: Look, kind: Demo["kind"]) {
  const { m, input } = r;
  m.defs[0] = deriveDef(statsFor(f));
  m.projectiles = [];
  m.fighters.forEach((x, i) => Object.assign(x, { x: HOME[i], y: ARENA.ground, vx: 0, vy: 0, grounded: true, hp: 200, action: "idle", t: 0, cooldown: 0, combo: 0, comboT: 0, buffer: null, energy: 0, status: null, skillCd: 0, skillT: 0, bubble: 0, skillQ: false, mix: false, ult: false, ultEnd: 0, locked: false, tension: 0 }));
  r.ultPress = r.guard = false;
  input.block = false;
  if (kind === "special") {
    m.fighters[0].energy = 50; // L: the first special costs half a meter
    input.special++;
    r.script = [];
  } else if (kind === "ult") {
    m.fighters[0].energy = 100;
    r.ultPress = true;
    r.script = [];
  } else if (kind === "skill") {
    input.skill++; // then one swing, so a blade or a bubble has something to show on
    r.script = [{ type: "attack", left: 1 }];
  } else if (kind === "style") {
    const chain = STYLE_INFO[m.defs[0].style];
    r.script = [
      { type: "attack", left: (CLASS_CHAIN[m.defs[0].cls] ?? chain.punch).length },
      { type: "kick", left: chain.kick.length },
    ];
  } else {
    r.script = [{ type: "attack", left: 1 }];
  }
}

export function MovePreview({ fighter, demo, className = "" }: { fighter: Look; demo: Demo; className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const room = useRef<Room | null>(null);
  const latest = useRef({ fighter, demo });
  useEffect(() => {
    latest.current = { fighter, demo };
  });
  const { imageUrl, pose, rotation, flipItem, class: cls, item } = fighter;

  useEffect(() => {
    const canvas = ref.current!;
    const renderer = new Renderer(canvas, true);
    renderer.resize();
    renderer.classes = [cls, "Fighter"];
    renderer.items = [item ?? "", ""];
    const own = clampStats(statsFor(fighter)); // the build follows the class line this fighter will get
    renderer.builds = [buildFor(own.def, own.spd), buildFor(70, 70)];
    let alive = true;
    loadSpriteCached(imageUrl, pose, rotation ?? 0, flipItem ?? false)
      .then((s) => alive && (renderer.sprites[0] = s))
      .catch(() => {});

    const input: Input = { ...EMPTY_INPUT };
    const dummy: Input = { ...EMPTY_INPUT };
    const m = createMatch(statsFor(fighter), { hp: 200, atk: 70, def: 70, spd: 70, agi: 70, iq: 70, class: "Fighter" }, [input, dummy]);
    m.phase = "fight";
    m.phaseT = 100;
    room.current = { m, input, script: [] };
    // A new look (say, a new item) rebuilt the room: replay the pick that caused it.
    if (latest.current.demo.n > 0) play(room.current, latest.current.fighter, latest.current.demo.kind);
    const hud = { names: ["", ""] as [string, string], specialNames: ["", ""] as [string, string], you: 0 as const };

    let prev: Snapshot | null = null, cur = snapshot(m), at = performance.now(), last = at, acc = 0, raf = 0, visible = true;
    const tick = () => {
      const me = m.fighters[0], r = room.current!;
      // Press the next button of the demo as soon as the fighter can take it (or buffer it).
      const next = r.script[0];
      if (next) {
        const free = me.action === "idle" && me.cooldown === 0;
        const late = me.action === next.type && me.move && me.t > MOVES[me.move].to && !me.buffer;
        if (free || late) {
          input[next.type]++;
          if (--next.left <= 0) r.script.shift();
        }
      }
      if (r.ultPress) {
        r.ultPress = false;
        r.guard = true;
        input.block = true;
        input.special++;
      } else if (r.guard && me.action === "special") {
        r.guard = false;
        input.block = false;
      }
      // The room never ends: no timer, and the dummy can't be knocked out.
      m.timer = 60 * TICK_HZ;
      m.fighters[1].hp = Math.max(m.fighters[1].hp, 120);
      step(m, [input, dummy]);
      prev = cur;
      cur = snapshot(m);
      at = performance.now();
    };
    const frame = (now: number) => {
      raf = 0;
      if (!alive || !visible) return;
      acc = Math.min(acc + now - last, 250);
      last = now;
      while (acc >= TICK_MS) {
        acc -= TICK_MS;
        tick();
      }
      renderer.ingest(cur, hud);
      renderer.draw(prev, cur, Math.min(1, (now - at) / TICK_MS), hud, now);
      raf = requestAnimationFrame(frame);
    };
    const io = new IntersectionObserver(([e]) => {
      visible = e.isIntersecting;
      last = performance.now();
      if (visible && !raf) raf = requestAnimationFrame(frame);
    });
    io.observe(canvas);
    const onResize = () => renderer.resize();
    window.addEventListener("resize", onResize);
    return () => {
      alive = false;
      io.disconnect();
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
      room.current = null;
    };
    // The fight restarts only for a new look; style/special changes go to the running room below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [imageUrl, pose, rotation, flipItem, cls, item]);

  useEffect(() => {
    if (room.current && demo.n > 0) play(room.current, latest.current.fighter, demo.kind);
  }, [demo.n, demo.kind]);

  return <canvas ref={ref} className={`block w-full rounded-2xl bg-paper ring-1 ring-line ${className}`} aria-label="Move preview" />;
}
