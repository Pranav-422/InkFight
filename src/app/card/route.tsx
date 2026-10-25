import { clientIp, rateLimit, tooMany } from "@/lib/rateLimit";
import { parseScore, renderCard, resolveFighter, siteOrigin } from "@/lib/shareCard";

// The result card for a fight that isn't stored (a vs-computer fight): /card?a=<fighter id>&b=<fighter id>&sa=2&sb=1.
// Every part is validated: two known fighters (or dungeon bosses) and a score a match can end with.
export async function GET(req: Request) {
  if (!(await rateLimit(`card:${await clientIp()}`, 40, 60_000))) return tooMany("Cards");
  const q = new URL(req.url).searchParams;
  const score = parseScore(q.get("sa"), q.get("sb"));
  const [a, b] = await Promise.all([resolveFighter(q.get("a") ?? ""), resolveFighter(q.get("b") ?? "")]);
  if (!score || !a || !b) return Response.json({ error: "No such result." }, { status: 400 });
  const res = await renderCard(a, b, score, (await siteOrigin()).replace(/^https?:\/\//, ""));
  res.headers.set("Cache-Control", "public, max-age=3600");
  return res;
}
