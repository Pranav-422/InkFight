import type { Character } from "@prisma/client";
import { ClassBadge } from "./ClassBadge";
import { StatBar } from "./StatBar";

type Props = { character: Character; variant?: "full" | "compact" };

export function CharacterCard({ character: c, variant = "full" }: Props) {
  const full = variant === "full";
  return (
    <article className="rounded-2xl bg-card p-3 shadow-[0_1px_2px_rgba(0,0,0,.06),0_8px_24px_-12px_rgba(0,0,0,.18)] ring-1 ring-line">
      <div className="relative aspect-[4/5] overflow-hidden rounded-xl bg-white ring-1 ring-line">
        {/* eslint-disable-next-line @next/next/no-img-element -- user uploads served from an API route */}
        <img src={c.imageUrl} alt={`Drawing of ${c.name}`} className="h-full w-full object-contain" />
        <div className="absolute left-2 top-2">
          <ClassBadge cls={c.class} size={full ? "md" : "sm"} />
        </div>
      </div>
      <div className={full ? "px-2 pt-4 pb-2" : "px-1 pt-3 pb-1"}>
        <h3 className={`font-display font-extrabold leading-tight ${full ? "text-3xl" : "text-lg"}`}>{c.name}</h3>
        <p className="text-xs text-muted">drawn by @{c.ownerHandle}</p>

        <div className={`grid ${full ? "mt-4 gap-2" : "mt-2 gap-1"}`}>
          <StatBar stat="hp" value={c.hp} compact={!full} />
          <StatBar stat="atk" value={c.atk} compact={!full} />
          <StatBar stat="def" value={c.def} compact={!full} />
          <StatBar stat="spd" value={c.spd} compact={!full} />
        </div>

        {full && (
          <>
            <div className="mt-5 rounded-xl bg-paper p-3">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-hit">Special move</p>
              <p className="font-display text-lg font-extrabold">{c.specialMove}</p>
              {c.specialDesc && <p className="text-sm text-muted">{c.specialDesc}</p>}
            </div>
            <blockquote className="mt-4 border-l-0 px-1 text-center font-display text-base italic text-ink/80">
              “{c.flavorText}”
            </blockquote>
          </>
        )}
      </div>
    </article>
  );
}
