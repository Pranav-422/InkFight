import { Swords } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ShareResult } from "@/components/ShareResult";
import { parseScore, resolveFighter, siteOrigin } from "@/lib/shareCard";

export const dynamic = "force-dynamic";

// A share link for a fight that isn't stored (vs the computer, the Dungeon): the fighters and the score are in the URL and
// validated, and the card is built from them (/card). The same card is the link preview.
async function parse(sp: Record<string, string | string[] | undefined>) {
  const one = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : "");
  const score = parseScore(one("sa"), one("sb"));
  const [a, b] = await Promise.all([resolveFighter(one("a")), resolveFighter(one("b"))]);
  if (!score || !a || !b) return null;
  return { a, b, score, query: new URLSearchParams({ a: one("a"), b: one("b"), sa: String(score[0]), sb: String(score[1]) }).toString() };
}

export async function generateMetadata({ searchParams }: PageProps<"/share">): Promise<Metadata> {
  const r = await parse(await searchParams);
  if (!r) return { title: "Result · InkFight" };
  const origin = await siteOrigin();
  const title = `${r.score[0] > r.score[1] ? r.a.name : r.b.name} wins on InkFight`;
  const image = { url: `${origin}/card?${r.query}`, width: 1080, height: 1080, alt: `${r.a.name} ${r.score[0]} – ${r.score[1]} ${r.b.name}` };
  return { title, description: "Draw a stick figure, scan it, make it fight.", openGraph: { title, images: [image] }, twitter: { card: "summary_large_image", title, images: [image.url] } };
}

export default async function SharePage({ searchParams }: PageProps<"/share">) {
  const r = await parse(await searchParams);
  if (!r) notFound();
  const winner = r.score[0] > r.score[1] ? r.a : r.b;
  return (
    <div className="mx-auto grid max-w-xl gap-5 text-center">
      <p className="flex items-center justify-center gap-1.5 text-xs font-semibold uppercase tracking-widest text-muted">
        <Swords className="size-4" /> Result
      </p>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={`/card?${r.query}`} alt={`${r.a.name} ${r.score[0]} – ${r.score[1]} ${r.b.name}`} className="w-full rounded-2xl ring-1 ring-line" />
      <h1 className="font-display text-3xl font-extrabold">{winner.name} wins</h1>
      <div className="flex flex-wrap justify-center gap-2">
        <span className="[&>button]:bg-ink [&>button]:text-white">
          <ShareResult title={`${winner.name} wins on InkFight`} text={`${r.a.name} ${r.score[0]} – ${r.score[1]} ${r.b.name}`} url={`/share?${r.query}`} />
        </span>
        <Link href="/create" className="rounded-xl bg-hit px-5 py-2.5 text-sm font-semibold text-white hover:brightness-110">
          Draw your own fighter
        </Link>
      </div>
    </div>
  );
}
