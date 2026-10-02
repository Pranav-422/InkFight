"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { newRoomCode } from "@/game/protocol";

export function FightButtons({ fighterId }: { fighterId: string }) {
  const router = useRouter();
  return (
    <div className="flex flex-wrap gap-2">
      <button
        onClick={() => router.push(`/play/${newRoomCode()}?fighter=${fighterId}`)}
        className="rounded-xl bg-hit px-5 py-3 font-semibold text-white hover:brightness-110"
      >
        Create a room with this fighter
      </button>
      <Link href="/play" className="rounded-xl bg-card px-5 py-3 font-semibold ring-1 ring-line hover:ring-ink">
        Join with a code
      </Link>
    </div>
  );
}
