import { Crown } from "lucide-react";
import Link from "next/link";
import { ClassBadge } from "@/components/ClassBadge";
import { FighterAvatar } from "@/components/FighterAvatar";
import { getLeaderboard, type LeaderboardEntry } from "@/lib/queries";

export const dynamic = "force-dynamic";

const PODIUM = ["bg-gold", "bg-[#d4d2cc]", "bg-[#d9a46c]"];

export default async function LeaderboardPage() {
  const entries = await getLeaderboard();
  const top = entries.slice(0, 3);
  const rest = entries.slice(3);

  return (
    <div>
      <h1 className="font-display text-3xl font-extrabold">Leaderboard</h1>
      <p className="text-sm text-muted">Ranked by wins. Bragging rights are non-transferable.</p>

      {entries.length === 0 ? (
        <div className="mt-6 rounded-2xl border-2 border-dashed border-ink/15 p-12 text-center">
          <p className="font-display text-xl font-extrabold">No champions yet.</p>
          <p className="mt-1 text-sm text-muted">Somebody has to throw the first punch.</p>
        </div>
      ) : (
        <>
          {/* A podium: first place in the middle and raised, on every screen size. */}
          <ol className="mt-6 grid grid-cols-3 items-end gap-2 sm:gap-4">
            {top.map((e, i) => (
              <li key={e.id} className={i === 0 ? "order-2" : i === 1 ? "order-1" : "order-3"}>
                <Link
                  href={`/character/${e.id}`}
                  className={`relative block rounded-2xl bg-card p-2 transition sm:p-3 ${i === 0 ? "sticker pb-4 sm:pb-6" : "ring-1 ring-line hover:ring-ink"}`}
                >
                  <span
                    className={`absolute -left-2 -top-2 z-10 flex size-9 items-center justify-center rounded-full font-display text-lg font-extrabold text-ink ${PODIUM[i]}`}
                  >
                    {i === 0 ? <Crown className="size-5" /> : i + 1}
                  </span>
                  <div className="aspect-square w-full rounded-xl bg-white ring-1 ring-line">
                    <FighterAvatar fighter={e} />
                  </div>
                  <p className="mt-2 truncate font-display text-sm font-extrabold sm:mt-3 sm:text-xl">{e.name}</p>
                  <div className="mt-1 flex flex-col gap-1 text-sm sm:flex-row sm:items-center sm:justify-between">
                    <span className="hidden sm:inline-flex">
                      <ClassBadge cls={e.class} />
                    </span>
                    <WinLoss e={e} />
                  </div>
                </Link>
              </li>
            ))}
          </ol>

          {rest.length > 0 && (
            <ol className="mt-6 divide-y divide-line overflow-hidden rounded-2xl bg-card ring-1 ring-line">
              {rest.map((e, i) => (
                <li key={e.id}>
                  <Link href={`/character/${e.id}`} className="flex items-center gap-3 px-4 py-2.5 hover:bg-paper">
                    <span className="w-6 text-right text-sm tabular-nums text-muted">{i + 4}</span>
                    {/* eslint-disable-next-line @next/next/no-img-element -- user uploads */}
                    <img src={e.imageUrl} alt="" className="size-10 rounded-lg bg-white object-contain ring-1 ring-line" />
                    <span className="min-w-0 flex-1 truncate font-semibold">
                      {e.name} <span className="hidden font-normal text-muted sm:inline">@{e.ownerHandle}</span>
                    </span>
                    <span className="hidden sm:inline-flex">
                      <ClassBadge cls={e.class} />
                    </span>
                    <WinLoss e={e} />
                  </Link>
                </li>
              ))}
            </ol>
          )}
        </>
      )}
    </div>
  );
}

function WinLoss({ e }: { e: LeaderboardEntry }) {
  return (
    <span className="shrink-0 text-sm tabular-nums sm:w-24 sm:text-right">
      <span className="font-semibold">{e.wins}W</span> <span className="text-muted">– {e.losses}L</span>
    </span>
  );
}
