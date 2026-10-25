"use client";

import { Crown, Lock, Skull, Swords, Trophy } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ClassBadge } from "@/components/ClassBadge";
import { FighterAvatar } from "@/components/FighterAvatar";
import { BOSSES, bossFighter, bossRun, FLOORS, type Boss } from "@/game/dungeon";
import type { PublicFighter } from "@/game/protocol";
import { CpuFight } from "../cpu/CpuClient";

// The ladder: cleared floors, the floor you're on, and the locked ones above it.
export function DungeonClient({ userId, cleared: initialCleared, mine }: { userId: string; cleared: number; mine: PublicFighter[] }) {
  const key = `inkfight-fighter:${userId}`;
  const [cleared, setCleared] = useState(initialCleared);
  const [meId, setMeId] = useState<string | null>(mine[0]?.id ?? null);
  const [floor, setFloor] = useState<number | null>(null); // fighting this floor
  const [news, setNews] = useState<{ won: boolean; boss: Boss } | null>(null);

  // The fighter last used anywhere (online, vs computer).
  useEffect(() => {
    try {
      const saved = localStorage.getItem(key);
      if (saved && mine.some((m) => m.id === saved)) {
        const t = setTimeout(() => setMeId(saved), 0);
        return () => clearTimeout(t);
      }
    } catch {}
  }, [key, mine]);

  const me = useMemo(() => mine.find((m) => m.id === meId) ?? null, [mine, meId]);
  const boss = useMemo(() => (floor ? bossFighter(floor) : null), [floor]);

  async function result(won: boolean) {
    const b = BOSSES[floor! - 1];
    setNews({ won, boss: b });
    if (!won || floor !== cleared + 1) return;
    const r = await fetch("/api/dungeon/clear", { method: "POST", body: JSON.stringify({ floor }) }).then((x) => x.json()).catch(() => null);
    if (r?.floor) setCleared(r.floor);
  }

  if (floor && me && boss) {
    const b = BOSSES[floor - 1];
    return (
      <div className="grid gap-3">
        <CpuFight
          me={me}
          cpu={boss}
          level="hard"
          boss={bossRun(floor)}
          label={`Floor ${floor} · ${b.title}`}
          exitLabel="Back to the ladder"
          onExit={() => setFloor(null)}
          onResult={result}
        />
        {news && !news.won && (
          <p className="rounded-xl bg-card px-4 py-3 text-sm ring-1 ring-line">
            <span className="font-semibold">How to beat {b.title}:</span> {b.counterplay}
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="grid gap-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 font-display text-4xl font-extrabold">
            <Skull className="size-8" /> The Dungeon
          </h1>
          <p className="mt-1 text-sm text-muted">Ten floors, one boss each, every one tougher than the last. Beat a boss to copy its move.</p>
        </div>
        <p className="rounded-full bg-ink px-4 py-1.5 text-sm font-semibold text-white">
          {cleared >= FLOORS ? "Dungeon cleared!" : `Floor ${cleared + 1} of ${FLOORS}`}
        </p>
      </header>

      {news?.won && (
        <div className="pop-in flex items-center gap-3 rounded-2xl bg-gold/20 px-4 py-3 text-sm">
          <Trophy className="size-5 shrink-0 text-gold" />
          <p>
            <span className="font-semibold">{news.boss.title} is down.</span> You copied <span className="font-semibold">{news.boss.reward.name}</span>: {news.boss.reward.description} Pick it in <Link href="/build" className="font-semibold underline">the builder</Link> or when you scan a fighter.
          </p>
        </div>
      )}

      {mine.length === 0 ? (
        <p className="rounded-2xl bg-card p-6 text-center card-edge">
          You need a fighter first. <Link href="/create?next=/play/dungeon" className="font-semibold text-hit underline">Scan or build one</Link>.
        </p>
      ) : (
        <label className="flex flex-wrap items-center gap-2 text-sm font-semibold">
          Climbing with
          <select value={meId ?? ""} onChange={(e) => setMeId(e.target.value)} className="rounded-lg bg-card px-3 py-1.5 ring-1 ring-line">
            {mine.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name} ({m.class})
              </option>
            ))}
          </select>
        </label>
      )}

      <ol className="grid gap-3">
        {BOSSES.map((b) => {
          const done = b.floor <= cleared;
          const open = b.floor === cleared + 1;
          return (
            <li key={b.floor} className={`grid gap-4 rounded-2xl p-4 ring-1 sm:grid-cols-[96px_1fr_auto] sm:items-center ${open ? "bg-card ring-2 ring-hit" : "bg-card ring-line"} ${!done && !open ? "opacity-60" : ""}`}>
              <div className="relative size-24 overflow-hidden rounded-xl bg-white ring-1 ring-line">
                {done || open ? <FighterAvatar fighter={{ imageUrl: `/boss-art/${b.floor}`, class: b.cls, item: b.item, style: b.style }} showcase={open} /> : <Lock className="absolute inset-0 m-auto size-8 text-muted" />}
              </div>
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted">
                  Floor {b.floor} {b.floor === FLOORS && <Crown className="inline size-3.5 text-gold" />}
                </p>
                <h2 className="font-display text-xl font-extrabold">
                  {b.title} <span className="text-sm font-semibold text-muted">{b.epithet}</span>
                </h2>
                {(done || open) && (
                  <>
                    <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs">
                      <ClassBadge cls={b.cls} />
                      <span className="text-muted">{b.style}</span>
                      {b.element !== "NONE" && <span className="rounded-full bg-paper px-2 py-0.5 font-semibold ring-1 ring-line">{b.element}</span>}
                    </div>
                    <p className="mt-2 text-sm">
                      <span className="font-semibold text-hit">{b.passive.name}:</span> {b.passive.hint}
                    </p>
                    {open && <p className="mt-1 text-sm italic text-muted">&ldquo;{b.taunt}&rdquo;</p>}
                    {done && <p className="mt-1 text-sm text-muted">Copied: {b.reward.name}</p>}
                  </>
                )}
              </div>
              {(open || done) && me && (
                <button
                  onClick={() => {
                    setNews(null);
                    setFloor(b.floor);
                  }}
                  className={`inline-flex items-center justify-center gap-2 rounded-xl px-5 py-3 font-semibold ${open ? "bg-hit text-white hover:brightness-110" : "bg-ink/5 hover:bg-ink/10"}`}
                >
                  <Swords className="size-4" /> {open ? "Fight" : "Rematch"}
                </button>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
