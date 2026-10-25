"use client";

import { Bot, Castle, ChevronRight, Clapperboard } from "lucide-react";
import Link from "next/link";
import { RoomStart } from "@/components/RoomStart";

export function PlayClient() {
  return (
    <div className="mx-auto grid max-w-3xl gap-6">
      <div>
        <h1 className="font-display text-4xl font-extrabold tracking-tight">Pick a fight</h1>
        <p className="mt-1 text-muted">Your drawing&apos;s power comes from how you drew it.</p>
      </div>

      <section className="sticker rounded-3xl bg-card p-5">
        <p className="text-xs font-bold uppercase tracking-widest text-hit">Online · 1 vs 1</p>
        <h2 className="mt-1 font-display text-2xl font-extrabold">Fight a friend</h2>
        <p className="mt-1 mb-4 text-sm text-muted">Each of you on your own device, with your own drawing. Start a room and send the link.</p>
        <RoomStart />
      </section>

      <section className="grid gap-3 sm:grid-cols-2">
        <Link href="/play/cpu" className="press rounded-2xl bg-card p-5 card-edge hover:ring-ink">
          <Bot className="size-6" />
          <p className="mt-3 flex items-center justify-between font-display text-xl font-extrabold">
            Vs computer <ChevronRight className="size-5 text-muted" />
          </p>
          <p className="text-sm text-muted">Practice against any drawing in the gallery. Easy, normal or hard.</p>
        </Link>
        <Link href="/play/dungeon" className="press rounded-2xl bg-ink p-5 text-white">
          <Castle className="size-6" />
          <p className="mt-3 flex items-center justify-between font-display text-xl font-extrabold">
            The Dungeon <ChevronRight className="size-5 text-white/60" />
          </p>
          <p className="text-sm text-white/70">Ten bosses, each with a trick. Beat them to unlock new specials.</p>
        </Link>
      </section>

      <Link href="/demo" className="flex items-center justify-center gap-2 text-sm font-semibold text-muted hover:text-ink">
        <Clapperboard className="size-4" /> Watch a sample fight
      </Link>
    </div>
  );
}
