"use client";

import { Gamepad2 } from "lucide-react";
import type { Input } from "@/game/sim";

export type Control = keyof Input;

type Props = {
  press: (k: Control, down: boolean) => void;
  lit: ReadonlySet<Control>; // buttons currently held / just pressed (for feedback)
  energy: number; // 0..100, fills the special button
  showKeys: boolean;
  gamepad: string | null;
};

// An on-screen gamepad: D-pad on the left, face buttons on the right.
// Works with mouse, touch and pen; keyboard and real gamepads light it up too.
export function Controller({ press, lit, energy, showKeys, gamepad }: Props) {
  const ready = energy >= 100;
  const btn = (k: Control, label: string, keyHint: string, cls: string, extra?: React.ReactNode) => (
    <button
      type="button"
      aria-label={label}
      onPointerDown={(e) => {
        e.preventDefault();
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        press(k, true);
      }}
      onPointerUp={() => press(k, false)}
      onPointerCancel={() => press(k, false)}
      onContextMenu={(e) => e.preventDefault()}
      className={`relative flex size-14 select-none flex-col items-center justify-center rounded-2xl font-display font-extrabold leading-none shadow-[0_3px_0_rgba(0,0,0,.35)] transition-transform sm:size-16 ${
        lit.has(k) ? "translate-y-[2px] scale-95 shadow-none brightness-125" : ""
      } ${cls}`}
    >
      {extra}
      <span className="relative text-[13px] sm:text-sm">{label}</span>
      {showKeys && <span className="relative mt-1 text-[10px] font-semibold opacity-70">{keyHint}</span>}
    </button>
  );

  return (
    <div className="mx-auto w-full max-w-2xl touch-none select-none rounded-3xl bg-ink p-3 text-white sm:p-4">
      <div className="flex items-center justify-between gap-3">
        {/* D-pad */}
        <div className="grid grid-cols-3 grid-rows-2 gap-1.5">
          <span />
          {btn("jump", "▲", "W", "bg-white/10")}
          <span />
          {btn("left", "◀", "A", "bg-white/10")}
          {btn("block", "▼", "S", "bg-white/10")}
          {btn("right", "▶", "D", "bg-white/10")}
        </div>

        <div className="hidden flex-col items-center text-center text-[11px] text-white/50 sm:flex">
          <Gamepad2 className="mb-1 size-5" />
          {gamepad ? <span className="text-gold">Gamepad connected</span> : <span>Plug in a gamepad<br />or use the keys</span>}
        </div>

        {/* Face buttons */}
        <div className="grid grid-cols-3 grid-rows-2 gap-1.5">
          <span />
          {btn(
            "special",
            "SPECIAL",
            "L",
            ready ? "animate-pulse bg-gold text-ink" : "overflow-hidden bg-white/15 text-white",
            !ready && (
              <span className="absolute inset-x-0 bottom-0 rounded-2xl bg-gold/60" style={{ height: `${Math.max(0, Math.min(100, energy))}%` }} />
            ),
          )}
          <span />
          {btn("attack", "PUNCH", "J", "bg-hit")}
          {btn("block", "BLOCK", "S", "bg-guard")}
          {btn("kick", "KICK", "K", "bg-white text-ink")}
        </div>
      </div>
    </div>
  );
}
