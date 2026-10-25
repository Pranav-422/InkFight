"use client";

import type { Character } from "@prisma/client";
import { Camera, Check, Copy, Loader2, Share2, Trophy } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { ClassBadge } from "@/components/ClassBadge";
import { FighterAvatar } from "@/components/FighterAvatar";
import { GameCanvas } from "@/components/GameCanvas";
import { resultUrl, ShareResult } from "@/components/ShareResult";
import { ultTitle } from "@/game/moves";
import type { LobbyPlayer } from "@/game/protocol";
import { useGameRoom } from "@/game/useGameRoom";
import { useLeaveGuard } from "@/components/useLeaveGuard";

export function RoomClient({ code, initialFighter, userId }: { code: string; initialFighter: string | null; userId: string }) {
  // Remembered per account, so two demo logins in one browser don't swap fighters.
  const FIGHTER_KEY = `inkfight-fighter:${userId}`;
  const [fighterId, setFighterId] = useState<string | null>(initialFighter);
  // Without ?fighter= (the host's flow from a character page), always ask: silently
  // reusing the last fighter is how invited friends ended up with someone else's.
  const [picking, setPicking] = useState(!initialFighter);
  const [preferred, setPreferred] = useState<string | null>(null);

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
    const t = setTimeout(() => setPreferred(saved), 0);
    return () => clearTimeout(t);
  }, [initialFighter, FIGHTER_KEY]);

  if (picking) {
    return (
      <FighterPicker
        code={code}
        preferred={preferred}
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
  const router = useRouter();
  const { lobby, error, status, snaps, matchOver, send, sendInput, retry } = useGameRoom(code, fighterId, userId);
  useLeaveGuard(lobby?.status === "playing", "The fight is still on. Leave in the middle of it?");
  const [q0, q1] = lobby?.players ?? [null, null];
  // A fresh array every lobby update would rebuild the renderer: sprites reload, old hit FX replay.
  const players = useMemo(() => (q0 && q1 ? ([q0, q1] as [LobbyPlayer, LobbyPlayer]) : null), [q0?.id, q1?.id]); // eslint-disable-line react-hooks/exhaustive-deps

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

  if (both && players && lobby.status !== "lobby") {
    const winner = matchOver?.matchWinner ?? null;
    const me = lobby.players[lobby.you]!;
    return (
      <div className="relative grid gap-4">
        <GameCanvas snaps={snaps} players={players} you={lobby.you} onInput={sendInput} onExit={() => router.push("/play")}>
        {lobby.notice && lobby.status === "playing" && (
          <p data-notice className="pop-in absolute inset-x-0 bottom-3 mx-auto w-fit max-w-[90%] rounded-xl bg-gold/90 px-4 py-2 text-center text-sm font-medium">
            {lobby.notice}
          </p>
        )}
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
            <div className="mt-2 flex justify-center">
              <ShareResult
                title={`${lobby.players[winner]!.name} wins on InkFight`}
                text={`${lobby.players[0]!.name} ${matchOver!.wins[0]} – ${matchOver!.wins[1]} ${lobby.players[1]!.name}`}
                getUrl={() => resultUrl(lobby.players[0]!.id, lobby.players[1]!.id, [matchOver!.wins[0], matchOver!.wins[1]])}
              />
            </div>
          </div>
        )}
        </GameCanvas>
      </div>
    );
  }

  const me = lobby.players[lobby.you]!;
  return (
    <div className="grid grid-cols-1 gap-5">
      <div className="flex items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-muted">Room</p>
          <h1 className="font-display text-4xl font-extrabold tracking-wider">{lobby.code}</h1>
        </div>
        <button onClick={onChangeFighter} className="shrink-0 rounded-full bg-card px-3 py-1.5 text-sm font-semibold ring-1 ring-line hover:ring-ink">
          Change fighter
        </button>
      </div>

      {lobby.notice && <p className="pop-in rounded-xl bg-gold/20 px-4 py-3 text-sm font-medium">{lobby.notice}</p>}

      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 sm:gap-4">
        <SeatCard p={p0} you={lobby.you === 0} />
        <span className="rotate-[-8deg] rounded-lg border-2 border-ink bg-gold px-2 py-0.5 font-display text-xl font-extrabold sm:text-2xl">VS</span>
        <SeatCard p={p1} you={lobby.you === 1} />
      </div>

      {!both && <InvitePanel code={lobby.code} />}

      {/* Phones: the ready button stays in reach above the tab bar. */}
      <div className="sticky bottom-24 z-10 flex flex-col items-center gap-2 md:bottom-4">
        <button
          onClick={() => send({ t: "ready", ready: !me.ready })}
          disabled={!both}
          className={`press sticker w-full max-w-sm rounded-xl px-6 py-3.5 font-display text-lg font-extrabold transition disabled:cursor-not-allowed disabled:border-ink/30 disabled:bg-card disabled:text-muted disabled:shadow-none ${
            me.ready ? "bg-ink text-white" : "bg-hit text-white"
          }`}
        >
          {!both ? "Waiting for your friend…" : me.ready ? "Ready! (tap to cancel)" : "I'm ready"}
        </button>
        {both && <p className="text-xs text-muted">The fight starts when both players are ready.</p>}
      </div>
    </div>
  );
}

