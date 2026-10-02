"use client";

import type { Character } from "@prisma/client";
import { Check, Copy, Loader2, Swords, Trophy } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ClassBadge } from "@/components/ClassBadge";
import { GameCanvas } from "@/components/GameCanvas";
import type { LobbyPlayer } from "@/game/protocol";
import { useGameRoom } from "@/game/useGameRoom";

export function RoomClient({ code, initialFighter, userId }: { code: string; initialFighter: string | null; userId: string }) {
  // Remembered per account, so two demo logins in one browser don't swap fighters.
  const FIGHTER_KEY = `inkfight-fighter:${userId}`;
  const [fighterId, setFighterId] = useState<string | null>(initialFighter);
  const [picking, setPicking] = useState(false);

  useEffect(() => {
    if (initialFighter) {
      try {
        localStorage.setItem(FIGHTER_KEY, initialFighter);
      } catch {}
      return;
    }
    let saved: string | null = null;
    try {
      saved = localStorage.getItem(FIGHTER_KEY);
    } catch {}
    // Deferred so the effect doesn't set state synchronously.
    const t = setTimeout(() => (saved ? setFighterId(saved) : setPicking(true)), 0);
    return () => clearTimeout(t);
  }, [initialFighter, FIGHTER_KEY]);

  if (picking) {
    return (
      <FighterPicker
        code={code}
        onPick={(id) => {
          try {
            localStorage.setItem(FIGHTER_KEY, id);
          } catch {}
          setFighterId(id);
          setPicking(false);
        }}
      />
    );
  }
  if (!fighterId) return <Loader2 className="mx-auto mt-20 size-5 animate-spin text-muted" />;
  return <Room key={fighterId} code={code} fighterId={fighterId} userId={userId} onChangeFighter={() => setPicking(true)} />;
}

function Room({ code, fighterId, userId, onChangeFighter }: { code: string; fighterId: string; userId: string; onChangeFighter: () => void }) {
  const { lobby, error, status, snaps, matchOver, send, sendInput, retry } = useGameRoom(code, fighterId, userId);

  if (error) {
    return (
      <div className="mx-auto max-w-md rounded-2xl bg-card p-6 text-center ring-1 ring-line">
        <p className="font-display text-xl font-extrabold">{error}</p>
        <div className="mt-4 flex justify-center gap-2">
          <button onClick={retry} className="rounded-xl bg-hit px-4 py-2.5 text-sm font-semibold text-white">
            Try again
          </button>
          <button onClick={onChangeFighter} className="rounded-xl bg-ink px-4 py-2.5 text-sm font-semibold text-white">
            Pick another fighter
          </button>
          <Link href="/play" className="rounded-xl bg-card px-4 py-2.5 text-sm font-semibold ring-1 ring-line">
            New room
          </Link>
        </div>
      </div>
    );
  }
  if (!lobby) {
    return (
      <p className="flex items-center justify-center gap-2 py-20 text-muted">
        <Loader2 className="size-4 animate-spin" /> {status}
      </p>
    );
  }

  const [p0, p1] = lobby.players;
  const both = p0 && p1;

  if (both && lobby.status !== "lobby") {
    const winner = matchOver?.matchWinner ?? null;
    const me = lobby.players[lobby.you]!;
    return (
      <div className="relative grid gap-4">
        <GameCanvas snaps={snaps} players={[p0, p1]} you={lobby.you} onInput={sendInput} />
        {lobby.status === "over" && winner !== null && (
          <div className="pop-in absolute inset-x-0 top-[12%] mx-auto w-[min(92%,26rem)] rounded-2xl bg-ink p-6 text-center text-white shadow-2xl">
            <Trophy className="mx-auto size-8 text-gold" />
            <p className="mt-2 text-xs font-semibold uppercase tracking-widest text-gold">{winner === lobby.you ? "You win!" : "You lose"}</p>
            <p className="font-display text-3xl font-extrabold">{lobby.players[winner]!.name}</p>
            <p className="mt-1 text-sm text-white/60">
              {matchOver!.wins[0]} – {matchOver!.wins[1]} in rounds
            </p>
            {lobby.notice && <p className="mt-3 text-sm text-gold">{lobby.notice}</p>}
            <div className="mt-5 flex justify-center gap-2">
              <button
                onClick={() => send({ t: "rematch" })}
                disabled={me.rematch}
                className="rounded-xl bg-hit px-4 py-2.5 text-sm font-semibold text-white hover:brightness-110 disabled:opacity-60"
              >
                {me.rematch ? "Waiting for them…" : "Rematch"}
              </button>
              <Link href="/leaderboard" className="rounded-xl bg-white/10 px-4 py-2.5 text-sm font-semibold hover:bg-white/20">
                Leaderboard
              </Link>
            </div>
          </div>
        )}
      </div>
    );
  }

  const me = lobby.players[lobby.you]!;
  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-muted">Room</p>
          <h1 className="font-display text-4xl font-extrabold tracking-wider">{lobby.code}</h1>
        </div>
        <button onClick={onChangeFighter} className="text-sm text-muted underline-offset-2 hover:text-ink hover:underline">
          Change my fighter
        </button>
      </div>

      {lobby.notice && <p className="pop-in rounded-xl bg-gold/20 px-4 py-3 text-sm font-medium">{lobby.notice}</p>}

      <div className="grid items-center gap-4 sm:grid-cols-[1fr_auto_1fr]">
        {p0 ? <SeatCard p={p0} you={lobby.you === 0} /> : <InvitePanel code={lobby.code} />}
        <Swords className="mx-auto size-8 text-muted" />
        {p1 ? <SeatCard p={p1} you={lobby.you === 1} /> : <InvitePanel code={lobby.code} />}
      </div>

      <div className="flex flex-col items-center gap-2">
        <button
          onClick={() => send({ t: "ready", ready: !me.ready })}
          disabled={!both}
          className={`w-full max-w-xs rounded-xl px-6 py-3.5 font-display text-lg font-extrabold transition disabled:cursor-not-allowed disabled:opacity-40 ${
            me.ready ? "bg-ink text-white" : "bg-hit text-white hover:brightness-110"
          }`}
        >
          {!both ? "Waiting for a challenger…" : me.ready ? "Ready! (tap to cancel)" : "I'm ready"}
        </button>
        {both && <p className="text-xs text-muted">The fight starts when both players are ready.</p>}
      </div>
    </div>
  );
}

