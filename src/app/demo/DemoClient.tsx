"use client";

import { Repeat } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { CpuFight } from "@/app/play/cpu/CpuClient";
import type { Level } from "@/game/cpu";
import { SAMPLE_FIGHTERS } from "@/game/samples";

// One-click sample fight: no login, no upload. You play the first sample vs the computer.
export function DemoClient() {
  const router = useRouter();
  const [level, setLevel] = useState<Level>("easy");
  const [swap, setSwap] = useState(false);
  const [round, setRound] = useState(0);
  const [me, cpu] = swap ? [SAMPLE_FIGHTERS[1], SAMPLE_FIGHTERS[0]] : SAMPLE_FIGHTERS;

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-card p-3 card-edge">
        <p className="text-sm">
          <span className="font-semibold">Sample fight:</span> you&apos;re <span className="font-semibold">{me.name}</span> vs the computer as{" "}
          <span className="font-semibold">{cpu.name}</span>.
        </p>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          {(["easy", "normal", "hard"] as Level[]).map((l) => (
            <button
              key={l}
              onClick={() => {
                setLevel(l);
                setRound((r) => r + 1);
              }}
              className={`rounded-full px-3 py-1.5 font-semibold capitalize ring-1 ${level === l ? "bg-ink text-white ring-ink" : "ring-line hover:ring-ink"}`}
            >
              {l}
            </button>
          ))}
          <button
            onClick={() => {
              setSwap((s) => !s);
              setRound((r) => r + 1);
            }}
            className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 font-semibold ring-1 ring-line hover:ring-ink"
          >
            <Repeat className="size-4" /> Swap fighters
          </button>
        </div>
      </div>

      <CpuFight key={`${round}-${swap}-${level}`} me={me} cpu={cpu} level={level} onExit={() => router.push("/")} exitLabel="← Back home" />

      <p className="text-center text-sm text-muted">
        Liked it?{" "}
        <Link href="/signup?next=/create" className="font-semibold text-hit underline-offset-2 hover:underline">
          Draw your own fighter
        </Link>{" "}
        and fight your friends.
      </p>
    </div>
  );
}
