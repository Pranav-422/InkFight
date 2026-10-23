import { Bot, PenLine, Swords, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { CharacterCard } from "@/components/CharacterCard";
import { OwnerActions } from "@/components/OwnerActions";
import { requireUser } from "@/lib/auth";
import { getLeaderboard } from "@/lib/queries";

export const dynamic = "force-dynamic";

const ACTIONS: [string, string, string, LucideIcon, boolean][] = [
  ["/play", "Fight a friend", "Create a room or join with a code", Swords, true],
  ["/play/cpu", "Vs computer", "Any gallery drawing, three levels", Bot, false],
  ["/create", "New fighter", "Scan another drawing", PenLine, false],
];

export default async function HomePage() {
  const user = await requireUser("/home");
  const board = await getLeaderboard();
  const mine = board.filter((c) => c.ownerId === user.userId).sort((a, b) => +b.createdAt - +a.createdAt);
  const wins = mine.reduce((n, c) => n + c.wins, 0);
  const losses = mine.reduce((n, c) => n + c.losses, 0);
  const best = mine.length ? Math.min(...mine.map((c) => board.indexOf(c))) + 1 : null;

  return (
    <div className="grid gap-10">
      <section className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm text-muted">Welcome back</p>
          <h1 className="font-display text-4xl font-extrabold tracking-tight">{user.name}</h1>
        </div>
        <dl className="flex gap-2 text-center">
          {[
            ["Wins", wins],
            ["Losses", losses],
            ["Best rank", best ? `#${best}` : "–"],
          ].map(([k, v]) => (
            <div key={k} className="min-w-20 rounded-2xl bg-card px-4 py-2.5 ring-1 ring-line">
              <dt className="text-[11px] font-semibold uppercase tracking-wider text-muted">{k}</dt>
              <dd className="font-display text-2xl font-extrabold tabular-nums">{v}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="grid gap-3 sm:grid-cols-3">
        {ACTIONS.map(([href, title, sub, Icon, primary]) => (
          <Link
            key={href}
            href={href}
            className={`rounded-2xl p-5 transition ${primary ? "bg-hit text-white hover:brightness-110" : "bg-card ring-1 ring-line hover:ring-ink"}`}
          >
            <Icon className="size-6" />
            <p className="mt-3 font-display text-xl font-extrabold">{title}</p>
            <p className={`text-sm ${primary ? "text-white/80" : "text-muted"}`}>{sub}</p>
          </Link>
        ))}
      </section>

      <section>
        <h2 className="font-display text-2xl font-extrabold">My fighters</h2>
        {mine.length === 0 ? (
          <div className="mt-3 rounded-2xl border-2 border-dashed border-ink/15 p-10 text-center">
            <p className="font-display text-xl font-extrabold">No fighters yet</p>
            <p className="mt-1 text-sm text-muted">Draw a stick figure on paper and scan it.</p>
            <Link href="/create" className="mt-4 inline-block rounded-xl bg-hit px-5 py-3 font-semibold text-white">
              Scan your first fighter
            </Link>
          </div>
        ) : (
          <ul className="mt-3 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {mine.map((c) => (
              <li key={c.id}>
                <Link href={`/character/${c.id}`} className="block transition hover:-translate-y-0.5">
                  <CharacterCard character={c} variant="compact" />
                </Link>
                <p className="mt-1 text-center text-xs text-muted tabular-nums">
                  {c.wins}W · {c.losses}L
                </p>
                {!c.imageUrl.startsWith("/samples/") && <OwnerActions id={c.id} name={c.name} />}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
