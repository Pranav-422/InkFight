"use client";

import { Volume2, VolumeX } from "lucide-react";
import { useEffect, useSyncExternalStore } from "react";
import { getSoundOn, installUnlock, setSoundOn, subscribeSound } from "@/game/sound";

// The sound switch (see src/game/sound.ts). `SoundToggle` is the header button; `SoundSwitch` is the checkbox for the
// fight settings. Both also arm the first-gesture unlock, and both read the same stored choice.
const useSound = () => useSyncExternalStore(subscribeSound, getSoundOn, () => true);

export function SoundToggle() {
  const on = useSound();
  useEffect(() => installUnlock(), []);
  return (
    <button
      type="button"
      onClick={() => setSoundOn(!on)}
      title={on ? "Sound on: click to mute" : "Sound off: click to turn on"}
      aria-label={on ? "Mute sound" : "Turn sound on"}
      aria-pressed={on}
      className="rounded-full p-1.5 text-muted hover:bg-ink/5 hover:text-ink"
    >
      {on ? <Volume2 className="size-4" /> : <VolumeX className="size-4" />}
    </button>
  );
}

export function SoundSwitch({ className = "" }: { className?: string }) {
  const on = useSound();
  useEffect(() => installUnlock(), []);
  return (
    <label className={`flex cursor-pointer items-center gap-2 ${className}`}>
      <input type="checkbox" checked={on} onChange={(e) => setSoundOn(e.target.checked)} />
      Sound
    </label>
  );
}
