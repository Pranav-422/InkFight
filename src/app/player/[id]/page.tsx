import Link from "next/link";
import { notFound } from "next/navigation";
import { CharacterCard } from "@/components/CharacterCard";
import { db } from "@/lib/db";
import { getLeaderboard } from "@/lib/queries";

export const dynamic = "force-dynamic";

// Public stats for any player: record, best rank, their fighters and recent fights.
export default async function PlayerPage({ params }: PageProps<"/player/[id]">) {
  const { id } = await params;
  const user = await db.user.findUnique({ where: { id }, select: { id: true, name: true, createdAt: true } });
  if (!user) notFound();
  const board = await getLeaderboard();
  const mine = board.filter((c) => c.ownerId === user.id);
  const ids = mine.map((c) => c.id);
  const fights = ids.length
    ? await db.battle.findMany({
        where: { OR: [{ characterAId: { in: ids } }, { characterBId: { in: ids } }] },
        orderBy: { createdAt: "desc" },
        take: 10,
        include: { characterA: { select: { id: true, name: true } }, characterB: { select: { id: true, name: true } } },
      })
    : [];
  const wins = mine.reduce((n, c) => n + c.wins, 0), losses = mine.reduce((n, c) => n + c.losses, 0);
  const best = mine.length ? Math.min(...mine.map((c) => board.indexOf(c))) + 1 : null;

  return (
    <div className="grid gap-8">
      <section className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm text-muted">Player · since {user.createdAt.toLocaleDateString("en-GB", { month: "short", year: "numeric" })}</p>
          <h1 className="font-display text-4xl font-extrabold tracking-tight">@{user.name}</h1>
        </div>
        <dl className="flex gap-2 text-center">
          {[
            ["Fighters", mine.length],
            ["Wins", wins],
            ["Losses", losses],
            ["Win rate", wins + losses ? `${Math.round((wins / (wins + losses)) * 100)}%` : "–"],
            ["Best rank", best ? `#${best}` : "–"],
          ].map(([k, v]) => (
            <div key={k} className="min-w-18 rounded-2xl bg-card px-3 py-2.5 ring-1 ring-line">
              <dt className="text-[11px] font-semibold uppercase tracking-wider text-muted">{k}</dt>
              <dd className="font-display text-2xl font-extrabold tabular-nums">{v}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section>
        <h2 className="font-display text-2xl font-extrabold">Fighters</h2>
        {mine.length === 0 ? (
          <p className="mt-2 text-sm text-muted">No fighters yet.</p>
        ) : (
          <ul className="mt-3 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {mine.map((c) => (
              <li key={c.id}>
                <Link href={`/character/${c.id}`} className="block transition hover:-translate-y-0.5">
                  <CharacterCard character={c} variant="compact" />
                </Link>
                <p className="mt-1 text-center text-xs tabular-nums text-muted">
                  {c.wins}W · {c.losses}L · rank #{board.indexOf(c) + 1}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>

      {fights.length > 0 && (
        <section>
          <h2 className="font-display text-2xl font-extrabold">Recent fights</h2>
          <ul className="mt-3 divide-y divide-line overflow-hidden rounded-2xl bg-card ring-1 ring-line">
            {fights.map((f) => {
              const mineA = ids.includes(f.characterAId);
              const me = mineA ? f.characterA : f.characterB, them = mineA ? f.characterB : f.characterA;
              const won = f.winnerId === me.id;
              return (
                <li key={f.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                  <span className={`w-10 font-display font-extrabold ${won ? "text-guard" : "text-hit"}`}>{won ? "WIN" : "LOSS"}</span>
                  <Link href={`/character/${me.id}`} className="font-semibold hover:underline">
                    {me.name}
                  </Link>
                  <span className="text-muted">vs</span>
                  <Link href={`/character/${them.id}`} className="hover:underline">
                    {them.name}
                  </Link>
                  <span className="ml-auto text-xs text-muted">{f.createdAt.toLocaleDateString("en-GB")}</span>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </div>
  );
}
