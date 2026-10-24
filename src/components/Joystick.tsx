"use client";

import { useRef, useState } from "react";
import type { Control } from "./Controller";

const R = 60; // knob travel in px at size 1

// Knob offset (px at size 1) → which controls it means. Same thresholds as the gamepad stick.
export function stickDirs(dx: number, dy: number) {
  const x = dx / R, y = dy / R;
  return { left: x < -0.35, right: x > 0.35, block: y > 0.6, up: y < -0.6, centre: Math.hypot(x, y) < 0.3 };
}

type Held = { left: boolean; right: boolean; block: boolean };

// A floating stick: invisible until a thumb lands in its half of the screen, then a base
// and knob appear right there. Tracks one pointer, so the other thumb can press buttons.
export function Joystick({ press, side, scale }: { press: (k: Control, down: boolean) => void; side: "left" | "right"; scale: number }) {
  const id = useRef<number | null>(null);
  const origin = useRef({ x: 0, y: 0 });
  const held = useRef<Held>({ left: false, right: false, block: false });
  const armed = useRef(true); // a flick up jumps once, then waits for the knob to come back
  const [ui, setUi] = useState<{ x: number; y: number; kx: number; ky: number; on: boolean } | null>(null);
  const r = R * scale;

  const apply = (dx: number, dy: number) => {
    const d = stickDirs(dx / scale, dy / scale);
    for (const k of ["left", "right", "block"] as const) {
      if (d[k] === held.current[k]) continue;
      held.current[k] = d[k];
      press(k, d[k]);
    }
    if (d.up && armed.current) {
      armed.current = false;
      press("jump", true);
    }
    if (d.centre) armed.current = true;
  };
  const release = () => {
    for (const k of ["left", "right", "block"] as const) if (held.current[k]) press(k, false);
    held.current = { left: false, right: false, block: false };
    armed.current = true;
    id.current = null;
    setUi((u) => u && { ...u, kx: 0, ky: 0, on: false });
  };

  return (
    <div
      role="application"
      aria-label="Movement stick: drag left or right to move, down to block, flick up to jump"
      className={`absolute top-[24%] bottom-0 w-1/2 touch-none ${side === "left" ? "left-0" : "right-0"}`}
      onPointerDown={(e) => {
        if (id.current !== null) return;
        id.current = e.pointerId;
        e.currentTarget.setPointerCapture(e.pointerId);
        const b = e.currentTarget.getBoundingClientRect();
        origin.current = { x: e.clientX, y: e.clientY };
        setUi({ x: e.clientX - b.left, y: e.clientY - b.top, kx: 0, ky: 0, on: true });
      }}
      onPointerMove={(e) => {
        if (e.pointerId !== id.current) return;
        let dx = e.clientX - origin.current.x, dy = e.clientY - origin.current.y;
        const m = Math.hypot(dx, dy);
        if (m > r) {
          dx *= r / m;
          dy *= r / m;
        }
        apply(dx, dy);
        setUi((u) => u && { ...u, kx: dx, ky: dy });
      }}
      onPointerUp={(e) => e.pointerId === id.current && release()}
      onPointerCancel={(e) => e.pointerId === id.current && release()}
    >
      {ui && (
        <div
          className="pointer-events-none absolute rounded-full bg-ink/10 ring-2 ring-ink/25"
          style={{ left: ui.x - r, top: ui.y - r, width: 2 * r, height: 2 * r, opacity: ui.on ? 1 : 0, transition: "opacity 150ms" }}
        >
          <div
            className="absolute rounded-full bg-ink/45 shadow"
            style={{ width: r * 0.9, height: r * 0.9, left: r * 0.55 + ui.kx, top: r * 0.55 + ui.ky }}
          />
        </div>
      )}
    </div>
  );
}