function SeatCard({ p, you }: { p: LobbyPlayer | null; you: boolean }) {
  if (!p) return <div className="h-48 rounded-2xl border-2 border-dashed border-ink/15" />;
  return (
    <div className={`rounded-2xl bg-card p-4 ring-1 ${p.ready ? "ring-2 ring-hit" : "ring-line"}`}>
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-widest text-muted">{you ? "You" : "Opponent"}</span>
        {p.ready && <span className="rounded-full bg-hit px-2 py-0.5 text-xs font-semibold text-white">Ready</span>}
      </div>
      {/* eslint-disable-next-line @next/next/no-img-element -- user uploads */}
      <img src={p.imageUrl} alt="" className="mx-auto mt-2 h-40 object-contain" />
      <p className="mt-2 truncate font-display text-xl font-extrabold">{p.name}</p>
      <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted">
        <ClassBadge cls={p.class} />
        <span className="tabular-nums">
          {p.hp} HP · {p.atk} ATK · {p.def} DEF · {p.spd} SPD
        </span>
      </div>
      <p className="mt-2 text-xs">
        <span className="font-semibold text-hit">Special:</span> {p.specialMove}
      </p>
    </div>
  );
}

function InvitePanel({ code }: { code: string }) {
  const [lan, setLan] = useState<string[]>([]);
  const [origin, setOrigin] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setOrigin(location.origin), 0);
    fetch("/api/server-info")
      .then((r) => r.json())
      .then((d) => setLan(d.lan ?? []))
      .catch(() => {});
    return () => clearTimeout(t);
  }, []);

  const link = useMemo(() => {
    if (!origin) return "";
    const u = new URL(origin);
    // "localhost" means nothing on a friend's phone; swap in this machine's LAN IP.
    if ((u.hostname === "localhost" || u.hostname === "127.0.0.1") && lan[0]) u.hostname = lan[0];
    return `${u.origin}/play/${code}`;
  }, [origin, lan, code]);

  return (
    <div className="rounded-2xl border-2 border-dashed border-ink/20 p-5 text-center">
      <p className="font-display text-xl font-extrabold">Waiting for a challenger…</p>
      <p className="mt-1 text-sm text-muted">Send your friend this link (or the room code):</p>
      <div className="mt-3 flex items-center gap-2 rounded-xl bg-card p-2 ring-1 ring-line">
        <code className="min-w-0 flex-1 truncate text-left text-sm">{link || "…"}</code>
        <button
          onClick={() => {
            navigator.clipboard?.writeText(link).then(() => {
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            });
          }}
          className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-ink px-3 py-1.5 text-xs font-semibold text-white"
        >
          {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <p className="mt-2 text-xs text-muted">Your friend logs in, opens the link and picks a fighter. Keep this tab open: your browser runs the fight.</p>
    </div>
  );
}

function FighterPicker({ code, onPick }: { code: string; onPick: (id: string) => void }) {
  const [list, setList] = useState<Character[] | null>(null);
  useEffect(() => {
    fetch("/api/characters?mine=1")
      .then((r) => r.json())
      .then(setList)
      .catch(() => setList([]));
  }, []);

  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-widest text-muted">Room {code}</p>
      <h1 className="font-display text-3xl font-extrabold">Pick one of your fighters</h1>
      <p className="mb-5 text-sm text-muted">
        Choose one you drew, or{" "}
        <Link href={`/create?room=${code}`} className="font-semibold text-hit underline-offset-2 hover:underline">
          draw a new fighter
        </Link>{" "}
        and come straight back.
      </p>
      {list === null ? (
        <Loader2 className="size-5 animate-spin text-muted" />
      ) : list.length === 0 ? (
        <Link href={`/create?room=${code}`} className="inline-block rounded-xl bg-hit px-5 py-3 font-semibold text-white">
          Draw your first fighter
        </Link>
      ) : (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {list.map((c) => (
            <li key={c.id}>
              <button onClick={() => onPick(c.id)} className="w-full rounded-2xl bg-card p-3 text-left ring-1 ring-line transition hover:ring-ink">
                {/* eslint-disable-next-line @next/next/no-img-element -- user uploads */}
                <img src={c.imageUrl} alt="" className="aspect-square w-full rounded-xl bg-white object-contain" />
                <p className="mt-2 truncate font-display font-extrabold">{c.name}</p>
                <ClassBadge cls={c.class} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
