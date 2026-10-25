"use client";

import { Settings, X } from "lucide-react";
import { useEffect, useRef } from "react";
import { ReduceFlashes } from "./ReduceFlashes";
import { SoundSwitch } from "./SoundSwitch";

const KEYS: [string, string][] = [
  ["A / D", "Move"],
  ["W", "Jump"],
  ["S", "Block"],
  ["J", "Punch / weapon"],
  ["K", "Kick"],
  ["L", "Special"],
  ["S + L", "Ultimate"],
  ["U", "Side skill"],
];

// The title menu's OPTIONS: sound, flashes and the controls, in a stamped dialog.
export function OptionsMenu({ className = "" }: { className?: string }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    const close = (e: MouseEvent) => e.target === d && d?.close(); // tap outside the panel
    d?.addEventListener("click", close);
    return () => d?.removeEventListener("click", close);
  }, []);
  return (
    <>
      <button onClick={() => ref.current?.showModal()} className={className}>
        <Settings className="size-5" /> Options
      </button>
      <dialog ref={ref} className="lift m-auto w-[min(92vw,26rem)] bg-card p-0 text-ink backdrop:bg-ink/50">
        <div className="flex items-center justify-between border-b-[3px] border-ink bg-gold px-4 py-3">
          <p className="font-display text-xl font-black uppercase tracking-tighter">Options</p>
          <button onClick={() => ref.current?.close()} aria-label="Close" className="border-2 border-ink bg-white p-1">
            <X className="size-4" />
          </button>
        </div>
        <div className="grid gap-4 p-4">
          <section>
            <p className="tag bg-ink text-gold">Audio & display</p>
            <div className="mt-2 grid gap-2 border-2 border-ink bg-cream p-3 text-sm font-semibold">
              <SoundSwitch />
              <ReduceFlashes />
            </div>
          </section>
          <section>
            <p className="tag bg-ink text-gold">Controls</p>
            <ul className="mt-2 divide-y-2 divide-ink border-2 border-ink text-sm">
              {KEYS.map(([k, v], i) => (
                <li key={k} className={`flex items-center justify-between px-3 py-1.5 ${i % 2 ? "bg-paper" : "bg-white"}`}>
                  <span className="font-semibold">{v}</span>
                  <kbd className="border-2 border-ink bg-white px-1.5 font-display text-xs font-extrabold">{k}</kbd>
                </li>
              ))}
            </ul>
            <p className="mt-2 text-xs text-muted">Phones get on-screen buttons; a gamepad works too.</p>
          </section>
        </div>
      </dialog>
    </>
  );
}
