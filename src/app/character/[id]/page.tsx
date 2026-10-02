import { notFound } from "next/navigation";
import { CharacterCard } from "@/components/CharacterCard";
import { FightButtons } from "@/components/FightButtons";
import { deriveDef, TICK_HZ } from "@/game/sim";
import { db } from "@/lib/db";
import type { Analysis } from "@/lib/vision";

export const dynamic = "force-dynamic";

const LABEL = { hp: "HP", atk: "ATK", def: "DEF", spd: "SPD" } as const;

export default async function CharacterPage({ params, searchParams }: PageProps<"/character/[id]">) {
  const { id } = await params;
  const { new: isNew } = await searchParams;
  const me = await db.character.findUnique({ where: { id } });
  if (!me) notFound();
  const def = deriveDef(me);
  const SPECIAL_HOW: Record<string, string> = {
    bolt: "fires a magic bolt",
    arrow: "fires a fast arrow",
    orb: "throws a slow, heavy orb",
    slash: "dashes in with a slash",
    charge: "shield-charges and takes half damage for 3s",
    uppercut: "launches the opponent with an uppercut",
  };
  const power = [
    ["Health", `${def.maxHp} HP`, "from HP"],
    ["Punch damage", def.punch.toFixed(1), "from ATK"],
    ["Damage taken", `${Math.round(def.armor * 100)}%`, "from DEF"],
    ["Block absorbs", `${Math.round(def.blockReduce * 100)}%`, "from DEF"],
    ["Run speed", `${Math.round(def.speed * TICK_HZ)} px/s`, "from SPD"],
    ["Attack rate", `${(TICK_HZ / def.cooldown).toFixed(1)}/s`, "from SPD"],
  ];

  let breakdown: Analysis["breakdown"] | null = null;
  try {
    breakdown = JSON.parse(me.detectedItems);
  } catch {}

  return (
    <div className="grid gap-8 md:grid-cols-[minmax(0,380px)_1fr]">
      <div>
        {isNew && <p className="mb-3 font-display text-lg font-extrabold">A challenger appears!</p>}
        <CharacterCard character={me} />
      </div>

      <div className="grid content-start gap-8">
        {breakdown && (
          <section>
            <h2 className="font-display text-xl font-extrabold">Why these stats?</h2>
            <div className="mt-3 grid gap-3 rounded-2xl bg-card p-4 text-sm ring-1 ring-line">
              <p className="font-semibold">{breakdown.classReason}</p>
              <p className="text-muted">
                Drawn {breakdown.features.size}, {breakdown.features.pose} pose
                {breakdown.features.dominant_colors.length > 0 &&
                  `, mostly ${breakdown.features.dominant_colors.join(" & ")}`}
                .
              </p>
              {breakdown.adjustments.length > 0 && (
                <ul className="flex flex-wrap gap-1.5">
                  {breakdown.adjustments.map((a, i) => (
                    <li
                      key={i}
                      className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                        a.delta > 0 ? "bg-guard/10 text-guard" : "bg-hit/10 text-hit"
                      }`}
                    >
                      {a.reason}: {a.delta > 0 ? "+" : ""}
                      {a.delta} {LABEL[a.stat]}
                    </li>
                  ))}
                </ul>
              )}
              <p className="text-xs text-muted">
                Final stats = 70% class + drawing rules, 30%{" "}
                {breakdown.source === "claude" ? "Claude's read of your art" : "rules only (offline)"}, clamped to fixed
                ranges so nobody gets a 9000-power scribble.
              </p>
              {breakdown.note && <p className="text-xs text-muted">{breakdown.note}</p>}
            </div>
          </section>
        )}

        <section>
          <h2 className="font-display text-xl font-extrabold">How it fights</h2>
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
            {power.map(([label, value, from]) => (
              <div key={label} className="rounded-xl bg-card p-3 ring-1 ring-line">
                <p className="text-xs text-muted">{label}</p>
                <p className="font-display text-lg font-extrabold tabular-nums">{value}</p>
                <p className="text-[11px] text-muted">{from}</p>
              </div>
            ))}
          </div>
          <p className="mt-3 text-sm">
            <span className="font-semibold text-hit">{me.specialMove}</span>: {SPECIAL_HOW[def.special]} (the {me.class} special),
            usable when the meter is full.
          </p>
        </section>

        <section>
          <h2 className="font-display text-xl font-extrabold">Fight a friend</h2>
          <p className="mb-3 text-sm text-muted">Each player controls their own fighter on their own device.</p>
          <FightButtons fighterId={me.id} />
        </section>
      </div>
    </div>
  );
}
