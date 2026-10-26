"use client";

import type { ReactNode } from "react";
import { ARENA_INFO, type ArenaId } from "@/game/arena";
import type { PublicFighter } from "@/game/protocol";
import { ClassBadge } from "./ClassBadge";
import { FighterAvatar } from "./FighterAvatar";
import { StatBar } from "./StatBar";

export type VersusSide = { fighter: PublicFighter; tag: string; tone: "hit" | "guard" | "wait"; owner?: string };

const TONE = {
  hit: { panel: "bg-[#fff0ea]", tag: "bg-hit text-white", ring: "border-hit" },
  guard: { panel: "bg-[#eaf0ff]", tag: "bg-guard text-white", ring: "border-guard" },
  wait: { panel: "bg-cream", tag: "bg-white text-muted", ring: "border-ink/30" },
};

// The face-off after matchmaking (and before a fight with the computer): both fighters on a split stage
// with an ink slash between them and a VS burst on top.
export function Versus({ left, right, title = "Face-off", arena, children }: { left: VersusSide; right: VersusSide; title?: string; arena?: ArenaId; children?: ReactNode }) {
  return (
    <section className="lift relative overflow-hidden bg-card">
      <header className="flex items-center justify-between gap-2 border-b-[3px] border-ink bg-card px-3 py-2">
        <span className="tag bg-ink text-gold">{arena ? ARENA_INFO[arena].short : "Round 1"}</span>
        <h2 className="-rotate-1 border-[3px] border-ink bg-gold px-3 py-1 font-comic text-2xl shadow-[3px_3px_0_var(--ink)] sm:text-3xl">{title}</h2>
        <span className="tag bg-white">{arena ? "5:00" : "1 vs 1"}</span>
      </header>

      {arena && (
        <p className="border-b-[3px] border-ink bg-[#2b0f0a] px-3 py-1.5 text-center text-xs font-extrabold uppercase tracking-[0.2em] text-gold">
          {ARENA_INFO[arena].name} · one fight, five minutes · the arena gets worse
        </p>
      )}
      <div className="relative grid overflow-hidden md:grid-cols-2">
        <Side side={left} flip={false} />
        <Side side={right} flip />
        {/* The ink slash: across the middle on phones, down it on wider screens. */}
        <div className="pointer-events-none absolute top-1/2 left-[-10%] h-3 w-[120%] -translate-y-1/2 -rotate-6 bg-ink md:top-[-10%] md:left-1/2 md:h-[120%] md:w-3 md:translate-y-0 md:-translate-x-1/2 md:rotate-6" />
        <div className="pointer-events-none absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2">
          <div className="slam relative size-28 sm:size-32">
            <div className="burst absolute inset-0 bg-ink" />
            <div className="burst absolute inset-[7px] flex items-center justify-center bg-gold">
              <span className="font-comic text-5xl sm:text-6xl">VS</span>
            </div>
          </div>
        </div>
      </div>

      {children && <footer className="border-t-[3px] border-ink bg-card p-3 sm:p-4">{children}</footer>}
    </section>
  );
}

function Side({ side, flip }: { side: VersusSide; flip: boolean }) {
  const { fighter: f, tag, tone, owner } = side;
  const t = TONE[tone];
  const slide = flip ? "slide-r" : "slide-l";
  return (
    <div className={`relative p-3 sm:p-5 ${t.panel} ${flip ? "pt-10 md:pt-5" : "pb-10 md:pb-5"}`}>
      <div className={`flex ${flip ? "justify-end" : ""}`}>
        <span className={`tag ${t.tag} ${slide}`}>{tag}</span>
      </div>
      <div className={`mt-2 flex items-center gap-2 ${flip ? "flex-row-reverse" : ""} md:flex-col md:items-stretch`}>
        <div className={`${slide} h-36 w-24 shrink-0 sm:h-44 sm:w-32 md:mx-auto md:h-56 md:w-44`}>
          <FighterAvatar fighter={f} />
        </div>
        <div className={`card-edge min-w-0 flex-1 bg-card p-3 ${slide}`}>
          <p className="line-clamp-2 font-display text-2xl leading-none break-words sm:text-3xl">{f.name}</p>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <ClassBadge cls={f.class} />
            {owner && <span className="truncate text-xs font-semibold text-muted">@{owner}</span>}
          </div>
          <div className="mt-2 grid gap-1">
            <StatBar stat="atk" value={f.atk} compact />
            <StatBar stat="def" value={f.def} compact />
            <StatBar stat="spd" value={f.spd} compact />
            {f.agi != null && <StatBar stat="agi" value={f.agi} compact />}
            {f.iq != null && <StatBar stat="iq" value={f.iq} compact />}
          </div>
          <p className="mt-2 border-2 border-ink bg-cream px-2 py-1 text-[11px] leading-snug">
            <span className="font-extrabold uppercase tracking-wider text-hit">Special</span> {f.specialMove}
          </p>
        </div>
      </div>
    </div>
  );
}
