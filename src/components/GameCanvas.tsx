"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import type { LobbyPlayer } from "@/game/protocol";
import { Renderer } from "@/game/render";
import { ARENA, EMPTY_INPUT, TICK_HZ, type Input, type Slot } from "@/game/sim";
import { loadSprite } from "@/game/sprite";
import type { SnapBuffer } from "@/game/useGameRoom";

type Props = {
  snaps: RefObject<SnapBuffer>;
  players: [LobbyPlayer, LobbyPlayer];
  you: Slot;
  onInput: (input: Input) => void;
};

const SNAP_MS = (1000 / TICK_HZ) * 2;

// Keyboard: A/D or ←/→ move · W/↑/Space jump · J attack · K block · L special
const KEYS: Record<string, keyof Input> = {
  KeyA: "left",
  ArrowLeft: "left",
  KeyD: "right",
  ArrowRight: "right",
  KeyW: "jump",
  ArrowUp: "jump",
  Space: "jump",
  KeyJ: "attack",
  KeyZ: "attack",
  KeyK: "block",
  KeyX: "block",
  ArrowDown: "block",
  KeyS: "block",
  KeyL: "special",
  KeyC: "special",
};

export function GameCanvas({ snaps, players, you, onInput }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const input = useRef<Input>({ ...EMPTY_INPUT });
  // Only rendered after the WebSocket lobby arrives, so this never runs during SSR.
  const [touch] = useState(() => window.matchMedia("(pointer: coarse)").matches);

  const onInputRef = useRef(onInput);
  useEffect(() => {
    onInputRef.current = onInput;
  }, [onInput]);

  // Press/release from keyboard or touch buttons.
  const press = useRef((key: keyof Input, down: boolean) => {
    const i = input.current;
    if (key === "jump" || key === "attack" || key === "special") {
      if (down) i[key]++;
      else return;
    } else {
      if (i[key] === down) return;
      i[key] = down;
    }
    onInputRef.current({ ...i });
  });

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      const k = KEYS[e.code];
      if (!k) return;
      e.preventDefault();
      if (!e.repeat) press.current(k, true);
    };
    const up = (e: KeyboardEvent) => {
      const k = KEYS[e.code];
      if (k) press.current(k, false);
    };
    // Releasing everything on blur avoids a "stuck walking" fighter after alt-tab.
    const blur = () => {
      input.current = { ...input.current, left: false, right: false, block: false };
      onInputRef.current({ ...input.current });
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", blur);
    // Heartbeat in case a packet was dropped.
    const beat = setInterval(() => onInputRef.current({ ...input.current }), 250);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", blur);
      clearInterval(beat);
    };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current!;
    const renderer = new Renderer(canvas);
    renderer.resize();
    const onResize = () => renderer.resize();
    window.addEventListener("resize", onResize);

    let alive = true;
    players.forEach((p, i) =>
      loadSprite(p.imageUrl)
        .then((s) => alive && (renderer.sprites[i] = s))
        .catch((err) => console.warn("[sprite]", err)),
    );

    const hud = {
      names: [players[0].name, players[1].name] as [string, string],
      specialNames: [players[0].specialMove, players[1].specialMove] as [string, string],
      you,
    };
    let raf = 0;
    const frame = (now: number) => {
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
      {/* Fit the 16:9 arena inside the viewport height too (landscape phones), leaving room for controls. */}
      <div className="mx-auto w-full" style={{ maxWidth: `calc((100svh - ${touch ? 200 : 150}px) * ${ARENA.w / ARENA.h})` }}>
        <canvas ref={canvasRef} className="block w-full touch-none rounded-2xl bg-paper ring-1 ring-line" />
      </div>
      {touch && <p className="text-center text-xs text-muted portrait:block landscape:hidden">Tip: turn your phone sideways for a bigger arena.</p>}
      {touch ? (
        <TouchPad press={(k, d) => press.current(k, d)} />
      ) : (
        <p className="text-center text-xs text-muted">
          <Kbd>A</Kbd>
          <Kbd>D</Kbd> move · <Kbd>W</Kbd> jump · <Kbd>J</Kbd> attack · <Kbd>K</Kbd> block · <Kbd>L</Kbd> special (when the meter is full)
        </p>
      )}
    </div>
  );
}

function Kbd({ children }: { children: string }) {
  return <kbd className="mx-0.5 rounded-md bg-card px-1.5 py-0.5 font-sans text-[11px] font-semibold text-ink ring-1 ring-line">{children}</kbd>;
}

function TouchPad({ press }: { press: (k: keyof Input, down: boolean) => void }) {
  const btn = (k: keyof Input, label: string, cls: string) => (
    <button
      key={k}
      onPointerDown={(e) => {
        e.preventDefault();
        (e.target as HTMLElement).setPointerCapture(e.pointerId);
        press(k, true);
      }}
      onPointerUp={() => press(k, false)}
      onPointerCancel={() => press(k, false)}
      onContextMenu={(e) => e.preventDefault()}
      className={`h-16 w-full select-none rounded-2xl font-display text-lg font-extrabold active:scale-95 ${cls}`}
    >
      {label}
    </button>
  );
  return (
    <div className="mx-auto grid w-full max-w-xl touch-none grid-cols-2 gap-3">
      <div className="grid grid-cols-3 gap-1.5">
        {btn("left", "◀", "bg-card ring-1 ring-line")}
        {btn("jump", "▲", "bg-card ring-1 ring-line")}
        {btn("right", "▶", "bg-card ring-1 ring-line")}
      </div>
      <div className="grid grid-cols-3 gap-1.5">
        {btn("block", "🛡", "bg-guard text-white")}
        {btn("special", "★", "bg-gold text-ink")}
        {btn("attack", "HIT", "bg-hit text-white")}
      </div>
    </div>
  );
}