function SeatCard({ p, you }: { p: LobbyPlayer | null; you: boolean }) {
  if (!p) {
    return (
      <div className="flex aspect-[4/5] flex-col items-center justify-center rounded-2xl border-2 border-dashed border-ink/25 text-center sm:aspect-auto sm:h-full sm:min-h-64">
        <span className="font-display text-5xl font-extrabold text-ink/20">?</span>
        <span className="mt-1 text-xs font-semibold text-muted">Waiting…</span>
      </div>
    );
  }
  return (
    <div className={`min-w-0 rounded-2xl bg-card p-3 sm:p-4 ${p.ready ? "ring-2 ring-hit" : "ring-1 ring-line"}`}>
      <div className="flex items-center justify-between gap-1">
        <span className="text-[11px] font-semibold uppercase tracking-widest text-muted">{you ? "You" : "Opponent"}</span>
        {p.ready && <span className="rounded-full bg-hit px-2 py-0.5 text-[11px] font-semibold text-white">Ready</span>}
      </div>
      <div className="mx-auto mt-1 h-28 w-24 sm:mt-2 sm:h-40 sm:w-32">
        <FighterAvatar fighter={p} />
      </div>
      <p className="mt-1 truncate font-display text-lg font-extrabold sm:mt-2 sm:text-xl">{p.name}</p>
      <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted">
        <ClassBadge cls={p.class} />
        <span className="hidden tabular-nums sm:inline">
          {p.atk} STR · {p.def} DUR · {p.spd} SPD
        </span>
      </div>
      <p className="mt-2 hidden text-xs sm:block">
        <span className="font-semibold text-hit">Special:</span> {p.specialMove} · <span className="font-semibold text-hit">Ult:</span> {ultTitle(p.ultMove, p.ultKind, p.class)}
      </p>
    </div>
  );
}

function InvitePanel({ code }: { code: string }) {
  const [lan, setLan] = useState<string[]>([]);
  const [origin, setOrigin] = useState("");
  const [copied, setCopied] = useState(false);
  const [canShare, setCanShare] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => {
      setOrigin(location.origin);
      setCanShare(typeof navigator.share === "function");
    }, 0);
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

  const copy = () =>
    navigator.clipboard?.writeText(link).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  return (
    <div className="rounded-2xl bg-card p-4 ring-1 ring-line">
      <p className="font-display text-lg font-extrabold">Invite your friend</p>
      <p className="text-sm text-muted">Send the link, or tell them the code <b className="font-display tracking-wider text-ink">{code}</b>.</p>
      <div className="mt-3 flex items-center gap-2 rounded-xl bg-paper p-2 ring-1 ring-line">
        <code className="min-w-0 flex-1 truncate text-left text-sm">{link || "…"}</code>
        <button onClick={copy} className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-ink px-3 py-1.5 text-xs font-semibold text-white">
          {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      {canShare && (
        <button
          onClick={() => navigator.share({ title: "InkFight", text: "Fight me on InkFight! Bring a drawing.", url: link }).catch(() => {})}
          className="mt-2 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-guard px-4 py-2.5 font-semibold text-white"
        >
          <Share2 className="size-4" /> Share link
        </button>
      )}
      <p className="mt-2 text-xs text-muted">Keep this tab open: your browser runs the fight.</p>
    </div>
  );
}

function FighterPicker({ code, preferred, onPick }: { code: string; preferred: string | null; onPick: (id: string) => void }) {
  const [list, setList] = useState<Character[] | null>(null);
  useEffect(() => {
    fetch("/api/characters?mine=1")
      .then((r) => r.json())
      .then(setList)
      .catch(() => setList([]));
  }, []);

  const last = list?.find((c) => c.id === preferred);
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-widest text-muted">Room {code}</p>
      <h1 className="font-display text-3xl font-extrabold">Who fights for you?</h1>
      <p className="mb-5 text-sm text-muted">Scan a fresh drawing (you&apos;ll come straight back), or pick one you made before.</p>
      {last && (
        <button onClick={() => onPick(last.id)} className="mb-4 rounded-xl bg-ink px-5 py-3 font-semibold text-white hover:bg-ink/85">
          Fight with {last.name} again
        </button>
      )}
      {list === null ? (
        <Loader2 className="size-5 animate-spin text-muted" />
      ) : (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          <li>
            <Link
              href={`/create?room=${code}`}
              className="flex aspect-[4/5] h-full w-full flex-col items-center justify-center gap-2 rounded-2xl bg-hit p-3 text-center text-white hover:brightness-110"
            >
              <Camera className="size-9" />
              <span className="font-display text-lg font-extrabold leading-tight">Scan a new fighter</span>
              <span className="text-xs text-white/80">Draw it, snap it, fight</span>
            </Link>
          </li>
          {list.map((c) => (
            <li key={c.id}>
              <button
                onClick={() => onPick(c.id)}
                className={`w-full rounded-2xl bg-card p-3 text-left transition ${c.id === preferred ? "ring-2 ring-ink" : "ring-1 ring-line hover:ring-ink"}`}
              >
                <div className="aspect-square w-full rounded-xl bg-white">
                  <FighterAvatar fighter={c} />
                </div>
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
