"use client";

import { RotateCw } from "lucide-react";
import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode, type RefObject } from "react";
import { ultTitle } from "@/game/moves";
import type { LobbyPlayer } from "@/game/protocol";
import { Renderer } from "@/game/render";
import { ARENA, EMPTY_INPUT, TICK_HZ, type Input, type Slot } from "@/game/sim";
import { bossLookOf } from "@/game/bossLook";
import { loadSpriteCached } from "@/game/sprite";
import { buildFor, type Build } from "@/game/stickman";
import { clampStats } from "@/lib/stats";
import type { SnapBuffer } from "@/game/useGameRoom";
import { Controller, type Control } from "./Controller";
import { InspectPanel } from "./InspectPanel";
import { buzz, TouchControls } from "./TouchControls";

type Props = {
  snaps: RefObject<SnapBuffer>;
  players: [LobbyPlayer, LobbyPlayer];
  you: Slot;
  onInput: (input: Input) => void;
  onExit?: () => void; // phone layout: the header is hidden, so the arena carries its own exit
  children?: ReactNode; // overlays drawn over the arena (notices, the result card)
};

const SNAP_MS = 1000 / TICK_HZ; // one snapshot per sim tick
const subscribeNoop = () => () => {};
const isTouchDevice = () => window.matchMedia("(pointer: coarse)").matches;
const TAPS = new Set<Control>(["jump", "attack", "kick", "special", "skill"]); // sent as press counters

// A/D or ←/→ move · W/↑/Space jump · S/↓ block (hold) · J punch · K kick · L special (half a meter) · S+L ultimate (full meter) · U side skill
// S+K sweeps low, toward+K opens with a roundhouse, J/K in the air is an air move.
const KEYS: Record<string, Control> = {
  KeyA: "left",
  ArrowLeft: "left",
  KeyD: "right",
  ArrowRight: "right",
  KeyW: "jump",
  ArrowUp: "jump",
  Space: "jump",
  KeyS: "block",
  ArrowDown: "block",
  KeyJ: "attack",
  KeyZ: "attack",
  KeyK: "kick",
  KeyX: "kick",
  KeyL: "special",
  KeyC: "special",
  KeyU: "skill",
  KeyV: "skill",
};

// Standard gamepad mapping (Xbox / PlayStation / most Bluetooth pads).
const PAD_BUTTONS: [number, Control][] = [
  [0, "jump"], // A / Cross
  [2, "attack"], // X / Square
  [3, "kick"], // Y / Triangle
  [1, "special"], // B / Circle
  [4, "block"], // LB
  [5, "skill"], // RB
  [6, "block"], // LT
  [12, "jump"], // D-pad up
  [13, "block"], // D-pad down
  [14, "left"],
  [15, "right"],
];

