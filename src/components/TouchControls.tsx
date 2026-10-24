"use client";

import { Settings2, X } from "lucide-react";
import { useState } from "react";
import type { Control } from "./Controller";
import { Joystick } from "./Joystick";

type Prefs = { lefty: boolean; size: number };
const KEY = "inkfight.touch";

function loadPrefs(): Prefs {
  try {
    const p = JSON.parse(localStorage.getItem(KEY) ?? "{}");
    return { lefty: !!p.lefty, size: Math.min(1.3, Math.max(0.8, Number(p.size) || 1)) };
  } catch {
    return { lefty: false, size: 1 };
  }
}

const buzz = (ms: number) => {
  try {
    navigator.vibrate?.(ms);
  } catch {}
};

// Phone fight controls floating over the arena: a floating stick under one thumb and a
// PUNCH-first button arc under the other (swappable for left-handers, resizable).
export function TouchControls({ press, lit, energy, skill, onExit }: { press: (k: Control, down: boolean) => void; lit: ReadonlySet<Control>; energy: number; skill: number; onExit?: () => void }) {
  const [prefs, setPrefs] = useState<Prefs>(loadPrefs);
  const [open, setOpen] = useState(false);
  const save = (p: Prefs) => {
    setPrefs(p);
    try {
      localStorage.setItem(KEY, JSON.stringify(p));
    } catch {}
  };
  const s = prefs.size;
  const ready = energy >= 100;
  const skillReady = skill >= 100;
  const tap = (k: Control, down: boolean) => {
    if (down) buzz(10);
    press(k, down);
  };

  // [control, label, colour, size px, right px, bottom px] measured from the button corner.
  const BUTTONS: [Control, string, string, number, number, number][] = [
    ["attack", "PUNCH", "bg-hit/80 text-white", 84, 16, 16],
    ["kick", "KICK", "bg-white/80 text-ink ring-1 ring-ink/20", 60, 116, 12],
    ["block", "BLOCK", "bg-guard/75 text-white", 60, 100, 86],
    ["special", "SPECIAL", ready ? "animate-pulse bg-gold text-ink" : "overflow-hidden bg-ink/55 text-white", 64, 24, 114],
    ["skill", "SKILL", skillReady ? "bg-guard/85 text-white" : "overflow-hidden bg-ink/55 text-white/70", 52, 96, 150],
  ];

  return (
    <>
      <Joystick press={press} side={prefs.lefty ? "right" : "left"} scale={s} />
      <div className={`pointer-events-none absolute bottom-0 ${prefs.lefty ? "left-0" : "right-0"}`} style={{ width: 200 * s, height: 200 * s }}>
        {BUTTONS.map(([k, label, cls, size, right, bottom]) => (
          <button
            key={k}
            type="button"
            aria-label={label}
            onPointerDown={(e) => {
              e.preventDefault();
              e.stopPropagation(); // not a joystick touch
              e.currentTarget.setPointerCapture(e.pointerId);
              tap(k, true);
            }}
            onPointerUp={() => tap(k, false)}
            onPointerCancel={() => tap(k, false)}
            onContextMenu={(e) => e.preventDefault()}
            className={`pointer-events-auto absolute flex select-none items-center justify-center rounded-full font-display text-xs font-extrabold shadow-[0_3px_0_rgba(0,0,0,.25)] backdrop-blur-sm ${
              lit.has(k) ? "scale-90 brightness-125" : ""
            } ${cls}`}
            style={{ width: size * s, height: size * s, [prefs.lefty ? "left" : "right"]: right * s, bottom: bottom * s }}
          >
            {k === "special" && !ready && <span className="absolute inset-x-0 bottom-0 bg-gold/70" style={{ height: `${Math.max(0, Math.min(100, energy))}%` }} />}
            {k === "skill" && !skillReady && <span className="absolute inset-x-0 bottom-0 bg-guard/60" style={{ height: `${Math.max(0, Math.min(100, skill))}%` }} />}
            <span className="relative">{label}</span>
          </button>
        ))}
      </div>

      <div className="absolute bottom-2 left-1/2 flex -translate-x-1/2 items-center gap-2">
        {onExit && (
          <button data-leave type="button" aria-label="Leave the fight" onClick={onExit} className="rounded-full bg-ink/50 p-2 text-white">
            <X className="size-4" />
          </button>
        )}
        <button type="button" aria-label="Control settings" aria-expanded={open} onClick={() => setOpen((v) => !v)} className="rounded-full bg-ink/50 p-2 text-white">
          <Settings2 className="size-4" />
        </button>
      </div>
      {open && (
        <div className="absolute bottom-12 left-1/2 grid w-56 -translate-x-1/2 gap-3 rounded-2xl bg-ink/90 p-4 text-sm text-white">
          <label className="flex items-center justify-between gap-2">
            Left-handed
            <input type="checkbox" checked={prefs.lefty} onChange={(e) => save({ ...prefs, lefty: e.target.checked })} />
          </label>
          <label className="grid gap-1">
            Control size
            <input type="range" min={0.8} max={1.3} step={0.05} value={s} onChange={(e) => save({ ...prefs, size: Number(e.target.value) })} />
          </label>
        </div>
      )}
    </>
  );
}

export { buzz };
