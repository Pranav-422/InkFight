"use client";

import Link from "next/link";
import type { PublicFighter } from "@/game/protocol";
import type { Snapshot } from "@/game/sim";
import { FighterAvatar } from "./FighterAvatar";
import { ShareResult } from "./ShareResult";

type Action = { label: string; onClick?: () => void; href?: string; disabled?: boolean };

// The end-of-match card over the arena: K.O. burst, final score, a short combat receipt and what to do next.
export function ResultPanel({
  you,
  players,
  over,
  notice,
  primary,
  secondary,
  share,
}: {
  you: 0 | 1;
  players: [PublicFighter, PublicFighter];
  over: Snapshot;
  notice?: string;
  primary: Action;
  secondary: Action;
  share?: { title: string; text: string; getUrl: () => Promise<string> | string };
}) {
  const w = over.matchWinner ?? 0;
  const won = w === you;
  const them = (1 - you) as 0 | 1;
  const winner = players[w];
  const btn = "press sticker flex flex-1 items-center justify-center gap-2 px-3 py-2.5 font-display text-base disabled:opacity-60";
  const act = (a: Action, cls: string) =>
    a.href ? (
      <Link href={a.href} className={`${btn} ${cls}`}>
        {a.label}
      </Link>
    ) : (
      <button onClick={a.onClick} disabled={a.disabled} className={`${btn} ${cls}`}>
        {a.label}
      </button>
    );

  return (
    <div className="pop-in absolute inset-0 z-20 flex items-center justify-center bg-ink/45 p-2 sm:p-4">
      <div className="lift max-h-full w-[min(100%,34rem)] overflow-y-auto bg-card">
        <div className="flex items-center gap-3 border-b-[3px] border-ink bg-[radial-gradient(rgba(23,23,23,.14)_1.2px,transparent_1.4px)] [background-size:9px_9px] px-3 py-2">
          <div className="slam relative size-20 shrink-0">
            <div className="burst absolute inset-0 bg-ink" />
            <div className="burst absolute inset-[6px] flex items-center justify-center bg-gold">
              <span className="font-comic text-3xl text-hit">K.O.!</span>
            </div>
          </div>
          <div className="min-w-0 flex-1">
            <p className="tag bg-ink text-gold">{won ? "Victorious duelist" : "Defeated"}</p>
            <p className={`mt-1 font-display text-3xl font-black leading-none ${won ? "text-hit" : "text-muted"}`}>
              {won ? "Victory" : "Defeat"}
            </p>
          </div>
          <div className="card-edge shrink-0 bg-card px-3 py-1 text-center">
            <p className="text-[10px] font-extrabold uppercase tracking-widest text-muted">Final</p>
            <p className="font-display text-3xl font-black tabular-nums leading-none">
              <span className={won ? "text-hit" : ""}>{over.wins[you]}</span>–{over.wins[them]}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-[auto_1fr] gap-3 p-3 [@media(max-height:480px)]:grid-cols-1 [@media(max-height:480px)]:py-2">
          <div className="card-edge w-20 bg-gold/40 p-1 sm:w-28 [@media(max-height:480px)]:hidden">
            <div className="aspect-[4/5] bg-white">
              <FighterAvatar fighter={winner} />
            </div>
            <p className="mt-1 truncate text-center font-display text-xs font-black">{winner.name}</p>
          </div>
          <div className="grid content-start gap-2 [@media(max-height:480px)]:grid-cols-3">
            <Stat label="Damage dealt" value={Math.round(over.damage[you])} unit="dmg" hot />
            <Stat label="Damage taken" value={Math.round(over.damage[them])} unit="dmg" />
            <Stat label="Rounds" value={over.round} unit={`vs ${players[them].name}`} />
          </div>
        </div>

        {notice && <p className="mx-3 mb-3 border-2 border-ink bg-gold/30 px-3 py-2 text-sm font-semibold">{notice}</p>}

        <div className="sticky bottom-0 flex flex-wrap gap-2 border-t-[3px] border-ink bg-card p-3">
          {act(primary, "bg-hit text-white")}
          {act(secondary, "bg-white text-ink")}
          {share && <ShareResult {...share} className={`${btn} bg-gold text-ink`} />}
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, unit, hot }: { label: string; value: number; unit: string; hot?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-2 border-2 border-ink bg-cream px-3 py-1.5">
      <span className="text-[11px] font-extrabold uppercase tracking-widest">{label}</span>
      <span className="truncate text-right">
        <span className={`font-display text-xl font-black tabular-nums ${hot ? "text-hit" : ""}`}>{value}</span>{" "}
        <span className="text-[10px] font-extrabold uppercase tracking-wider text-muted [@media(max-height:480px)]:hidden">{unit}</span>
      </span>
    </div>
  );
}
