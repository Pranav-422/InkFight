import { FLOORS } from "@/game/dungeon";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { rateLimit, tooMany } from "@/lib/rateLimit";

// A cleared dungeon floor, reported by the player's browser (the fight runs there, like every CPU fight).
// Only the next floor counts, at most one clear per 20 s (no real fight is shorter).
// shortcut: a client can claim a win it didn't fight for; dungeon progress only unlocks moves that are
// balanced for PvP and never touches the leaderboard. Add replay checks if dungeon ranks go public.
export async function POST(req: Request) {
  const s = await getSession();
  if (!s) return Response.json({ error: "Log in first." }, { status: 401 });
  if (!(await rateLimit(`dungeon:${s.userId}`, 1, 20_000))) return tooMany();
  const body = (await req.json().catch(() => ({}))) as { floor?: unknown };
  const floor = Number(body.floor);
  const user = await db.user.findUnique({ where: { id: s.userId }, select: { dungeonFloor: true } });
  if (!user) return Response.json({ error: "Log in first." }, { status: 401 });
  if (!Number.isInteger(floor) || floor !== user.dungeonFloor + 1 || floor > FLOORS) {
    return Response.json({ error: "Clear the floors in order.", floor: user.dungeonFloor }, { status: 400 });
  }
  // Conditional on the old value, so two tabs reporting at once can't both advance.
  const r = await db.user.updateMany({ where: { id: s.userId, dungeonFloor: floor - 1 }, data: { dungeonFloor: floor } });
  return Response.json({ ok: r.count === 1, floor: r.count === 1 ? floor : user.dungeonFloor });
}
