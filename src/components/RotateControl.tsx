"use client";

import { Loader2, RotateCcw, RotateCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

// Photographed the drawing sideways? Stand it up so the puppet's arms and legs bend the right way.
export function RotateControl({ id, rotation }: { id: string; rotation: number }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function turn(delta: number) {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/characters/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rotation: (((rotation + delta) % 360) + 360) % 360 }),
    });
    if (!res.ok) setError((await res.json().catch(() => ({}))).error ?? "Couldn't rotate it.");
    router.refresh();
    setBusy(false);
  }

  const btn = "inline-flex items-center gap-1.5 rounded-lg bg-card px-3 py-2 text-sm font-semibold ring-1 ring-line hover:ring-ink disabled:opacity-50";
  return (
    <div className="mt-3 rounded-2xl bg-card p-3 text-sm ring-1 ring-line">
      <p className="font-semibold">Is your fighter lying on its side?</p>
      <p className="text-xs text-muted">Stand it up (head at the top) so its arms and legs move the right way in fights.</p>
      <div className="mt-2 flex items-center gap-2">
        <button disabled={busy} onClick={() => turn(-90)} className={btn}>
          <RotateCcw className="size-4" /> Left
        </button>
        <button disabled={busy} onClick={() => turn(90)} className={btn}>
          <RotateCw className="size-4" /> Right
        </button>
        {busy && <Loader2 className="size-4 animate-spin text-muted" />}
      </div>
      {error && <p className="mt-2 text-xs text-hit">{error}</p>}
    </div>
  );
}
