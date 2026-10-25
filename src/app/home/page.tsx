import { Blocks, Bot, Castle, ChevronRight, PenLine } from "lucide-react";
import Link from "next/link";
import { CharacterCard } from "@/components/CharacterCard";
import { FighterAvatar } from "@/components/FighterAvatar";
import { OwnerActions } from "@/components/OwnerActions";
import { RoomStart } from "@/components/RoomStart";
import { BOSSES } from "@/game/dungeon";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { getLeaderboard } from "@/lib/queries";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const user = await requireUser("/home");
  const [board, me] = await Promise.all([
    getLeaderboard(),
    db.user.findUnique({ where: { id: user.userId }, select: { dungeonFloor: true } }),
  ]);
  const mine = board.filter((c) => c.ownerId === user.userId).sort((a, b) => +b.createdAt - +a.createdAt);
  const wins = mine.reduce((n, c) => n + c.wins, 0);
  const losses = mine.reduce((n, c) => n + c.losses, 0);
  const best = mine.length ? Math.min(...mine.map((c) => board.indexOf(c))) + 1 : null;
  const cleared = me?.dungeonFloor ?? 0;
  const boss = BOSSES[cleared];

  return (
    <div className="grid grid-cols-1 gap-8">
      <section className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm text-muted">Welcome back</p>
          <h1 className="font-display text-4xl font-extrabold tracking-tight">{user.name}</h1>
        </div>
        <p className="rounded-full bg-card px-4 py-2 text-sm font-semibold tabular-nums ring-1 ring-line">
          <span className="text-hit">{wins}W</span> · {losses}L{best && <> · best #{best}</>}
        </p>
      </section>

      <section className="sticker overflow-hidden rounded-3xl bg-card md:grid md:grid-cols-2">
        <div className="relative flex items-center justify-center gap-6 bg-[radial-gradient(var(--line)_1.2px,transparent_1.2px)] [background-size:14px_14px] px-6 pt-6 pb-4 md:py-8">
          <div className="size-28 rotate-[-3deg] overflow-hidden rounded-2xl bg-white ring-2 ring-ink">
            {mine[0] ? <FighterAvatar fighter={mine[0]} /> : <PenLine className="m-auto mt-9 size-10 text-muted" />}
          </div>
          <span className="rotate-[-8deg] rounded-lg border-2 border-ink bg-gold px-2.5 py-1 font-display text-2xl font-extrabold">VS</span>
          <div className="flex size-28 rotate-[3deg] items-center justify-center rounded-2xl border-2 border-dashed border-ink/40 bg-white font-display text-5xl font-extrabold text-ink/25">
            ?
          </div>
        </div>
        <div className="grid content-center gap-4 p-5 pt-3 md:p-8">
          <div>
            <h2 className="font-display text-2xl font-extrabold">Fight a friend</h2>
            <p className="text-sm text-muted">Each on your own phone. Send the link, draw blood (ink).</p>
          </div>
          <RoomStart />
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-2">
        <Link href="/play/cpu" className="press flex items-center gap-4 rounded-2xl bg-card p-4 ring-1 ring-line hover:ring-ink">
          <span className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-paper ring-1 ring-line">
            <Bot className="size-6" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block font-display text-lg font-extrabold">Vs computer</span>
            <span className="block text-sm text-muted">Practice against any drawing</span>
          </span>
          <ChevronRight className="size-5 text-muted" />
        </Link>
        <Link href="/play/dungeon" className="press flex items-center gap-4 rounded-2xl bg-ink p-4 text-white">
          <span className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-white/10">
            <Castle className="size-6" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block font-display text-lg font-extrabold">The Dungeon</span>
            <span className="block truncate text-sm text-white/70">
              {boss ? `Floor ${cleared + 1}: ${boss.title}` : "All 10 floors cleared"}
            </span>
          </span>
          <ChevronRight className="size-5 text-white/60" />
        </Link>
      </section>

      <section>
        <div className="flex items-end justify-between gap-3">
          <h2 className="font-display text-2xl font-extrabold">My fighters</h2>
          <div className="flex gap-2 text-sm font-semibold">
            <Link href="/create" className="flex items-center gap-1.5 rounded-full bg-card px-3 py-1.5 ring-1 ring-line hover:ring-ink">
              <PenLine className="size-4" /> Scan
            </Link>
            <Link href="/build" className="flex items-center gap-1.5 rounded-full bg-card px-3 py-1.5 ring-1 ring-line hover:ring-ink">
              <Blocks className="size-4" /> Build
            </Link>
          </div>
        </div>
        {mine.length === 0 ? (
          <div className="mt-3 rounded-2xl border-2 border-dashed border-ink/15 p-10 text-center">
            <p className="font-display text-xl font-extrabold">No fighters yet</p>
            <p className="mt-1 text-sm text-muted">Draw a stick figure on paper and scan it, or build one from parts.</p>
            <Link href="/create" className="press sticker mt-4 inline-block rounded-xl bg-hit px-5 py-3 font-semibold text-white">
              Scan your first fighter
            </Link>
          </div>
        ) : (
          // Phones: one swipeable row; wider screens: a grid.
          <ul className="no-scrollbar -mx-4 mt-3 flex snap-x snap-mandatory scroll-px-4 gap-3 overflow-x-auto px-4 pb-2 sm:mx-0 sm:grid sm:grid-cols-3 sm:gap-4 sm:overflow-visible sm:px-0 lg:grid-cols-4">
            {mine.map((c) => (
              <li key={c.id} className="w-[46%] shrink-0 snap-start sm:w-auto">
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
        <Link href="/gallery" className="mt-3 inline-block text-sm font-semibold text-muted underline-offset-2 hover:text-ink hover:underline">
          Browse everyone&apos;s fighters in the gallery →
        </Link>
      </section>
    </div>
  );
}
