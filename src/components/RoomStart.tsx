"use client";

import { Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ARENA_INFO, type ArenaId } from "@/game/arena";
import { newRoomCode, ROOM_CODE } from "@/game/protocol";
import { saveRoomMode } from "./roomMode";

// Create a room, or join one by code: on the home page and the Fight page.
export function RoomStart({ dark = false }: { dark?: boolean }) {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [arena, setArena] = useState<ArenaId | null>(null); // the host's pick for a new room
  const modes: { id: ArenaId | null; label: string; hint: string }[] = [
    { id: null, label: "Normal", hint: "best of 3" },
    { id: "inferno", label: ARENA_INFO.inferno.short, hint: "5 min, volcano" },
  ];
  const valid = ROOM_CODE.test(code.trim().toUpperCase());
  return (
    <div className="grid gap-2">
      <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Fight mode">
        {modes.map((m) => (
          <button
            key={m.label}
            type="button"
            role="radio"
            aria-checked={arena === m.id}
            onClick={() => setArena(m.id)}
            className={`press rounded-xl px-3 py-2 text-left ring-1 ${arena === m.id ? (dark ? "bg-white text-ink ring-white" : "bg-ink text-white ring-ink") : dark ? "bg-white/10 text-white ring-white/20" : "bg-paper ring-line"}`}
          >
            <span className="block font-display text-sm font-extrabold leading-tight">{m.label}</span>
            <span className={`block text-xs ${arena === m.id ? "opacity-70" : "text-muted"}`}>{m.hint}</span>
          </button>
        ))}
      </div>
      <button
        onClick={() => {
          const room = newRoomCode();
          saveRoomMode(room, arena);
          router.push(`/play/${room}`);
        }}
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
          className={`min-w-0 flex-1 border-[3px] px-4 py-3 font-display text-lg tracking-widest outline-none placeholder:font-sans placeholder:text-base placeholder:font-semibold placeholder:tracking-normal focus:shadow-[3px_3px_0_var(--gold)] ${
            dark ? "border-white/40 bg-white/10 text-white placeholder:text-white/50" : "border-ink bg-white placeholder:text-muted"
          }`}
        />
        <button disabled={!valid} className={`press border-[3px] border-ink px-5 py-3 font-display text-lg disabled:opacity-40 ${dark ? "bg-white text-ink" : "bg-ink text-gold"}`}>
          Join
        </button>
      </form>
    </div>
  );
}
