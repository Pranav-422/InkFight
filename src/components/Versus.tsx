"use client";

import type { ReactNode } from "react";
import { ARENA_INFO, type ArenaId } from "@/game/arena";
import type { PublicFighter } from "@/game/protocol";
import { ClassBadge } from "./ClassBadge";
import { FighterAvatar } from "./FighterAvatar";
import { StatBar } from "./StatBar";

export type VersusSide = { fighter: PublicFighter; tag: string; tone: "hit" | "guard" | "wait"; owner?: string };

const TONE = {
  hit: { glow: "#e5482d", tint: "linear-gradient(115deg,#3a1510 0%,#241210 60%,#17171a 100%)", tag: "bg-hit text-white" },
  guard: { glow: "#2f5be0", tint: "linear-gradient(245deg,#10203f 0%,#111a2e 60%,#17171a 100%)", tag: "bg-guard text-white" },
  wait: { glow: "#8a8a92", tint: "linear-gradient(115deg,#2a2a2f 0%,#17171a 100%)", tag: "bg-white text-muted" },
};

// Dark brush-stroke backdrop (all CSS: a few slashes of lighter ink over the black), shared by both halves.
const BRUSH =
  "repeating-linear-gradient(115deg,rgba(255,255,255,0.035) 0 2px,transparent 2px 22px),linear-gradient(100deg,transparent 30%,rgba(255,255,255,0.05) 31%,transparent 36%,transparent 62%,rgba(255,255,255,0.04) 63%,transparent 66%)";

// The face-off after matchmaking (and before a fight with the computer), in the style of a fighting-game select screen:
// a black title bar with a notched centre, two halves split by a slanted white line, a gold VS badge on the seam, and a big
// gold name plate under each fighter. Dark ink panel, our paper / hit / guard / gold colours.
export function Versus({ left, right, title = "Face-off", arena, children }: { left: VersusSide; right: VersusSide; title?: string; arena?: ArenaId; children?: ReactNode }) {
  return (
    <section className="lift relative overflow-hidden bg-ink text-white">
      <header className="relative flex items-center justify-between gap-2 bg-black px-3 pt-2 pb-2.5 sm:px-5">
        <span className="tag bg-gold text-ink">{arena ? ARENA_INFO[arena].short : "Round 1"}</span>
        <div className="relative px-6 text-center sm:px-10" style={{ clipPath: "polygon(0 0,100% 0,94% 100%,6% 100%)", background: "#17171a" }}>
          <p className="text-[10px] font-extrabold uppercase tracking-[0.3em] text-white/60">{arena ? ARENA_INFO[arena].name : "Select your fighters"}</p>
          <h2 className="font-comic text-2xl leading-none sm:text-3xl">{title}</h2>
        </div>
        <span className="tag bg-white text-ink">{arena ? "5:00" : "1 vs 1"}</span>
        <span className="absolute inset-x-0 bottom-0 h-[3px] bg-gold" />
      </header>

      {arena && (
        <p className="bg-[#2b0f0a] px-3 py-1.5 text-center text-xs font-extrabold uppercase tracking-[0.2em] text-gold">
          {ARENA_INFO[arena].name} · one fight, five minutes · the arena gets worse
        </p>
      )}

      <div className="relative grid overflow-hidden md:grid-cols-2" style={{ backgroundImage: BRUSH, backgroundColor: "#17171a" }}>
        <Side side={left} flip={false} />
        <Side side={right} flip />
        {/* The slanted seam (a white line with a black shadow), down the middle on wide screens, across it on phones. */}
        <div className="pointer-events-none absolute top-1/2 left-[-10%] h-[5px] w-[120%] -translate-y-1/2 -rotate-3 bg-white shadow-[0_0_0_3px_#000] md:top-[-10%] md:left-1/2 md:h-[120%] md:w-[5px] md:translate-y-0 md:-translate-x-1/2 md:rotate-[4deg]" />
        <div className="pointer-events-none absolute top-1/2 left-1/2 z-10 -translate-x-1/2 -translate-y-1/2">
          <div className="slam -rotate-6 border-[4px] border-black bg-gold px-4 py-1 shadow-[4px_4px_0_#000] sm:px-5">
            <span className="font-comic text-4xl text-ink sm:text-5xl">VS</span>
          </div>
        </div>
      </div>

      {children && <footer className="border-t-[3px] border-gold bg-card p-3 text-ink sm:p-4">{children}</footer>}
    </section>
  );
}

function Side({ side, flip }: { side: VersusSide; flip: boolean }) {
  const { fighter: f, tag, tone, owner } = side;
  const t = TONE[tone];
  const slide = flip ? "slide-r" : "slide-l";
  // Each half is cut on the slant towards the seam on wide screens; the colour wash and a glow sit behind the figure.
  const cut = flip ? "md:[clip-path:polygon(7%_0,100%_0,100%_100%,0_100%)]" : "md:[clip-path:polygon(0_0,100%_0,93%_100%,0_100%)]";
  return (
    <div className={`relative flex min-h-[19rem] flex-col justify-between overflow-hidden md:min-h-[27rem] ${cut}`} style={{ background: t.tint }}>
      <div className="pointer-events-none absolute inset-0 opacity-70" style={{ background: `radial-gradient(60% 55% at ${flip ? "55%" : "45%"} 45%, ${t.glow}55, transparent 70%)` }} />
      <div className={`relative flex items-start p-3 sm:p-4 ${flip ? "justify-end" : ""}`}>
        <span className={`tag ${t.tag} ${slide} skew-x-[-8deg]`}>{tag}</span>
      </div>
      <div className={`${slide} relative mx-auto -mt-2 h-44 w-32 sm:h-56 sm:w-40 md:h-72 md:w-56`}>
        <FighterAvatar fighter={f} />
      </div>
      <div className="relative">
        <div className={`grid gap-1 px-3 pb-2 sm:px-4 ${flip ? "md:pl-9" : "md:pr-9"}`} style={{ gridTemplateColumns: "repeat(auto-fit,minmax(5.5rem,1fr))" }}>
          <div className="col-span-full flex flex-wrap items-center gap-1.5 text-white">
            <ClassBadge cls={f.class} />
            {owner && <span className="truncate text-xs font-semibold text-white/70">@{owner}</span>}
            <span className="ml-auto max-w-full truncate border-2 border-white/30 bg-black/50 px-2 py-0.5 text-[11px]"><b className="uppercase tracking-wider text-gold">Special</b> {f.specialMove}</span>
          </div>
          <div className="col-span-full grid gap-1 bg-card/95 p-2 text-ink">
            <StatBar stat="atk" value={f.atk} compact />
            <StatBar stat="def" value={f.def} compact />
            <StatBar stat="spd" value={f.spd} compact />
            {f.agi != null && <StatBar stat="agi" value={f.agi} compact />}
            {f.iq != null && <StatBar stat="iq" value={f.iq} compact />}
          </div>
        </div>
        {/* The gold name plate: a slanted slab like the select screen's, the name set big on it. */}
        <div className={`relative bg-gold px-4 py-2 ${flip ? "text-right md:[clip-path:polygon(6%_0,100%_0,100%_100%,0_100%)]" : "md:[clip-path:polygon(0_0,94%_0,100%_100%,0_100%)]"}`}>
          <p className="line-clamp-1 font-comic text-3xl leading-tight break-words text-ink uppercase sm:text-4xl md:text-5xl">{f.name}</p>
        </div>
      </div>
    </div>
  );
}
