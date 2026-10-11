"use client";

import { useEffect, useRef, useState, useSyncExternalStore, type RefObject } from "react";
import type { LobbyPlayer } from "@/game/protocol";
import { Renderer } from "@/game/render";
import { ARENA, EMPTY_INPUT, TICK_HZ, type Input, type Slot } from "@/game/sim";
import { loadSprite } from "@/game/sprite";
import type { SnapBuffer } from "@/game/useGameRoom";
import { Controller, type Control } from "./Controller";

type Props = {
  snaps: RefObject<SnapBuffer>;
  players: [LobbyPlayer, LobbyPlayer];
  you: Slot;
  onInput: (input: Input) => void;
};

const SNAP_MS = (1000 / TICK_HZ) * 2;
const subscribeNoop = () => () => {};
const isTouchDevice = () => window.matchMedia("(pointer: coarse)").matches;
const TAPS = new Set<Control>(["jump", "attack", "kick", "special"]); // sent as press counters

// A/D or ←/→ move · W/↑/Space jump · S/↓ block (hold) · J punch · K kick · L special
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
};

// Standard gamepad mapping (Xbox / PlayStation / most Bluetooth pads).
const PAD_BUTTONS: [number, Control][] = [
  [0, "jump"], // A / Cross
  [2, "attack"], // X / Square
  [3, "kick"], // Y / Triangle
  [1, "special"], // B / Circle
  [4, "block"], // LB
  [5, "block"], // RB
  [6, "block"], // LT
  [12, "jump"], // D-pad up
  [13, "block"], // D-pad down
  [14, "left"],
  [15, "right"],
];

export function GameCanvas({ snaps, players, you, onInput }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const input = useRef<Input>({ ...EMPTY_INPUT });
  // Server render (e.g. /demo) has no window: assume a mouse, then use the real value in the browser.
  const touch = useSyncExternalStore(subscribeNoop, isTouchDevice, () => false);
  const [lit, setLit] = useState<ReadonlySet<Control>>(new Set());
  const [energy, setEnergy] = useState(0);
  const [gamepad, setGamepad] = useState<string | null>(null);

  const onInputRef = useRef(onInput);
  useEffect(() => {
    onInputRef.current = onInput;
  }, [onInput]);

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
      const k = KEYS[e.code];
      if (!k || e.target instanceof HTMLInputElement) return;
      e.preventDefault();
      if (!e.repeat) press.current(k, true, `key:${e.code}`);
    };
    const up = (e: KeyboardEvent) => {
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
      const f = snaps.current.cur?.fighters[you];
      if (f) setEnergy(Math.round(f.energy));
    }, 120);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", blur);
      clearInterval(beat);
      clearInterval(meter);
    };
  }, [snaps, you]);

  useEffect(() => {
    const canvas = canvasRef.current!;
    const renderer = new Renderer(canvas);
    renderer.resize();
    const onResize = () => renderer.resize();
    window.addEventListener("resize", onResize);

    let alive = true;
    players.forEach((p, i) =>
      loadSprite(p.imageUrl, p.pose, p.rotation)
        .then((s) => alive && (renderer.sprites[i] = s))
        .catch((err) => console.warn("[sprite]", err)),
    );

    const hud = {
      names: [players[0].name, players[1].name] as [string, string],
      specialNames: [players[0].specialMove, players[1].specialMove] as [string, string],
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
    const frame = (now: number) => {
      pollGamepad();
      const { prev, cur, at } = snaps.current;
      if (cur) {
        renderer.ingest(cur, hud);
        renderer.draw(prev, cur, Math.min(1, (now - at) / SNAP_MS), hud, now);
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

  return (
    <div className="grid gap-3">
      {/* Fit the 16:9 arena inside the viewport height too, leaving room for the console. */}
      <div className="mx-auto w-full" style={{ maxWidth: `calc((100svh - 230px) * ${ARENA.w / ARENA.h})` }}>
        <canvas ref={canvasRef} className="block w-full touch-none rounded-2xl bg-paper ring-1 ring-line" />
      </div>
      {touch && <p className="text-center text-xs text-muted portrait:block landscape:hidden">Tip: turn your phone sideways for a bigger arena.</p>}
      <Controller press={(k, d) => press.current(k, d, "ui")} lit={lit} energy={energy} showKeys={!touch} gamepad={gamepad} />
    </div>
  );
}
