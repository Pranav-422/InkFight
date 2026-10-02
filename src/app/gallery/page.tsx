import Link from "next/link";
import { CharacterCard } from "@/components/CharacterCard";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function GalleryPage() {
  const characters = await db.character.findMany({ orderBy: { createdAt: "desc" } });

  return (
    <div>
      <div className="mb-6 flex items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-extrabold">Gallery</h1>
          <p className="text-sm text-muted">Every fighter ever scribbled into existence. Tap one to pick a fight.</p>
        </div>
        <Link href="/" className="shrink-0 rounded-xl bg-hit px-4 py-2.5 text-sm font-semibold text-white hover:brightness-110">
          New fighter
        </Link>
      </div>

      {characters.length === 0 ? (
        <div className="rounded-2xl border-2 border-dashed border-ink/15 p-12 text-center">
          <p className="font-display text-xl font-extrabold">It&apos;s quiet. Too quiet.</p>
          <p className="mt-1 text-sm text-muted">No fighters yet. Grab a pen.</p>
        </div>
      ) : (
        <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {characters.map((c) => (
            <li key={c.id}>
              <Link href={`/character/${c.id}`} className="block transition hover:-translate-y-0.5">
                <CharacterCard character={c} variant="compact" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
