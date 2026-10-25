"use client";

import { Zap } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

// The admin's own buff: your side deals 1.3× and takes 0.75× damage, in every fight you
// play (rooms and vs computer). Opponents see a BUFF tag, and these fights aren't recorded.
export function BuffToggle({ on }: { on: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  async function toggle() {
    setBusy(true);
    const res = await fetch("/api/admin/buff", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ on: !on }) });
    if (!res.ok) window.alert((await res.json().catch(() => ({}))).error ?? "Couldn't change it.");
    setBusy(false);
    router.refresh();
  }
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-2xl bg-card px-4 py-3 text-sm card-edge">
      <button
        onClick={toggle}
        disabled={busy}
        className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 font-semibold ring-1 disabled:opacity-50 ${on ? "bg-gold text-ink ring-gold" : "ring-line hover:ring-ink"}`}
      >
        <Zap className="size-4" /> Admin buff: {on ? "ON" : "OFF"}
      </button>
      <span className="text-muted">Your side deals 1.3× and takes 0.75× damage. Opponents see a BUFF tag; these fights aren&apos;t recorded.</span>
    </div>
  );
}
