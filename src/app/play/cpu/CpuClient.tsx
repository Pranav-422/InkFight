"use client";

import { Bot, Swords } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { ClassBadge } from "@/components/ClassBadge";
import { FighterAvatar } from "@/components/FighterAvatar";
import { GameCanvas } from "@/components/GameCanvas";
import { ResultPanel } from "@/components/ResultPanel";
import { Versus } from "@/components/Versus";
import { cardUrl } from "@/components/ShareResult";
import { ARENA_INFO, isArenaId, type ArenaId } from "@/game/arena";
import type { Level } from "@/game/cpu";
import type { BossRun } from "@/game/dungeon";
import type { PublicFighter } from "@/game/protocol";
import { useCpuMatch } from "@/game/useCpuMatch";
import { useLeaveGuard } from "@/components/useLeaveGuard";

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
  initialArena,
}: {
  userId: string;
  mine: PublicFighter[];
  gallery: GalleryFighter[];
  initialOpponent: string | null;
  initialFighter: string | null;
  initialArena?: string | null;
}) {
  const key = `inkfight-fighter:${userId}`;
  const [meId, setMeId] = useState<string | null>(initialFighter ?? mine[0]?.id ?? null);
  const [cpuId, setCpuId] = useState<string | null>(initialOpponent);
  const [level, setLevel] = useState<Level>("normal");
  const [arena, setArena] = useState<ArenaId | null>(isArenaId(initialArena) ? initialArena : null); // null: the normal best-of-3
  const [fighting, setFighting] = useState(false);
  const [intro, setIntro] = useState(false); // the face-off before the fight

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

  if (fighting && me && cpu) return <CpuFight me={me} cpu={cpu} level={level} arena={arena ?? undefined} onExit={() => setFighting(false)} />;
  if (intro && me && cpu)
    return (
      <FaceOff
        me={me}
        cpu={cpu}
        level={level}
        arena={arena ?? undefined}
        onGo={() => {
          setIntro(false);
          setFighting(true);
        }}
      />
    );

  if (mine.length === 0) {
    return (
      <div className="mx-auto max-w-md rounded-2xl bg-card p-6 text-center card-edge">
        <p className="font-display text-xl font-extrabold">You need a fighter first</p>
        <p className="mt-1 text-sm text-muted">Scan a drawing, then come back to take on the computer.</p>
        <Link href="/create?next=/play/cpu" className="mt-4 inline-block rounded-xl bg-hit px-5 py-3 font-semibold text-white">
          Scan a fighter
        </Link>
      </div>
    );
  }

  const fightBar = (
    <>
      {!cpu && <p className="min-w-0 flex-1 text-sm text-muted md:hidden">Pick who the computer plays</p>}
      {me && cpu && (
        <p className="flex min-w-0 flex-1 items-center gap-2 text-sm font-semibold md:flex-none">
          <span className="truncate">{me.name}</span> <Swords className="size-4 shrink-0 text-muted" /> <span className="truncate">{cpu.name}</span>
        </p>
      )}
      <button
        disabled={!me || !cpu}
        onClick={() => {
          try {
            if (me) localStorage.setItem(key, me.id);
          } catch {}
          setIntro(true);
        }}
        className="press sticker ml-auto shrink-0 rounded-xl bg-hit px-6 py-3 font-display text-lg font-extrabold text-white disabled:opacity-40"
      >
        Fight!
      </button>
    </>
  );

  return (
    <div className="grid grid-cols-1 gap-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-widest text-muted">
            <Bot className="size-4" /> Vs computer
          </p>
          <h1 className="font-display text-3xl font-extrabold">Pick your fight</h1>
          <p className="text-sm text-muted">Choose your fighter, then any drawing from the gallery for the computer to play.</p>
        </div>
        <div className="hidden items-center gap-3 md:flex">{fightBar}</div>
      </div>

      <section>
        <h2 className="font-display text-xl font-extrabold">1. Your fighter</h2>
        <FighterGrid fighters={mine} selected={meId} onPick={setMeId} />
      </section>

      <section>
        <h2 className="font-display text-xl font-extrabold">2. Mode</h2>
        <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2" role="radiogroup" aria-label="Fight mode">
          {[
            { id: null, label: "Normal fight", hint: "Best of 3 rounds of 60 seconds" },
            { id: "inferno" as ArenaId, label: `Arena: ${ARENA_INFO.inferno.name} (5 min)`, hint: "One fight on a volcano that gets worse: heat, cracks, meteors, then a climb above rising lava" },
          ].map((m) => (
            <button
              key={m.label}
              role="radio"
              aria-checked={arena === m.id}
              onClick={() => setArena(m.id)}
              className={`rounded-xl p-4 text-left ring-1 transition ${arena === m.id ? "bg-ink text-white ring-ink" : "bg-card ring-line hover:ring-ink"}`}
            >
              <p className="font-display text-lg font-extrabold">{m.label}</p>
              <p className={`text-xs ${arena === m.id ? "text-white/70" : "text-muted"}`}>{m.hint}</p>
            </button>
          ))}
        </div>
      </section>

      <section>
        <h2 className="font-display text-xl font-extrabold">3. Difficulty</h2>
        <div className="mt-3 grid grid-cols-3 gap-2">
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
      <section>
        <h2 className="font-display text-xl font-extrabold">4. Computer plays as…</h2>
        <FighterGrid fighters={gallery} selected={cpuId} onPick={setCpuId} showOwner />
      </section>
      {/* Phones: the matchup and the button stay in reach above the tab bar. */}
      <div className="sticky bottom-24 z-10 flex items-center gap-3 rounded-2xl bg-paper/95 p-3 ring-1 ring-line backdrop-blur md:hidden">{fightBar}</div>
    </div>
  );
}

