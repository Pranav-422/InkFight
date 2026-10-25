"use client";

import { useSyncExternalStore } from "react";
import { getReduceFlashes, setReduceFlashes, subscribeReduceFlashes } from "@/game/flashes";

// The accessibility switch for impact frames and screen flashes (see src/game/flashes.ts).
export function ReduceFlashes({ className = "" }: { className?: string }) {
  const on = useSyncExternalStore(subscribeReduceFlashes, getReduceFlashes, () => false);
  return (
    <label className={`flex cursor-pointer items-center gap-2 ${className}`}>
      <input type="checkbox" checked={on} onChange={(e) => setReduceFlashes(e.target.checked)} />
      Reduce flashes
    </label>
  );
}