export function GameCanvas({ snaps, players, you, onInput, onExit, children }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const input = useRef<Input>({ ...EMPTY_INPUT });
  // Server render (e.g. /demo) has no window: assume a mouse, then use the real value in the browser.
  const touch = useSyncExternalStore(subscribeNoop, isTouchDevice, () => false);
  const [lit, setLit] = useState<ReadonlySet<Control>>(new Set());
  const [energy, setEnergy] = useState(0);
  const [skill, setSkill] = useState(100); // side skill readiness, 0..100
  const [gamepad, setGamepad] = useState<string | null>(null);
  const [inspect, setInspect] = useState(false); // reading the opponent (InspectPanel)
  const them = (1 - you) as Slot;

  const onInputRef = useRef(onInput);
  useEffect(() => {
    onInputRef.current = onInput;
  }, [onInput]);

  // Hides the phone tab bar (globals.css) while the arena is up.
  useEffect(() => {
    document.body.dataset.fight = "1";
    return () => void delete document.body.dataset.fight;
  }, []);

  // One entry point for keyboard, on-screen console and gamepad. `source` keeps
  // a held direction from being released by a different device.
  const holders = useRef(new Map<Control, Set<string>>());
  const press = useRef((key: Control, down: boolean, source = "ui") => {
    const i = input.current;
    if (TAPS.has(key)) {
      if (!down) return;
      (i[key] as number)++;
      setLit((s) => new Set(s).add(key));
      setTimeout(
        () =>
          setLit((s) => {
            const n = new Set(s);
            n.delete(key);
            return n;
          }),
        140,
      );
    } else {
      const set = holders.current.get(key) ?? new Set<string>();
      if (down) set.add(source);
      else set.delete(source);
      holders.current.set(key, set);
      const held = set.size > 0;
      if (i[key] === held) return;
      (i[key] as boolean) = held;
      setLit((s) => {
        const n = new Set(s);
        if (held) n.add(key);
        else n.delete(key);
        return n;
      });
    }
    onInputRef.current({ ...i });
  });

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.code === "KeyI" && !(e.target instanceof HTMLInputElement)) setInspect(true);
      const k = KEYS[e.code];
      if (!k || e.target instanceof HTMLInputElement) return;
      e.preventDefault();
      if (!e.repeat) press.current(k, true, `key:${e.code}`);
    };
    const up = (e: KeyboardEvent) => {
      if (e.code === "KeyI") setInspect(false);
      const k = KEYS[e.code];
      if (k) press.current(k, false, `key:${e.code}`);
    };
    // Releasing everything on blur avoids a "stuck walking" fighter after alt-tab.
    const blur = () => {
      holders.current.clear();
      input.current = { ...input.current, left: false, right: false, block: false };
      setLit(new Set());
      onInputRef.current({ ...input.current });
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", blur);
    // Heartbeat in case a packet was dropped.
    const beat = setInterval(() => onInputRef.current({ ...input.current }), 250);
    // Special meter on the console.
    const meter = setInterval(() => {
      const s = snaps.current.cur;
      const f = s?.fighters[you];
      if (!f) return;
      setEnergy(Math.round(f.energy));
      setSkill(Math.round(100 * (1 - (f.skillCd ?? 0) / Math.max(1, s.skillCds?.[you] ?? 1))));
    }, 120);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", blur);
      clearInterval(beat);
      clearInterval(meter);
    };
  }, [snaps, you]);

  // Phones fight landscape. Browsers only allow the lock in full screen, and only from a
  // tap, so the first touch on the fight asks for both (iPhone Safari: neither; it gets
  // the rotate overlay instead).
  const goFull = async () => {
    if (document.fullscreenElement) return;
    try {
      await document.documentElement.requestFullscreen?.();
      await (screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> }).lock?.("landscape");
    } catch {}
  };
  useEffect(() => {
    if (!touch) return;
    return () => {
      (screen.orientation as ScreenOrientation & { unlock?: () => void }).unlock?.();
      if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    };
  }, [touch]);

  useEffect(() => {
    const canvas = canvasRef.current!;
    const renderer = new Renderer(canvas);
    renderer.resize();
    const onResize = () => renderer.resize();
    window.addEventListener("resize", onResize);

    let alive = true;
    renderer.classes = [players[0].class, players[1].class];
    renderer.items = players.map((p) => (bossLookOf(p.imageUrl) ? (p.item ?? "") : "")) as [string, string]; // (a dungeon boss's held item is its own: a Mace-class boss may hold nothing)
    renderer.builds = players.map((p) => {
      const s = clampStats(p); // old fighters are rebalanced into the shared budget in the sim, so draw them that way too
      return buildFor(s.def, s.spd);
    }) as [Build, Build];
    players.forEach((p, i) =>
      loadSpriteCached(p.imageUrl, p.pose, p.rotation, p.flipItem)
        .then((s) => alive && (renderer.sprites[i] = s))
        .catch((err) => console.warn("[sprite]", err)),
    );

    const hud = {
      names: [players[0].name, players[1].name] as [string, string],
      specialNames: [players[0].specialMove, players[1].specialMove] as [string, string],
      ultNames: players.map((p) => ultTitle(p.ultMove, p.ultKind, p.class)) as [string, string],
      buffs: [!!players[0].buff, !!players[1].buff] as [boolean, boolean],
      you,
    };

    const padPrev = new Map<string, boolean>();
    let padName: string | null = null;
    const pollGamepad = () => {
      const pads = typeof navigator.getGamepads === "function" ? navigator.getGamepads() : [];
      const pad = Array.from(pads).find((p) => p && p.connected) ?? null;
      const name = pad ? pad.id.replace(/\(.*?\)/g, "").trim().slice(0, 40) || "Gamepad" : null;
      if (name !== padName) setGamepad((padName = name));
      if (!pad) return;
      const states = new Map<string, [Control, boolean]>();
      for (const [idx, ctl] of PAD_BUTTONS) states.set(`b${idx}`, [ctl, !!pad.buttons[idx]?.pressed]);
      const ax = pad.axes[0] ?? 0, ay = pad.axes[1] ?? 0;
      states.set("axL", ["left", ax < -0.5]);
      states.set("axR", ["right", ax > 0.5]);
      states.set("axD", ["block", ay > 0.6]);
      for (const [id, [ctl, on]] of states) {
        if (on !== (padPrev.get(id) ?? false)) press.current(ctl, on, `pad:${id}`);
        padPrev.set(id, on);
      }
    };

    let raf = 0;
    let lastBuzz = 0;
    const frame = (now: number) => {
      pollGamepad();
      const { prev, cur, at, span } = snaps.current;
      if (cur) {
        // A short buzz when your hit lands (phones that vibrate).
        for (const e of cur.events) {
          if (e.id <= lastBuzz) continue;
          lastBuzz = e.id;
          if (e.type === "hit" && e.by === you && !e.blocked) buzz(e.special ? 40 : 20);
        }
        renderer.ingest(cur, hud);
        renderer.draw(prev, cur, Math.min(1, (now - at) / (span ?? SNAP_MS)), hud, now);
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => {
      alive = false;
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
    };
  }, [players, snaps, you]);

  const stickPress = (k: Control, d: boolean) => press.current(k, d, "stick");
  const arena = (
    <>
      <canvas ref={canvasRef} className={`block w-full touch-none bg-paper ${touch ? "" : "rounded-2xl ring-1 ring-line"}`} />
      {/* The opponent's HUD corner: hover (or tap on a phone) to read them. */}
      <button
        type="button"
        aria-label={`Read ${players[them].name}`}
        title="Read your opponent (or hold I)"
        onMouseEnter={() => !touch && setInspect(true)}
        onMouseLeave={() => !touch && setInspect(false)}
        onClick={() => touch && setInspect((v) => !v)}
        className={`absolute top-0 h-[24%] w-[40%] ${them === 1 ? "right-0" : "left-0"}`}
      />
      {inspect && (
        <div className={`absolute top-[24%] z-10 ${them === 1 ? "right-3" : "left-3"}`}>
          <InspectPanel me={players[you]} them={players[them]} slot={them} snaps={snaps} />
        </div>
      )}
    </>
  );

  if (touch) {
    // Phone: the arena fills the screen (over the site header) and the controls float on it.
    return (
      <div className="fixed inset-0 z-50 flex touch-none select-none items-center justify-center bg-paper" onPointerDown={goFull}>
        <div className="relative" style={{ width: `min(100vw, calc(100svh * ${ARENA.w / ARENA.h}))` }}>
          {arena}
        </div>
        <TouchControls press={stickPress} lit={lit} energy={energy} skill={skill} onExit={onExit} />
        <div className="pointer-events-none absolute inset-0 z-20 [&>*]:pointer-events-auto">{children}</div>
        <div className="fixed inset-0 z-[60] hidden flex-col items-center justify-center gap-3 bg-ink p-6 text-center text-white portrait:flex">
          <RotateCw className="size-10 animate-spin [animation-duration:3s]" />
          <p className="font-display text-xl font-extrabold">Turn your phone sideways</p>
          <p className="text-sm text-white/60">Fights are played in landscape.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="grid gap-3">
      {/* Fit the 16:9 arena inside the viewport height too, leaving room for the console. */}
      <div className="relative mx-auto w-full" style={{ maxWidth: `calc((100svh - 230px) * ${ARENA.w / ARENA.h})` }}>
        {arena}
        {children}
      </div>
      <Controller press={(k, d) => press.current(k, d, "ui")} lit={lit} energy={energy} skill={skill} showKeys gamepad={gamepad} />
    </div>
  );
}