// A short face-off on the split stage, then the fight. Tap to skip.
function FaceOff({ me, cpu, level, arena, onGo }: { me: PublicFighter; cpu: GalleryFighter; level: Level; arena?: ArenaId; onGo: () => void }) {
  useEffect(() => {
    const t = setTimeout(onGo, 2600);
    return () => clearTimeout(t);
  }, [onGo]);
  return (
    <button onClick={onGo} className="block w-full text-left" aria-label="Start the fight">
      <Versus
        title="Fight!"
        arena={arena}
        left={{ fighter: me, tone: "hit", tag: "P1 (you) // Locked in" }}
        right={{ fighter: cpu, tone: "guard", tag: `CPU // ${level}`, owner: cpu.ownerHandle }}
      >
        <p className="text-center font-display text-sm font-extrabold uppercase tracking-widest text-muted">Get ready… tap to skip</p>
      </Versus>
    </button>
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
            className={`w-full rounded-2xl bg-card p-2 text-left transition ${selected === f.id ? "ring-2 ring-hit" : "card-edge hover:ring-ink"}`}
          >
            <div className="aspect-square w-full rounded-xl bg-white">
              <FighterAvatar fighter={f} />
            </div>
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

// boss/label/onResult: the dungeon's boss fights (src/app/play/dungeon) reuse this with a boss's passive and AI.
export function CpuFight({
  me,
  cpu,
  level,
  onExit,
  exitLabel = "Change fighters",
  boss,
  arena,
  label,
  onResult,
}: {
  me: PublicFighter;
  cpu: PublicFighter;
  level: Level;
  onExit: () => void;
  exitLabel?: string;
  boss?: BossRun;
  arena?: ArenaId; // an arena fight (src/game/arena.ts) instead of the best-of-3
  label?: string;
  onResult?: (won: boolean) => void;
}) {
  const { lobby, snaps, matchOver, sendInput, rematch } = useCpuMatch(me, cpu, level, boss, arena);
  const result = matchOver?.matchWinner ?? null;
  const report = useRef(onResult);
  useEffect(() => {
    report.current = onResult;
  });
  useEffect(() => {
    if (result !== null) report.current?.(result === 0);
  }, [result, matchOver]);
  useLeaveGuard(!matchOver, "The fight isn't over. Leave in the middle of it?");
  const [p0, p1] = lobby.players;
  const players = useMemo(() => [p0!, p1!] as [NonNullable<typeof p0>, NonNullable<typeof p1>], [p0?.id, p1?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="relative grid gap-4">
      <div className="flex items-center justify-between text-sm">
        <span className="flex items-center gap-1.5 font-semibold text-muted">
          <Bot className="size-4" /> {label ?? `Vs computer · ${level}${arena ? ` · ${ARENA_INFO[arena].name}` : ""}`}
        </span>
        <button data-leave onClick={onExit} className="text-muted underline-offset-2 hover:text-ink hover:underline">
          {exitLabel}
        </button>
      </div>
      <GameCanvas snaps={snaps} players={players} you={0} onInput={sendInput} onExit={onExit}>
      {matchOver && (matchOver.matchWinner !== null || matchOver.arena) && (
        <ResultPanel
          you={0}
          players={[me, cpu]}
          over={matchOver}
          primary={{ label: "Rematch", onClick: rematch }}
          secondary={{ label: "New matchup", onClick: onExit }}
          share={
            matchOver.matchWinner !== null && !matchOver.arena && !me.id.startsWith("sample-") && !cpu.id.startsWith("sample-")
              ? {
                  title: `${(matchOver.matchWinner === 0 ? me : cpu).name} wins on InkFight`, // (the share card is a 2-1 / 2-0 score: arena fights have none)
                  text: `${me.name} ${matchOver.wins[0]} – ${matchOver.wins[1]} ${cpu.name}`,
                  getUrl: () => cardUrl(me.id, cpu.id, [matchOver.wins[0], matchOver.wins[1]]),
                }
              : undefined
          }
        />
      )}
      </GameCanvas>
    </div>
  );
}
