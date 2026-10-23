"use client";

// Split-screen test match: a real online room (signaling + WebRTC) with both
// players in this one tab. You host on the left; a demo account joins on the right.

import { FlaskConical, Loader2, Trophy } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { ClassBadge } from "@/components/ClassBadge";
import { FighterAvatar } from "@/components/FighterAvatar";
import { GameCanvas } from "@/components/GameCanvas";
import { newRoomCode, type ClientMsg, type PublicFighter } from "@/game/protocol";
import { useGameRoom, type RoomOptions } from "@/game/useGameRoom";

type Opponent = { token: string; userId: string; name: string; fighter: PublicFighter };
type Send = (m: ClientMsg) => void;

export function TestClient({ userId, mine }: { userId: string; mine: PublicFighter[] }) {
  const [meId, setMeId] = useState(mine[0]?.id ?? null);
  const [run, setRun] = useState<{ code: string; opp: Opponent } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [hostReady, setHostReady] = useState(false);
  const sends = useRef<[Send | null, Send | null]>([null, null]);

  if (mine.length === 0) {
    return (
      <div className="mx-auto max-w-md rounded-2xl bg-card p-6 text-center ring-1 ring-line">
        <p className="font-display text-xl font-extrabold">You need a fighter first</p>
        <Link href="/create?next=/play/test" className="mt-4 inline-block rounded-xl bg-hit px-5 py-3 font-semibold text-white">
          Scan a fighter
        </Link>
      </div>
    );
  }

  async function start() {
    setBusy(true);
    setError(null);
    const res = await fetch("/api/test-session", { method: "POST" });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return setError(data.error ?? "Couldn't start the test match.");
    setHostReady(false);
    setRun({ code: newRoomCode(), opp: data });
  }

  if (!run || !meId) {
    return (
      <div className="grid gap-6">
        <div>
          <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-widest text-muted">
            <FlaskConical className="size-4" /> Test match
          </p>
          <h1 className="font-display text-3xl font-extrabold">Play both sides on one screen</h1>
          <p className="max-w-2xl text-sm text-muted">
            A real online room, with both logins at once. You host on the left. A demo account joins on the right with its starter.
            Left keys: <b>A/D</b> move, <b>W</b> jump, <b>S</b> block, <b>J</b> punch, <b>K</b> kick, <b>L</b> special. Right keys:{" "}
            <b>← →</b> move, <b>↑</b> jump, <b>↓</b> block, <b>1</b> punch, <b>2</b> kick, <b>3</b> special. Test matches don&apos;t
            count on the leaderboard.
          </p>
        </div>
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
          {mine.map((f) => (
            <li key={f.id}>
              <button
                onClick={() => setMeId(f.id)}
                className={`w-full rounded-2xl bg-card p-2 text-left ${meId === f.id ? "ring-2 ring-hit" : "ring-1 ring-line hover:ring-ink"}`}
              >
                <div className="aspect-square w-full rounded-xl bg-white">
                  <FighterAvatar fighter={f} />
                </div>
                <p className="mt-2 truncate px-1 text-sm font-semibold">{f.name}</p>
                <div className="px-1 pb-1">
                  <ClassBadge cls={f.class} />
                </div>
              </button>
            </li>
          ))}
        </ul>
        <div>
          <button onClick={start} disabled={busy} className="rounded-xl bg-hit px-6 py-3 font-display text-lg font-extrabold text-white disabled:opacity-50">
            {busy ? "Starting…" : "Start test match"}
          </button>
          {error && <p className="mt-3 text-sm text-hit">{error}</p>}
        </div>
      </div>
    );
  }

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <p className="font-semibold">
          Test room <span className="font-display tracking-wider">{run.code}</span> · you vs {run.opp.name}
        </p>
        <div className="flex gap-3">
          <button onClick={() => sends.current.forEach((s) => s?.({ t: "rematch" }))} className="font-semibold text-hit hover:underline">
            Rematch
          </button>
          <button onClick={() => setRun(null)} className="text-muted hover:text-ink hover:underline">
            End test
          </button>
        </div>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Pane
          label="Player 1 · you (host)"
          code={run.code}
          fighterId={meId}
          userId={userId}
          opts={HOST_OPTS}
          keys="p1"
          onSend={(s) => (sends.current[0] = s)}
          onWaiting={() => setHostReady(true)}
        />
        {/* The guest joins only once the host has posted its offer, or it would host too. */}
        {hostReady ? (
          <Pane
            label={`Player 2 · ${run.opp.name}`}
            code={run.code}
            fighterId={run.opp.fighter.id}
            userId={run.opp.userId}
            opts={{ token: run.opp.token, sameTab: true, record: false }}
            keys="p2"
            onSend={(s) => (sends.current[1] = s)}
          />
        ) : (
          <p className="flex items-center justify-center gap-2 py-20 text-muted">
            <Loader2 className="size-4 animate-spin" /> Opening the room…
          </p>
        )}
      </div>
    </div>
  );
}

const HOST_OPTS: RoomOptions = { sameTab: true, record: false };

function Pane({
  label,
  code,
  fighterId,
  userId,
  opts,
  keys,
  onSend,
  onWaiting,
}: {
  label: string;
  code: string;
  fighterId: string;
  userId: string;
  opts: RoomOptions;
  keys: "p1" | "p2";
  onSend: (s: Send) => void;
  onWaiting?: () => void;
}) {
  const { lobby, error, status, snaps, matchOver, send, sendInput } = useGameRoom(code, fighterId, userId, opts);
  const [p0, p1] = lobby?.players ?? [null, null];
  const players = useMemo(() => (p0 && p1 ? ([p0, p1] as [typeof p0, typeof p1]) : null), [p0?.id, p1?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const me = lobby ? lobby.players[lobby.you] : null;

  useEffect(() => {
    onSend(send);
  }, [onSend, send]);
  useEffect(() => {
    if (status === "Waiting for a challenger…") onWaiting?.();
  }, [status, onWaiting]);
  // Both seats filled: ready up automatically, nobody needs to click twice.
  useEffect(() => {
    if (lobby?.status === "lobby" && players && me && !me.ready) send({ t: "ready", ready: true });
  }, [lobby?.status, players, me, send]);

  return (
    <section className="grid content-start gap-2">
      <p className="text-xs font-semibold uppercase tracking-widest text-muted">{label}</p>
      {error ? (
        <p className="rounded-xl bg-hit/10 p-4 text-sm text-hit">{error}</p>
      ) : players && lobby && lobby.status !== "lobby" ? (
        <div className="relative">
          <GameCanvas snaps={snaps} players={players} you={lobby.you} onInput={sendInput} keys={keys} controller={false} />
          {lobby.status === "over" && matchOver?.matchWinner != null && (
            <div className="absolute inset-x-0 top-[20%] mx-auto w-[min(90%,18rem)] rounded-2xl bg-ink p-4 text-center text-white">
              <Trophy className="mx-auto size-6 text-gold" />
              <p className="font-display text-xl font-extrabold">{matchOver.matchWinner === lobby.you ? "You win!" : "You lose"}</p>
              <p className="text-xs text-white/60">Rematch from the top bar</p>
            </div>
          )}
        </div>
      ) : (
        <p className="flex items-center justify-center gap-2 rounded-2xl bg-card py-20 text-sm text-muted ring-1 ring-line">
          <Loader2 className="size-4 animate-spin" /> {lobby?.notice ?? status}
        </p>
      )}
    </section>
  );
}
