import { Swords, Trophy } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { FighterAvatar } from "@/components/FighterAvatar";
import { ShareResult } from "@/components/ShareResult";
import { db } from "@/lib/db";
import { battleScore } from "@/lib/shareCard";

export const dynamic = "force-dynamic";

const load = (id: string) =>
  db.battle.findUnique({
    where: { id },
    include: { characterA: true, characterB: true },
  });

export async function generateMetadata({ params }: PageProps<"/battle/[id]">): Promise<Metadata> {
  const b = await load((await params).id);
  if (!b) return { title: "Result · InkFight" };
  const won = b.winnerId === b.characterAId ? b.characterA : b.characterB, lost = won === b.characterA ? b.characterB : b.characterA;
  return { title: `${won.name} beat ${lost.name} · InkFight`, description: `${won.name} vs ${lost.name} on InkFight. Draw a stick figure, scan it, make it fight.` };
}

// A stored online result: both fighters, the score, and a link anyone can open (its OG image is the 1080 x 1080 card).
export default async function BattlePage({ params }: PageProps<"/battle/[id]">) {
  const { id } = await params;
  const b = await load(id);
  if (!b) notFound();
  const [sa, sb] = battleScore(b.log, b.winnerId === b.characterAId);
  let log: { damage?: number[]; rounds?: number } = {};
  try {
    log = JSON.parse(b.log);
  } catch {}
  const sides = [
    { c: b.characterA, rounds: sa, won: b.winnerId === b.characterAId },
    { c: b.characterB, rounds: sb, won: b.winnerId === b.characterBId },
  ];
  const winner = sides.find((s) => s.won)!.c;
  return (
    <div className="mx-auto grid max-w-3xl gap-6">
      <header className="text-center">
        <p className="flex items-center justify-center gap-1.5 text-xs font-semibold uppercase tracking-widest text-muted">
          <Swords className="size-4" /> Result · {b.createdAt.toLocaleDateString("en-GB")}
        </p>
        <h1 className="mt-1 font-display text-4xl font-extrabold">{winner.name} wins</h1>
        <p className="mt-1 font-display text-5xl font-extrabold tabular-nums">
          {sa} – {sb}
        </p>
      </header>
      <div className="grid grid-cols-2 gap-4">
        {sides.map(({ c, won }, i) => (
          <Link key={c.id} href={`/character/${c.id}`} className={`rounded-2xl bg-card p-3 text-center ${won ? "ring-4 ring-gold" : "card-edge"}`}>
            <div className="mx-auto aspect-[4/5] w-full max-w-60 overflow-hidden rounded-xl bg-white ring-1 ring-line">
              <FighterAvatar fighter={c} />
            </div>
            <p className="mt-2 flex items-center justify-center gap-1 font-display text-xl font-extrabold">
              {won && <Trophy className="size-4 text-gold" />} {c.name}
            </p>
            <p className="text-xs text-muted">
              by @{c.ownerHandle}
              {log.damage?.[i] !== undefined && ` · ${Math.round(log.damage[i])} damage dealt`}
            </p>
          </Link>
        ))}
      </div>
      <div className="flex flex-wrap items-center justify-center gap-2">
        <span className="[&>button]:bg-ink [&>button]:text-white">
          <ShareResult title={`${winner.name} wins on InkFight`} text={`${sides[0].c.name} ${sa} – ${sb} ${sides[1].c.name}`} url={`/battle/${b.id}`} />
        </span>
        <Link href="/create" className="rounded-xl bg-hit px-5 py-2.5 text-sm font-semibold text-white hover:brightness-110">
          Draw your own fighter
        </Link>
        <Link href="/leaderboard" className="rounded-xl bg-card px-5 py-2.5 text-sm font-semibold ring-1 ring-line hover:ring-ink">
          Leaderboard
        </Link>
      </div>
    </div>
  );
}
