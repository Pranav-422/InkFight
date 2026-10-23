"use client";

import { Bot, Eye, EyeOff, Swords } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { ClassBadge } from "@/components/ClassBadge";
import { FighterAvatar } from "@/components/FighterAvatar";
import { OwnerActions } from "@/components/OwnerActions";

export type AdminDesign = {
  id: string;
  name: string;
  imageUrl: string;
  class: string;
  style: string | null;
  specialKind: string | null;
  specialMove: string;
  pose: string | null;
  rotation: number;
  stats: string;
  owner: string;
  ownerEmail: string;
  ownerId: string | null;
  createdAt: string;
  source: string;
  cpu: boolean;
  hidden: boolean;
};

// Every design ever uploaded, newest first: what players draw, who drew it, and the
// controls: computer roster on/off, hide from public pages, rename, delete, fight.
export function AdminDesigns({ designs }: { designs: AdminDesign[] }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    return s ? designs.filter((d) => `${d.name} ${d.owner} ${d.ownerEmail} ${d.class} ${d.style}`.toLowerCase().includes(s)) : designs;
  }, [designs, q]);

  async function flag(id: string, patch: { cpu?: boolean; hidden?: boolean }) {
    setBusy(id);
    const res = await fetch(`/api/characters/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch) });
    setBusy(null);
    if (!res.ok) window.alert((await res.json().catch(() => ({}))).error ?? "Couldn't change it.");
    router.refresh();
  }

  const pill = (on: boolean) => `inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-semibold ring-1 disabled:opacity-50 ${on ? "bg-ink text-white ring-ink" : "ring-line hover:ring-ink"}`;
  return (
    <section>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h2 className="font-display text-2xl font-extrabold">Designs ({designs.length})</h2>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search name, player, email, class…"
          className="w-72 rounded-xl bg-card px-4 py-2 text-sm ring-1 ring-line outline-none focus:ring-ink"
        />
      </div>
      <ul className="mt-3 grid gap-3 md:grid-cols-2">
        {shown.map((d) => (
          <li key={d.id} className={`flex gap-3 rounded-2xl bg-card p-3 ring-1 ${d.hidden ? "opacity-60 ring-hit" : "ring-line"}`}>
            <div className="grid w-28 shrink-0 gap-1">
              <div className="aspect-square rounded-xl bg-white ring-1 ring-line">
                <FighterAvatar fighter={d} />
              </div>
              <a href={d.imageUrl} target="_blank" rel="noreferrer">
                {/* eslint-disable-next-line @next/next/no-img-element -- the raw upload, for moderation */}
                <img src={d.imageUrl} alt="Uploaded photo" className="aspect-square w-full rounded-xl bg-white object-contain ring-1 ring-line" />
              </a>
            </div>
            <div className="min-w-0 flex-1 text-sm">
              <div className="flex items-center gap-2">
                <Link href={`/character/${d.id}`} className="truncate font-display text-lg font-extrabold hover:underline">
                  {d.name}
                </Link>
                <ClassBadge cls={d.class} />
              </div>
              <p className="text-xs text-muted">
                {d.ownerId ? <Link href={`/player/${d.ownerId}`} className="hover:underline">@{d.owner}</Link> : `@${d.owner}`} · {d.ownerEmail}
              </p>
              <p className="text-xs text-muted">
                {new Date(d.createdAt).toLocaleString("en-GB")} · AI: {d.source} · {d.style ?? "default style"} · {d.specialKind ?? "default"}: {d.specialMove}
              </p>
              <p className="text-xs tabular-nums">{d.stats}</p>
              <div className="mt-2 flex flex-wrap gap-1">
                <button disabled={busy === d.id} onClick={() => flag(d.id, { cpu: !d.cpu })} className={pill(d.cpu)} title="Can the computer play as this design?">
                  <Bot className="size-3.5" /> {d.cpu ? "In CPU roster" : "Not in CPU roster"}
                </button>
                <button disabled={busy === d.id} onClick={() => flag(d.id, { hidden: !d.hidden })} className={pill(d.hidden)}>
                  {d.hidden ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />} {d.hidden ? "Hidden" : "Public"}
                </button>
                <Link href={`/play/cpu?fighter=${d.id}`} className={pill(false)}>
                  <Swords className="size-3.5" /> Fight as
                </Link>
                <Link href={`/play/cpu?opponent=${d.id}`} className={pill(false)}>
                  <Bot className="size-3.5" /> Fight against
                </Link>
              </div>
              <OwnerActions id={d.id} name={d.name} />
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
