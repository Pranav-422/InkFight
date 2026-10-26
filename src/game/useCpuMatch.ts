"use client";

// A match against the computer, entirely in this browser. Exposes the same shape
// as useGameRoom so the same canvas + controls render it.

import { useCallback, useEffect, useRef, useState } from "react";
import type { ArenaId } from "./arena";
import { cpuThink, newBrain, type Level } from "./cpu";
import { bossKnobs, bossPersona, type BossRun } from "./dungeon";
import type { Lobby, PublicFighter } from "./protocol";
import { createMatch, EMPTY_INPUT, snapshot, step, TICK_HZ, type Input, type Match, type Snapshot } from "./sim";
import type { SnapBuffer } from "./useGameRoom";

const TICK_MS = 1000 / TICK_HZ;

// boss: a dungeon fight: the boss's passive and second form go to the sim, its AI knobs (per form) over the level's (see src/game/dungeon.ts).
// arena: an arena fight (src/game/arena.ts) instead of the best-of-3.
export function useCpuMatch(me: PublicFighter, cpu: PublicFighter, level: Level, boss?: BossRun, arena?: ArenaId) {
  const snaps = useRef<SnapBuffer>({ prev: null, cur: null, at: 0 });
  const myInput = useRef<Input>({ ...EMPTY_INPUT });
  const [round, setRound] = useState(0); // bump to (re)start
  const [over, setOver] = useState<Snapshot | null>(null);

  useEffect(() => {
    const cpuInput: Input = { ...EMPTY_INPUT };
    const brain = newBrain(level, boss?.cpu, boss?.persona);
    const m: Match = createMatch({ ...me }, { ...cpu }, [myInput.current, cpuInput], { ...(boss && { boss: boss.spec }), ...(arena && { arena, seed: Math.floor(Math.random() * 4294967296) }) }); // (an arena fight rolls its own luck: the seed)
    snaps.current = { prev: null, cur: null, at: 0 };
    let last = performance.now();
    let acc = 0;
    const loop = setInterval(() => {
      const now = performance.now();
      acc = Math.min(acc + now - last, 250);
      last = now;
      while (acc >= TICK_MS) {
        acc -= TICK_MS;
        if (boss) {
          brain.knobs = bossKnobs(boss, m.boss?.phase);
          brain.persona = bossPersona(boss, m.boss?.phase);
        }
        cpuThink(m, 1, brain, cpuInput);
        step(m, [myInput.current, cpuInput]);
        const s = snapshot(m);
        snaps.current = { prev: snaps.current.cur, cur: s, at: performance.now() };
        if (m.phase === "matchEnd") {
          clearInterval(loop);
          setOver(s);
          return;
        }
      }
    }, 4);
    return () => clearInterval(loop);
  }, [me, cpu, level, boss, arena, round]); // boss: pass bossRun(floor) (a cached object), or the match restarts every render

  const lobby: Lobby = {
    code: "CPU",
    you: 0,
    ...(arena && { mode: arena }),
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
