"use client";

import { Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { newRoomCode, ROOM_CODE } from "@/game/protocol";

// Create a room, or join one by code: on the home page and the Fight page.
export function RoomStart({ dark = false }: { dark?: boolean }) {
  const router = useRouter();
  const [code, setCode] = useState("");
  const valid = ROOM_CODE.test(code.trim().toUpperCase());
  return (
    <div className="grid gap-2">
      <button
        onClick={() => router.push(`/play/${newRoomCode()}`)}
        className="press sticker flex items-center justify-center gap-2 rounded-xl bg-hit px-5 py-3.5 font-display text-lg font-extrabold text-white"
      >
        <Plus className="size-5" strokeWidth={2.6} /> Create room
      </button>
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (valid) router.push(`/play/${code.trim().toUpperCase()}`);
        }}
      >
        <input
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          placeholder="Friend's code"
          aria-label="Room code"
          maxLength={8}
          className={`min-w-0 flex-1 rounded-xl px-4 py-3 font-display font-extrabold tracking-widest outline-none ring-1 placeholder:font-sans placeholder:font-normal placeholder:tracking-normal focus:ring-2 ${
            dark ? "bg-white/10 text-white ring-white/20 placeholder:text-white/50 focus:ring-white" : "bg-paper ring-line placeholder:text-muted focus:ring-ink"
          }`}
        />
        <button disabled={!valid} className={`rounded-xl px-5 py-3 font-semibold disabled:opacity-40 ${dark ? "bg-white text-ink" : "bg-ink text-white"}`}>
          Join
        </button>
      </form>
    </div>
  );
}
