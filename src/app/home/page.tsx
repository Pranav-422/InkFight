import { Blocks, Camera, Castle, ChevronRight, Images, LogOut, PenLine, Play, Trophy, UserRound, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { CharacterCard } from "@/components/CharacterCard";
import { FighterAvatar } from "@/components/FighterAvatar";
import { OptionsMenu } from "@/components/OptionsMenu";
import { OwnerActions } from "@/components/OwnerActions";
import { BOSSES } from "@/game/dungeon";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { getLeaderboard } from "@/lib/queries";
import { logout } from "../(auth)/actions";

export const dynamic = "force-dynamic";

const item = "group flex w-full items-center gap-3 border-b-2 border-dashed border-ink/20 py-3 font-display text-xl hover:bg-gold/40 sm:text-2xl";

function MenuItem({ href, icon: Icon, label, note }: { href: string; icon: LucideIcon; label: string; note?: string }) {
  return (
    <Link href={href} className={item}>
      <Icon className="size-5 shrink-0" />
      <span className="flex-1">{label}</span>
      {note && <span className="tag bg-cream text-muted">{note}</span>}
      <ChevronRight className="size-5 text-muted transition group-hover:translate-x-1" />
    </Link>
  );
}

// The title menu players land on after logging in.
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
  const hero = mine[0];

  return (
    <div className="grid grid-cols-1 gap-8">
      <div className="grid items-start gap-6 md:grid-cols-[1fr_1.15fr]">
        {/* Left: the logo block and the menu. */}
        <section>
          <p className="tag bg-hit text-white">Hey {user.name}</p>
          <h1 className="mt-2 hidden font-comic text-7xl leading-[0.9] md:block">
            Ink<span className="text-hit [text-shadow:3px_3px_0_var(--gold)]">fight</span>
          </h1>
          <p className="mt-2 flex flex-wrap items-center gap-2 text-xs font-extrabold uppercase tracking-[0.2em] text-muted">
            Margin of glory
            <span className="tag bg-gold tracking-wider text-ink">
              {wins}W · {losses}L{best && ` · #${best}`}
            </span>
          </p>
          <div className="mt-3 h-1 w-48 bg-[repeating-linear-gradient(90deg,var(--hit)_0_14px,transparent_14px_22px)]" />

          <nav className="mt-6">
            <Link
              href="/play"
              className="press sticker flex items-center gap-3 bg-hit px-4 py-4 font-display text-2xl font-black text-white sm:text-3xl"
            >
              <Play className="size-6 fill-gold text-gold" />
              <span className="flex-1">Play</span>
              <span className="tag -rotate-2 bg-gold text-ink">Start brawl</span>
            </Link>
            {/* Making a fighter is the heart of the game: two big buttons, not a menu line. */}
            <div className="mt-3 grid grid-cols-2 gap-3">
              <Link href="/create" className="press sticker flex flex-col gap-1 bg-gold px-3 py-3">
                <Camera className="size-6" />
                <span className="font-display text-lg font-black leading-none">Scan a drawing</span>
                <span className="text-xs font-semibold text-ink/70">Photo of your stick figure</span>
              </Link>
              <Link href="/build" className="press sticker flex flex-col gap-1 bg-white px-3 py-3">
                <Blocks className="size-6" />
                <span className="font-display text-lg font-black leading-none">Build from parts</span>
                <span className="text-xs font-semibold text-muted">No paper needed</span>
              </Link>
            </div>
            <div className="mt-3">
              <MenuItem href="/play/dungeon" icon={Castle} label="Dungeon" note={boss ? `Floor ${cleared + 1}` : "Cleared"} />
              <MenuItem href={`/player/${user.userId}`} icon={UserRound} label="My record" />
              <MenuItem href="/gallery" icon={Images} label="Gallery" note="Sketches" />
              <MenuItem href="/leaderboard" icon={Trophy} label="Ranks" />
              <OptionsMenu className={item} />
              <form action={logout}>
                <button className={`${item} text-muted`}>
                  <LogOut className="size-5" /> Exit
                </button>
              </form>
            </div>
          </nav>
        </section>

        {/* Right: the hero panel with the newest fighter mid-swing. */}
        <section className="lift relative order-first overflow-hidden bg-card md:order-none">
          <div className="relative aspect-[5/4] bg-[radial-gradient(rgba(23,23,23,.14)_1.2px,transparent_1.4px)] [background-size:10px_10px]">
            <span className="absolute top-3 right-[-34px] rotate-45 border-y-[3px] border-ink bg-gold px-10 py-0.5 text-[11px] font-extrabold uppercase tracking-widest">
              Chapter {cleared + 1}
            </span>
            <p className="absolute top-4 left-4 -rotate-6 font-comic text-7xl text-gold [-webkit-text-stroke:2px_var(--ink)] [text-shadow:3px_3px_0_var(--ink),6px_6px_0_var(--hit)] sm:text-7xl">
              Shink!
            </p>
            <div className="absolute inset-x-0 bottom-14 mx-auto h-[62%] w-[55%]">
              {hero ? <FighterAvatar fighter={hero} /> : <PenLine className="m-auto mt-10 size-16 text-muted" />}
            </div>
            {hero ? (
              <Link
                href={`/character/${hero.id}`}
                className="card-edge absolute right-3 bottom-3 left-3 flex items-center gap-3 bg-card px-3 py-2 sm:left-auto sm:min-w-72"
              >
                <span className="size-3 shrink-0 rounded-full bg-hit" />
                <span className="min-w-0 flex-1">
                  <span className="block text-[10px] font-extrabold uppercase tracking-widest text-hit">{hero.class}</span>
                  <span className="block truncate font-display text-sm font-black">{hero.name}</span>
                </span>
                <span className="font-display text-xs font-extrabold">
                  STR <span className="text-hit">{hero.atk}</span> · SPD <span className="bg-gold px-1">{hero.spd}</span>
                </span>
              </Link>
            ) : (
              <Link href="/create" className="press sticker absolute right-3 bottom-3 left-3 bg-gold px-4 py-3 text-center font-display font-black">
                Scan your first fighter
              </Link>
            )}
          </div>
        </section>
      </div>

      {mine.length > 0 && (
        <section>
          <div className="flex items-end justify-between gap-3">
            <h2 className="font-display text-2xl">Your roster</h2>
            <span className="tag bg-cream">{mine.length} fighters</span>
          </div>
          {/* Phones: one swipeable row; wider screens: a grid. */}
          <ul className="no-scrollbar -mx-4 mt-3 flex snap-x snap-mandatory scroll-px-4 gap-3 overflow-x-auto px-4 pb-3 sm:mx-0 sm:grid sm:grid-cols-3 sm:gap-4 sm:overflow-visible sm:px-0 lg:grid-cols-4">
            {mine.map((c) => (
              <li key={c.id} className="w-[46%] shrink-0 snap-start sm:w-auto">
                <Link href={`/character/${c.id}`} className="block transition hover:-translate-y-0.5">
                  <CharacterCard character={c} variant="compact" />
                </Link>
                <p className="mt-1 text-center font-display text-xs font-extrabold tabular-nums">
                  {c.wins}W · {c.losses}L
                </p>
                {!c.imageUrl.startsWith("/samples/") && <OwnerActions id={c.id} name={c.name} />}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
