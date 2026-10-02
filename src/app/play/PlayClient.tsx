"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { newRoomCode, ROOM_CODE } from "@/game/protocol";

export function PlayClient() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const valid = ROOM_CODE.test(code.trim().toUpperCase());

  return (
    <div className="mx-auto grid max-w-3xl gap-6 sm:grid-cols-2">
      <div className="sm:col-span-2">
        <h1 className="font-display text-4xl font-extrabold tracking-tight">Fight a friend</h1>
        <p className="mt-1 text-muted">
          Each of you plays on your own device, with your own drawing. The fighter&apos;s power comes from how you drew it.
        </p>
      </div>

      <section className="rounded-2xl bg-card p-5 ring-1 ring-line">
        <h2 className="font-display text-xl font-extrabold">Start a room</h2>
        <p className="mt-1 text-sm text-muted">You&apos;ll get a link to send your friend.</p>
        <button
          onClick={() => router.push(`/play/${newRoomCode()}`)}
          className="mt-4 w-full rounded-xl bg-hit px-5 py-3 font-semibold text-white hover:brightness-110"
        >
          Create room
        </button>
      </section>

      <section className="rounded-2xl bg-card p-5 ring-1 ring-line">
        <h2 className="font-display text-xl font-extrabold">Join a room</h2>
        <p className="mt-1 text-sm text-muted">Got a code from a friend? Type it in.</p>
        <form
          className="mt-4 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (valid) router.push(`/play/${code.trim().toUpperCase()}`);
          }}
        >
          <input
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="ABCDE"
            maxLength={8}
            className="min-w-0 flex-1 rounded-xl bg-paper px-4 py-3 font-display text-lg font-extrabold tracking-widest ring-1 ring-line outline-none focus:ring-2 focus:ring-ink"
          />
          <button disabled={!valid} className="rounded-xl bg-ink px-5 py-3 font-semibold text-white disabled:opacity-40">
            Join
          </button>
        </form>
      </section>
    </div>
  );
}
