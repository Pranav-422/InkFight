"use client";

import { FlipVertical2, Loader2, RotateCcw, RotateCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

// Photographed the drawing sideways? Stand it up so the puppet's arms and legs bend the right way.
// Item held by the wrong end? Swap its grip and tip.
export function RotateControl({ id, rotation, flipItem }: { id: string; rotation: number; flipItem: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function patch(body: { rotation?: number; flipItem?: boolean }) {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/characters/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    if (!res.ok) setError((await res.json().catch(() => ({}))).error ?? "Couldn't change it.");
    router.refresh();
    setBusy(false);
  }

  const btn = "inline-flex items-center gap-1.5 rounded-lg bg-card px-3 py-2 text-sm font-semibold ring-1 ring-line hover:ring-ink disabled:opacity-50";
  return (
    <div className="mt-3 rounded-2xl bg-card p-3 text-sm card-edge">
      <p className="font-semibold">Something look wrong?</p>
      <p className="text-xs text-muted">Lying on its side: turn it so the head is at the top. Item upside down: flip it.</p>
      <div className="mt-2 flex items-center gap-2">
        <button disabled={busy} onClick={() => patch({ rotation: (rotation + 270) % 360 })} className={btn}>
          <RotateCcw className="size-4" /> Left
        </button>
        <button disabled={busy} onClick={() => patch({ rotation: (rotation + 90) % 360 })} className={btn}>
          <RotateCw className="size-4" /> Right
        </button>
        <button disabled={busy} onClick={() => patch({ flipItem: !flipItem })} className={btn} title="Holding the sword by its tip? Swap the ends">
          <FlipVertical2 className="size-4" /> {flipItem ? "Unflip item" : "Flip item"}
        </button>
        {busy && <Loader2 className="size-4 animate-spin text-muted" />}
      </div>
      {error && <p className="mt-2 text-xs text-hit">{error}</p>}
    </div>
  );
}
