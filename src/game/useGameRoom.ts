"use client";

// Peer-to-peer rooms. Vercel can't hold WebSockets, so the server only relays the
// WebRTC offer/answer (via /api/rooms); after that the two browsers talk directly.
// The room creator's browser is the host: it runs the authoritative simulation
// and streams snapshots to the guest, exactly like a game server would.

import { useCallback, useEffect, useRef, useState } from "react";
import type { ClientMsg, HostMsg, Lobby, LobbyPlayer, PublicFighter } from "./protocol";
import { createMatch, EMPTY_INPUT, snapshot, step, TICK_HZ, type Input, type Match, type Snapshot } from "./sim";

export type { Lobby };
export type SnapBuffer = { prev: Snapshot | null; cur: Snapshot | null; at: number };

const SNAPSHOT_EVERY = 2; // 30/s
const TICK_MS = 1000 / TICK_HZ;
const POLL_MS = 1200;
const CONNECT_TIMEOUT_MS = 20000;

const ICE_SERVERS: RTCIceServer[] = (() => {
  try {
    const custom = process.env.NEXT_PUBLIC_ICE_SERVERS;
    if (custom) return JSON.parse(custom) as RTCIceServer[];
  } catch {}
  return [{ urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302", "stun:stun.cloudflare.com:3478"] }];
})();

type RoomInfo = {
  exists: boolean;
  you?: string; // the logged-in user, to notice an account switch in another tab
  isHost?: boolean;
  full?: boolean;
  offer?: string;
  answer?: string | null;
  hostFighter?: PublicFighter | null;
  guestFighter?: PublicFighter | null;
  version?: number;
  error?: string;
};

async function api<T>(url: string, init?: RequestInit): Promise<T & { error?: string; status: number }> {
  const res = await fetch(url, { ...init, headers: { "Content-Type": "application/json" }, cache: "no-store" });
  const data = await res.json().catch(() => ({}));
  return { ...data, status: res.status };
}

// Non-trickle ICE: wait (briefly) for candidates so one offer/answer round-trip is enough.
function gatherIce(pc: RTCPeerConnection, ms = 3000): Promise<void> {
  if (pc.iceGatheringState === "complete") return Promise.resolve();
  return new Promise((resolve) => {
    const done = () => {
      pc.removeEventListener("icegatheringstatechange", check);
      clearTimeout(t);
      resolve();
    };
    const check = () => pc.iceGatheringState === "complete" && done();
    const t = setTimeout(done, ms);
    pc.addEventListener("icegatheringstatechange", check);
  });
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const SWITCHED = "You logged into a different account in another tab, and this tab now uses it too. Reload the page. To play against yourself, open the second account in an incognito window or another browser.";
const OTHER_TAB = "This room is already open in another tab of this browser. To play against yourself, open the second account in an incognito window or another browser.";

// Same-browser tabs share one login, so two tabs can't be two different players.
// Ask other tabs whether one of them already holds this room.
function roomOpenInAnotherTab(code: string): Promise<boolean> {
  if (typeof BroadcastChannel === "undefined") return Promise.resolve(false);
  return new Promise((resolve) => {
    const ch = new BroadcastChannel(`inkfight-room-${code}`);
    const t = setTimeout(() => {
      ch.close();
      resolve(false);
    }, 400);
    ch.onmessage = (e) => {
      if (e.data === "here") {
        clearTimeout(t);
        ch.close();
        resolve(true);
      }
    };
    ch.postMessage("who");
  });
}

function claimRoomTab(code: string): () => void {
  if (typeof BroadcastChannel === "undefined") return () => {};
  const ch = new BroadcastChannel(`inkfight-room-${code}`);
  ch.onmessage = (e) => e.data === "who" && ch.postMessage("here");
  return () => ch.close();
}

export function useGameRoom(code: string, fighterId: string | null, userId?: string) {
  const snaps = useRef<SnapBuffer>({ prev: null, cur: null, at: 0 });
  const [lobby, setLobby] = useState<Lobby | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState("Connecting…");
  const [matchOver, setMatchOver] = useState<Snapshot | null>(null);
  const [attempt, setAttempt] = useState(0);
  // Set by the active role (host or guest) so the UI can send without knowing which.
  const sendRef = useRef<(m: ClientMsg) => void>(() => {});

  useEffect(() => {
    if (!fighterId) return;
    let cancelled = false;
    const cleanups: (() => void)[] = [];
    const pushSnap = (s: Snapshot) => {
      const b = snaps.current;
      snaps.current = { prev: b.cur, cur: s, at: performance.now() };
      if (s.phase === "matchEnd") setMatchOver(s);
    };

    async function run() {
      if (await roomOpenInAnotherTab(code)) return setError(OTHER_TAB);
      if (cancelled) return;
      cleanups.push(claimRoomTab(code));
      const info = await api<RoomInfo>(`/api/rooms/${code}`);
      if (cancelled) return;
      if (info.status === 401) return setError("You're logged out. Log in again to play.");
      if (userId && info.you && info.you !== userId) return setError(SWITCHED);
      if (info.exists && info.full) return setError("Room's full. Two's a fight, three's a crowd.");
      if (!info.exists || info.isHost) return host();
      // We already answered earlier (page refresh): wait for the host to reopen the room.
      let fresh = info;
      for (let i = 0; fresh.answer && i < 40 && !cancelled; i++) {
        setStatus("Reconnecting to the host…");
        await sleep(POLL_MS);
        fresh = await api<RoomInfo>(`/api/rooms/${code}`);
      }
      if (cancelled) return;
      if (fresh.answer) return setError("The host hasn't reopened the room yet. Try again in a moment.");
      if (!fresh.exists) return host();
      await guest(fresh);
    }

    // ---------------------------------------------------------------- host
    async function host() {
      const me = await api<{ fighters?: never } & PublicFighter>(`/api/characters/${fighterId}`);
      if (cancelled) return;
      if (me.status !== 200) return setError("That fighter doesn't exist. Draw a new one?");
      const myFighter: PublicFighter = {
        id: me.id, name: me.name, class: me.class, imageUrl: me.imageUrl, specialMove: me.specialMove,
        hp: me.hp, atk: me.atk, def: me.def, spd: me.spd,
      };

      type Seat = { fighter: PublicFighter; input: Input; ready: boolean; rematch: boolean };
      const seats: [Seat, Seat | null] = [{ fighter: myFighter, input: { ...EMPTY_INPUT }, ready: false, rematch: false }, null];
      let status: Lobby["status"] = "lobby";
      let match: Match | null = null;
      let loop: ReturnType<typeof setInterval> | null = null;
      let ctl: RTCDataChannel | null = null;
      let game: RTCDataChannel | null = null;
      let pc: RTCPeerConnection | null = null;
      let generation = 0;

      const lp = (s: Seat | null): LobbyPlayer | null => (s ? { ...s.fighter, ready: s.ready, rematch: s.rematch } : null);
      const broadcast = (notice?: string) => {
        const players: Lobby["players"] = [lp(seats[0]), lp(seats[1])];
        setLobby({ code, you: 0, players, status, notice });
        if (ctl?.readyState === "open") ctl.send(JSON.stringify({ t: "lobby", lobby: { code, you: 1, players, status, notice } } satisfies HostMsg));
      };
      const stopLoop = () => {
        if (loop) clearInterval(loop);
        loop = null;
      };

      const startMatch = () => {
        const guestSeat = seats[1];
        if (!guestSeat) return;
        status = "playing";
        match = createMatch({ ...seats[0].fighter }, { ...guestSeat.fighter }, [seats[0].input, guestSeat.input]);
        seats[0].rematch = guestSeat.rematch = false;
        setMatchOver(null);
        broadcast();
        const matchId = Math.random().toString(36).slice(2, 10);
        let last = performance.now();
        let acc = 0;
        let tick = 0;
        stopLoop();
        loop = setInterval(() => {
          const now = performance.now();
          acc = Math.min(acc + now - last, 250);
          last = now;
          const m = match;
          const g = seats[1];
          if (!m || !g) return stopLoop();
          while (acc >= TICK_MS) {
            acc -= TICK_MS;
            step(m, [seats[0].input, g.input]);
            tick++;
            if (tick % SNAPSHOT_EVERY === 0 || m.phase === "matchEnd") {
              const s = snapshot(m);
              pushSnap(s);
              if (game?.readyState === "open") game.send(JSON.stringify({ t: "snap", s } satisfies HostMsg));
              // The final frame also goes over the reliable channel so the guest surely sees the result.
              if (m.phase === "matchEnd" && ctl?.readyState === "open") ctl.send(JSON.stringify({ t: "snap", s } satisfies HostMsg));
            }
            if (m.phase === "matchEnd") {
              stopLoop();
              status = "over";
              seats.forEach((p) => p && (p.ready = false));
              broadcast();
              api(`/api/battles`, {
                method: "POST",
                body: JSON.stringify({ roomCode: code, matchId, winnerSlot: m.matchWinner, wins: m.wins, damage: m.damage, rounds: m.round }),
              }).catch(() => {});
              return;
            }
          }
        }, 4);
      };

      const onGuestMessage = (raw: string) => {
        let msg: ClientMsg;
        try {
          msg = JSON.parse(raw);
        } catch {
          return;
        }
        const g = seats[1];
        if (!g) return;
        if (msg.t === "input") g.input = sanitize(msg.input);
        else if (msg.t === "ready" && status === "lobby") {
          g.ready = !!msg.ready;
          if (seats[0].ready && g.ready) startMatch();
          else broadcast();
        } else if (msg.t === "rematch" && status === "over") {
          g.rematch = true;
          if (seats[0].rematch) startMatch();
          else broadcast(`${g.fighter.name} wants a rematch!`);
        }
      };

      // Host's own actions apply locally.
      sendRef.current = (msg) => {
        if (msg.t === "input") seats[0].input = msg.input;
        else if (msg.t === "ready" && status === "lobby") {
          seats[0].ready = msg.ready;
          if (seats[0].ready && seats[1]?.ready) startMatch();
          else broadcast();
        } else if (msg.t === "rematch" && status === "over") {
          seats[0].rematch = true;
          if (seats[1]?.rematch) startMatch();
          else broadcast(`${seats[0].fighter.name} wants a rematch!`);
        }
      };

      // (Re)open the room for a guest. Called at start and whenever the guest drops.
      async function open(notice?: string) {
        const gen = ++generation;
        pc?.close();
        stopLoop();
        match = null;
        status = "lobby";
        seats[1] = null;
        seats[0].ready = seats[0].rematch = false;
        snaps.current = { prev: null, cur: null, at: 0 };
        broadcast(notice);

        pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
        const thisPc = pc;
        ctl = pc.createDataChannel("ctl", { ordered: true });
        game = pc.createDataChannel("game", { ordered: false, maxRetransmits: 0 });
        ctl.onmessage = (e) => onGuestMessage(e.data);
        game.onmessage = (e) => onGuestMessage(e.data);
        ctl.onopen = () => {
          if (gen !== generation) return;
          setStatus("Connected");
          broadcast(`${seats[1]?.fighter.name ?? "A challenger"} has entered the arena!`);
        };
        thisPc.onconnectionstatechange = () => {
          if (gen !== generation || cancelled) return;
          const st = thisPc.connectionState;
          if (st === "failed" || st === "closed") {
            void open(seats[1] ? `${seats[1].fighter.name} disconnected. Waiting for a new challenger…` : undefined);
          } else if (st === "disconnected") {
            // Often recovers on its own; give it a few seconds.
            setTimeout(() => gen === generation && thisPc.connectionState === "disconnected" && void open(`Lost ${seats[1]?.fighter.name ?? "the opponent"}. Waiting…`), 5000);
          }
        };

        await thisPc.setLocalDescription(await thisPc.createOffer());
        await gatherIce(thisPc);
        if (cancelled || gen !== generation) return;
        const res = await api(`/api/rooms/${code}`, {
          method: "POST",
          body: JSON.stringify({ fighterId, offer: thisPc.localDescription!.sdp }),
        });
        if (res.status === 409) {
          // Lost a race for this code: someone else is hosting, so join them instead.
          generation++;
          thisPc.close();
          const info = await api<RoomInfo>(`/api/rooms/${code}`);
          if (!cancelled) await guest(info);
          return;
        }
        if (res.status !== 200) return setError(res.error ?? "Couldn't open the room.");
        setStatus("Waiting for a challenger…");

        // Poll for the guest's answer.
        while (!cancelled && gen === generation && thisPc.signalingState === "have-local-offer") {
          await sleep(POLL_MS);
          const info = await api<RoomInfo>(`/api/rooms/${code}`);
          if (cancelled || gen !== generation) return;
          if (userId && info.you && info.you !== userId) {
            generation++;
            thisPc.close();
            return setError(SWITCHED);
          }
          if (info.answer && info.guestFighter) {
            seats[1] = { fighter: info.guestFighter, input: { ...EMPTY_INPUT }, ready: false, rematch: false };
            broadcast(`${info.guestFighter.name} is connecting…`);
            setStatus(`Connecting to ${info.guestFighter.name}…`);
            await thisPc.setRemoteDescription({ type: "answer", sdp: info.answer });
            setTimeout(() => {
              if (gen === generation && ctl?.readyState !== "open") {
                void open("Couldn't connect to your friend directly (their network may block peer-to-peer). Ask them to try again, ideally on Wi-Fi.");
              }
            }, CONNECT_TIMEOUT_MS);
          }
        }
      }

      cleanups.push(() => {
        generation++;
        stopLoop();
        pc?.close();
      });
      await open();
    }

    // --------------------------------------------------------------- guest
    async function guest(info: RoomInfo) {
      if (!info.offer) return setError("That room isn't open yet. Ask your friend to create it again.");
      const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
      let ctl: RTCDataChannel | null = null;
      let game: RTCDataChannel | null = null;
      cleanups.push(() => pc.close());

      const onHostMessage = (raw: string) => {
        const msg = JSON.parse(raw) as HostMsg;
        if (msg.t === "snap") pushSnap(msg.s);
        else if (msg.t === "lobby") {
          setLobby(msg.lobby);
          if (msg.lobby.status === "playing") setMatchOver(null);
          if (msg.lobby.status === "lobby") snaps.current = { prev: null, cur: null, at: 0 };
        }
      };
      pc.ondatachannel = (e) => {
        if (e.channel.label === "ctl") {
          ctl = e.channel;
          ctl.onopen = () => setStatus("Connected");
        } else game = e.channel;
        e.channel.onmessage = (ev) => onHostMessage(ev.data);
      };
      sendRef.current = (msg) => {
        const ch = msg.t === "input" ? game : ctl;
        if (ch?.readyState === "open") ch.send(JSON.stringify(msg));
      };
      pc.onconnectionstatechange = () => {
        if (cancelled) return;
        if (pc.connectionState === "failed" || pc.connectionState === "closed") {
          setError("Lost the connection to the host.");
        }
      };

      setStatus(`Joining ${info.hostFighter?.name ?? "the host"}…`);
      await pc.setRemoteDescription({ type: "offer", sdp: info.offer });
      await pc.setLocalDescription(await pc.createAnswer());
      await gatherIce(pc);
      if (cancelled) return;
      const res = await api<{ retry?: boolean }>(`/api/rooms/${code}/answer`, {
        method: "POST",
        body: JSON.stringify({ fighterId, answer: pc.localDescription!.sdp, version: info.version }),
      });
      if (res.retry) {
        pc.close();
        await sleep(800);
        if (!cancelled) setAttempt((a) => a + 1);
        return;
      }
      if (res.status !== 200) return setError(res.error ?? "Couldn't join the room.");
      setStatus("Connecting directly to your friend…");
      setTimeout(() => {
        if (!cancelled && ctl?.readyState !== "open") {
          setError("Couldn't connect to your friend directly. One of your networks may block peer-to-peer — try both on the same Wi-Fi.");
        }
      }, CONNECT_TIMEOUT_MS);
    }

    run().catch((err) => {
      console.error("[room]", err);
      if (!cancelled) setError("Something broke while connecting. Refresh to try again.");
    });
    return () => {
      cancelled = true;
      cleanups.forEach((f) => f());
      sendRef.current = () => {};
    };
  }, [code, fighterId, attempt, userId]);

  const send = useCallback((msg: ClientMsg) => sendRef.current(msg), []);
  const sendInput = useCallback((input: Input) => sendRef.current({ t: "input", input }), []);
  const retry = useCallback(() => {
    setError(null);
    setLobby(null);
    setAttempt((a) => a + 1);
  }, []);

  return { lobby, error, status, snaps, matchOver, send, sendInput, retry };
}

function sanitize(i: Partial<Input> | undefined): Input {
  const n = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);
  return { left: !!i?.left, right: !!i?.right, block: !!i?.block, jump: n(i?.jump), attack: n(i?.attack), special: n(i?.special) };
}
