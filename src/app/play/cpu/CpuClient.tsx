"use client";

import { Bot, Swords, Trophy } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ClassBadge } from "@/components/ClassBadge";
import { GameCanvas } from "@/components/GameCanvas";
import type { Level } from "@/game/cpu";
import type { PublicFighter } from "@/game/protocol";
import { useCpuMatch } from "@/game/useCpuMatch";

type GalleryFighter = PublicFighter & { ownerHandle: string };

const LEVELS: { id: Level; label: string; hint: string }[] = [
  { id: "easy", label: "Easy", hint: "Slow to react, rarely blocks" },
  { id: "normal", label: "Normal", hint: "Blocks some, punishes mistakes" },
  { id: "hard", label: "Hard", hint: "Fast, blocks a lot, dodges" },
];

export function CpuClient({
  userId,
  mine,
  gallery,
  initialOpponent,
  initialFighter,
}: {
  userId: string;
  mine: PublicFighter[];
  gallery: GalleryFighter[];
  initialOpponent: string | null;
  initialFighter: string | null;
}) {
  const key = `inkfight-fighter:${userId}`;
  const [meId, setMeId] = useState<string | null>(initialFighter ?? mine[0]?.id ?? null);
  const [cpuId, setCpuId] = useState<string | null>(initialOpponent);
  const [level, setLevel] = useState<Level>("normal");
  const [fighting, setFighting] = useState(false);

  // Default to the fighter last used in online play.
  useEffect(() => {
    if (initialFighter) return;
    try {
      const saved = localStorage.getItem(key);
      if (saved && mine.some((m) => m.id === saved)) {
        const t = setTimeout(() => setMeId(saved), 0);
        return () => clearTimeout(t);
      }
    } catch {}
  }, [key, mine, initialFighter]);

  const me = useMemo(() => mine.find((m) => m.id === meId) ?? null, [mine, meId]);
  const cpu = useMemo(() => gallery.find((g) => g.id === cpuId) ?? null, [gallery, cpuId]);

  if (fighting && me && cpu) return <CpuFight me={me} cpu={cpu} level={level} onExit={() => setFighting(false)} />;

  if (mine.length === 0) {
    return (
      <div className="mx-auto max-w-md rounded-2xl bg-card p-6 text-center ring-1 ring-line">
        <p className="font-display text-xl font-extrabold">You need a fighter first</p>
        <p className="mt-1 text-sm text-muted">Scan a drawing, then come back to take on the computer.</p>
        <Link href="/create" className="mt-4 inline-block rounded-xl bg-hit px-5 py-3 font-semibold text-white">
          Scan a fighter
        </Link>
      </div>
    );
  }

  return (
    <div className="grid gap-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-widest text-muted">
            <Bot className="size-4" /> Vs computer
          </p>
          <h1 className="font-display text-3xl font-extrabold">Pick your fight</h1>
          <p className="text-sm text-muted">Choose your fighter, then any drawing from the gallery for the computer to play.</p>
        </div>
        <div className="flex items-center gap-3">
          {me && cpu && (
            <p className="hidden items-center gap-2 text-sm font-semibold sm:flex">
              {me.name} <Swords className="size-4 text-muted" /> {cpu.name}
            </p>
          )}
          <button
            disabled={!me || !cpu}
            onClick={() => {
              try {
                if (me) localStorage.setItem(key, me.id);
              } catch {}
              setFighting(true);
            }}
            className="rounded-xl bg-hit px-6 py-3 font-display text-lg font-extrabold text-white hover:brightness-110 disabled:opacity-40"
          >
            Fight!
          </button>
        </div>
      </div>

      <section>
        <h2 className="font-display text-xl font-extrabold">1. Your fighter</h2>
        <FighterGrid fighters={mine} selected={meId} onPick={setMeId} />
      </section>

      <section>
        <h2 className="font-display text-xl font-extrabold">2. Computer plays as…</h2>
        <FighterGrid fighters={gallery} selected={cpuId} onPick={setCpuId} showOwner />
      </section>

      <section>
        <h2 className="font-display text-xl font-extrabold">3. Difficulty</h2>
        <div className="mt-3 grid gap-2 sm:grid-cols-3">
          {LEVELS.map((l) => (
            <button
              key={l.id}
              onClick={() => setLevel(l.id)}
              className={`rounded-xl p-4 text-left ring-1 transition ${level === l.id ? "bg-ink text-white ring-ink" : "bg-card ring-line hover:ring-ink"}`}
            >
              <p className="font-display text-lg font-extrabold">{l.label}</p>
              <p className={`text-xs ${level === l.id ? "text-white/70" : "text-muted"}`}>{l.hint}</p>
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}

function FighterGrid({
  fighters,
  selected,
  onPick,
  showOwner,
}: {
  fighters: (PublicFighter & { ownerHandle?: string })[];
  selected: string | null;
  onPick: (id: string) => void;
  showOwner?: boolean;
}) {
  return (
    <ul className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
      {fighters.map((f) => (
        <li key={f.id}>
          <button
            onClick={() => onPick(f.id)}
            className={`w-full rounded-2xl bg-card p-2 text-left transition ${selected === f.id ? "ring-2 ring-hit" : "ring-1 ring-line hover:ring-ink"}`}
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- user uploads */}
            <img src={f.imageUrl} alt="" className="aspect-square w-full rounded-xl bg-white object-contain" />
            <p className="mt-2 truncate px-1 text-sm font-semibold">{f.name}</p>
            <div className="flex items-center justify-between gap-1 px-1 pb-1">
              <ClassBadge cls={f.class} />
              {showOwner && f.ownerHandle && <span className="truncate text-[11px] text-muted">@{f.ownerHandle}</span>}
            </div>
          </button>
        </li>
      ))}
    </ul>
  );
}

export function CpuFight({
  me,
  cpu,
  level,
  onExit,
  exitLabel = "Change fighters",
}: {
  me: PublicFighter;
  cpu: PublicFighter;
  level: Level;
  onExit: () => void;
  exitLabel?: string;
}) {
  const { lobby, snaps, matchOver, sendInput, rematch } = useCpuMatch(me, cpu, level);
  const [p0, p1] = lobby.players;
  const players = useMemo(() => [p0!, p1!] as [NonNullable<typeof p0>, NonNullable<typeof p1>], [p0?.id, p1?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="relative grid gap-4">
      <div className="flex items-center justify-between text-sm">
        <span className="flex items-center gap-1.5 font-semibold text-muted">
          <Bot className="size-4" /> Vs computer · {level}
        </span>
        <button onClick={onExit} className="text-muted underline-offset-2 hover:text-ink hover:underline">
          {exitLabel}
        </button>
      </div>
      <GameCanvas snaps={snaps} players={players} you={0} onInput={sendInput} />
      {matchOver && matchOver.matchWinner !== null && (
        <div className="pop-in absolute inset-x-0 top-[12%] mx-auto w-[min(92%,26rem)] rounded-2xl bg-ink p-6 text-center text-white shadow-2xl">
          <Trophy className="mx-auto size-8 text-gold" />
          <p className="mt-2 text-xs font-semibold uppercase tracking-widest text-gold">
            {matchOver.matchWinner === 0 ? "You beat the computer!" : "The computer wins"}
          </p>
          <p className="font-display text-3xl font-extrabold">{(matchOver.matchWinner === 0 ? me : cpu).name}</p>
          <p className="mt-1 text-sm text-white/60">
            {matchOver.wins[0]} – {matchOver.wins[1]} in rounds
          </p>
          <div className="mt-5 flex justify-center gap-2">
            <button onClick={rematch} className="rounded-xl bg-hit px-4 py-2.5 text-sm font-semibold text-white hover:brightness-110">
              Rematch
            </button>
            <button onClick={onExit} className="rounded-xl bg-white/10 px-4 py-2.5 text-sm font-semibold hover:bg-white/20">
              New matchup
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
