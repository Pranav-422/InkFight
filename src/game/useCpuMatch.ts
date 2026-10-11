"use client";

// A match against the computer, entirely in this browser. Exposes the same shape
// as useGameRoom so the same canvas + controls render it.

import { useCallback, useEffect, useRef, useState } from "react";
import { cpuThink, newBrain, type Level } from "./cpu";
import type { Lobby, PublicFighter } from "./protocol";
import { createMatch, EMPTY_INPUT, snapshot, step, TICK_HZ, type Input, type Match, type Snapshot } from "./sim";
import type { SnapBuffer } from "./useGameRoom";

const TICK_MS = 1000 / TICK_HZ;

export function useCpuMatch(me: PublicFighter, cpu: PublicFighter, level: Level) {
  const snaps = useRef<SnapBuffer>({ prev: null, cur: null, at: 0 });
  const myInput = useRef<Input>({ ...EMPTY_INPUT });
  const [round, setRound] = useState(0); // bump to (re)start
  const [over, setOver] = useState<Snapshot | null>(null);

  useEffect(() => {
    const cpuInput: Input = { ...EMPTY_INPUT };
    const brain = newBrain(level);
    const m: Match = createMatch({ ...me }, { ...cpu }, [myInput.current, cpuInput]);
    snaps.current = { prev: null, cur: null, at: 0 };
    let last = performance.now();
    let acc = 0;
    let tick = 0;
    const loop = setInterval(() => {
      const now = performance.now();
      acc = Math.min(acc + now - last, 250);
      last = now;
      while (acc >= TICK_MS) {
        acc -= TICK_MS;
        cpuThink(m, 1, brain, cpuInput);
        step(m, [myInput.current, cpuInput]);
        tick++;
        if (tick % 2 === 0 || m.phase === "matchEnd") {
          const s = snapshot(m);
          snaps.current = { prev: snaps.current.cur, cur: s, at: performance.now() };
          if (m.phase === "matchEnd") {
            clearInterval(loop);
            setOver(s);
            return;
          }
        }
      }
    }, 4);
    return () => clearInterval(loop);
  }, [me, cpu, level, round]);

  const lobby: Lobby = {
    code: "CPU",
    you: 0,
    status: over ? "over" : "playing",
    players: [
      { ...me, ready: true, rematch: false },
      { ...cpu, ready: true, rematch: false },
    ],
  };

  const sendInput = useCallback((i: Input) => {
    myInput.current = i;
  }, []);
  const rematch = useCallback(() => {
    setOver(null);
    setRound((r) => r + 1);
  }, []);

  return { lobby, snaps, matchOver: over, sendInput, rematch };
}
