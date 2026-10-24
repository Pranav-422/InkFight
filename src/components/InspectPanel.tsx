"use client";

// "Read" your opponent mid-fight (hover their HUD, hold I, or tap their bar on a phone).
// What you see depends on your IQ: everyone sees the build, a sharp mind (IQ at least
// theirs − 10) reads their special, and a genius (IQ 85+) reads their live meter.

import { Eye, Lock } from "lucide-react";
import { useEffect, useState, type RefObject } from "react";
import { styleOf } from "@/game/moves";
import type { LobbyPlayer } from "@/game/protocol";
import type { Slot } from "@/game/sim";
import type { SnapBuffer } from "@/game/useGameRoom";
import { STAT_KEYS } from "@/lib/stats";
import { ClassBadge } from "./ClassBadge";
import { StatBar } from "./StatBar";

const GENIUS = 85;

export function InspectPanel({ me, them, slot, snaps }: { me: LobbyPlayer; them: LobbyPlayer; slot: Slot; snaps: RefObject<SnapBuffer> }) {
  const myIq = me.iq ?? 70, theirIq = them.iq ?? 70;
  const readsSpecial = myIq >= theirIq - 10;
  const readsMeter = myIq >= GENIUS;
  const [energy, setEnergy] = useState<number | null>(null);
  useEffect(() => {
    if (!readsMeter) return;
    const t = setInterval(() => {
      const f = snaps.current.cur?.fighters[slot];
      setEnergy(f ? Math.round(f.energy) : null);
    }, 150);
    return () => clearInterval(t);
  }, [readsMeter, snaps, slot]);

  const lock = (text: string) => (
    <p className="flex items-center gap-1 text-[11px] text-muted">
      <Lock className="size-3" /> {text}
    </p>
  );
  return (
    <div className="pointer-events-none w-56 rounded-xl bg-card/95 p-3 text-sm shadow-lg ring-1 ring-line backdrop-blur">
      <p className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-muted">
        <Eye className="size-3" /> Reading {them.name}
      </p>
      <div className="mt-1 flex flex-wrap items-center gap-1.5">
        <ClassBadge cls={them.class} />
        <span className="text-xs text-muted">{styleOf(them.style, them.class)}</span>
        {them.element && them.element !== "NONE" && <span className="rounded-full bg-paper px-2 py-0.5 text-[10px] font-semibold ring-1 ring-line">{them.element}</span>}
      </div>
      <div className="mt-2 grid gap-1">
        {STAT_KEYS.map((k) => (
          <StatBar key={k} stat={k} value={them[k] ?? 70} compact />
        ))}
      </div>
      <div className="mt-2 grid gap-1 border-t border-line pt-2">
        {readsSpecial ? <p className="text-xs"><span className="font-semibold text-hit">Special:</span> {them.specialMove}</p> : lock(`Special hidden: your IQ ${myIq} vs their ${theirIq}`)}
        {readsMeter ? (
          energy !== null && (
            <p className="text-xs">
              <span className="font-semibold">Meter:</span> {energy}%{" "}
              {energy >= 100 && <span className="ml-1 rounded bg-hit px-1.5 py-0.5 text-[10px] font-bold text-white">ULTIMATE READY</span>}
            </p>
          )
        ) : (
          lock(`Live meter: needs IQ ${GENIUS}`)
        )}
      </div>
    </div>
  );
}
