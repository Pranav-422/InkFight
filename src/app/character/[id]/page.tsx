import { Bot } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CharacterCard } from "@/components/CharacterCard";
import { FightButtons } from "@/components/FightButtons";
import { OwnerActions } from "@/components/OwnerActions";
import { RotateControl } from "@/components/RotateControl";
import { MOVES, SPECIAL_INFO, STYLE_INFO, type MoveName } from "@/game/moves";
import { deriveDef, TICK_HZ } from "@/game/sim";
import { getSession, isAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import type { Analysis } from "@/lib/vision";

export const dynamic = "force-dynamic";

const LABEL = { hp: "HP", atk: "STR", def: "DUR", spd: "SPD", agi: "AGI", iq: "IQ" } as const;

const MOVE_LABEL: Partial<Record<MoveName, string>> = { uppercutP: "Uppercut", flyingKnee: "Flying knee", frontKick: "Front kick", spinKick: "Spinning back kick", axeKick: "Axe kick", lowKick: "Low kick" };
const moveLabel = (m: MoveName) => MOVE_LABEL[m] ?? m[0].toUpperCase() + m.slice(1);

export default async function CharacterPage({ params, searchParams }: PageProps<"/character/[id]">) {
  const { id } = await params;
  const { new: isNew } = await searchParams;
  const me = await db.character.findUnique({ where: { id } });
  if (!me) notFound();
  const session = await getSession();
  const owns = session?.userId === me.ownerId;
  const canEdit = isAdmin(session) || (owns && !me.imageUrl.startsWith("/samples/"));
  const def = deriveDef(me);
  const power: [string, string, string][] = [
    ["Health", `${def.maxHp} HP`, "same for everyone"],
    ["Punch damage", def.punch.toFixed(1), "from STR"],
    ["Damage taken", `${Math.round(def.armor * 100)}%`, "from DUR"],
    ["Block absorbs", `${Math.round(def.blockReduce * 100)}%`, "from DUR"],
    ["Run speed", `${Math.round(def.speed * TICK_HZ)} px/s`, "from SPD"],
    ["Attack rate", `${(TICK_HZ / def.cooldown).toFixed(1)}/s`, "from SPD"],
    ["Jump height", def.jump ? def.jump.toFixed(1) : `${me.agi}`, "from AGI"],
    ["Energy gain", `${me.iq}`, "from IQ"],
  ];
  if (me.element && me.element !== "NONE") {
    power.push(["Element", me.element, "special hits"]);
  }

  let breakdown: Analysis["breakdown"] | null = null;
  try {
    breakdown = JSON.parse(me.detectedItems);
  } catch {}

  return (
    <div className="grid gap-8 md:grid-cols-[minmax(0,380px)_1fr]">
      <div>
        {isNew && <p className="mb-3 font-display text-lg font-extrabold">A challenger appears!</p>}
        <CharacterCard character={me} />
        {me.ownerId && (
          <Link href={`/player/${me.ownerId}`} className="mt-2 inline-block text-sm font-semibold text-muted hover:text-ink hover:underline">
            See @{me.ownerHandle}&apos;s player stats →
          </Link>
        )}
        {canEdit && <OwnerActions id={me.id} name={me.name} afterDelete="/home" />}
        {(owns || isAdmin(session)) && <RotateControl id={me.id} rotation={me.rotation} flipItem={me.flipItem} />}
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
              {breakdown.features.measured ? (
                <p className="text-xs text-muted">
                  Measured from your drawing: ink fills {Math.round(breakdown.features.measured.fill * 100)}% of its box, width{" "}
                  {Math.round(breakdown.features.measured.aspect * 100)}% of height, feet{" "}
                  {Math.round(breakdown.features.measured.stance * 100)}% and hands{" "}
                  {Math.round(breakdown.features.measured.armSpread * 100)}% of height apart.
                </p>
              ) : (
                breakdown.source === "offline" && (
                  <p className="text-xs text-muted">This fighter was made before we measured drawings, so its size and pose were guessed.</p>
                )
              )}
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
                Everyone has 200 HP and the same 350 points across STR, DUR, SPD, AGI and IQ. The class and the drawing rules
                set the split (70%),{" "}
                {breakdown.source === "claude" ? "Claude's read of your art" : breakdown.source === "gemini" ? "Gemini's read of your art" : "with no AI read this time"}
                {breakdown.source === "offline" ? "" : " sets the other 30%"}, so nobody gets a 9000-power scribble.
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
            <span className="font-semibold text-hit">{me.specialMove}</span>
            {me.element && me.element !== "NONE" && ` (${me.element})`}
            : {SPECIAL_INFO[def.special].how}, usable when the meter is
            full.
          </p>
        </section>

        <section>
          <h2 className="font-display text-xl font-extrabold">Fighting style: {def.style}</h2>
          <p className="text-sm text-muted">{STYLE_INFO[def.style].blurb}. Keep tapping the same button to chain the combo.</p>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {(["punch", "kick"] as const).map((k) => (
              <div key={k} className="rounded-xl bg-card p-3 ring-1 ring-line">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted">{k === "punch" ? "Punch (J)" : "Kick (K)"} combo</p>
                <p className="font-display font-extrabold">{STYLE_INFO[def.style][k].map(moveLabel).join(" → ")}</p>
                <p className="text-[11px] text-muted tabular-nums">
                  {STYLE_INFO[def.style][k].map((m) => `${MOVES[m].mult}×`).join(" · ")} damage
                </p>
              </div>
            ))}
          </div>
        </section>

        {owns ? (
          <section>
            <h2 className="font-display text-xl font-extrabold">Fight a friend</h2>
            <p className="mb-3 text-sm text-muted">Each player controls their own fighter on their own device.</p>
            <FightButtons fighterId={me.id} />
            <Link
              href={`/play/cpu?fighter=${me.id}`}
              className="mt-3 inline-flex items-center gap-2 text-sm font-semibold text-muted underline-offset-2 hover:text-ink hover:underline"
            >
              <Bot className="size-4" /> Or practice against the computer
            </Link>
          </section>
        ) : (
          <section>
            <h2 className="font-display text-xl font-extrabold">Think you can take {me.name}?</h2>
            <p className="mb-3 text-sm text-muted">The computer will play as this drawing. You pick one of yours.</p>
            <Link
              href={`/play/cpu?opponent=${me.id}`}
              className="inline-flex items-center gap-2 rounded-xl bg-hit px-5 py-3 font-semibold text-white hover:brightness-110"
            >
              <Bot className="size-4" /> Fight {me.name} vs computer
            </Link>
          </section>
        )}
      </div>
    </div>
  );
}
