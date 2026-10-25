import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { rateLimit, tooMany } from "@/lib/rateLimit";

// The stored battle between two fighters that just finished (the host reports it a moment after the match ends), so
// the result overlay can link to /battle/[id]. Newest first, within the last 15 minutes, either seat order.
export async function GET(req: Request) {
  const s = await getSession();
  if (!s) return Response.json({ error: "Log in first." }, { status: 401 });
  if (!(await rateLimit(`battle-lookup:${s.userId}`, 30, 60_000))) return tooMany();
  const q = new URL(req.url).searchParams;
  const a = q.get("a") ?? "", b = q.get("b") ?? "";
  if (!/^[A-Za-z0-9-]{3,40}$/.test(a) || !/^[A-Za-z0-9-]{3,40}$/.test(b)) return Response.json({ error: "Bad fighters." }, { status: 400 });
  const battle = await db.battle.findFirst({
    where: {
      createdAt: { gt: new Date(Date.now() - 15 * 60_000) },
      OR: [{ characterAId: a, characterBId: b }, { characterAId: b, characterBId: a }],
    },
    orderBy: { createdAt: "desc" },
    select: { id: true },
  });
  return Response.json({ id: battle?.id ?? null });
}
