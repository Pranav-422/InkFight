import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { isStale } from "@/lib/rooms";

export async function POST(req: Request, ctx: RouteContext<"/api/rooms/[code]/answer">) {
  const s = await getSession();
  if (!s) return Response.json({ error: "Log in first." }, { status: 401 });
  const code = (await ctx.params).code.toUpperCase();
  const { fighterId, answer, version } = (await req.json().catch(() => ({}))) as { fighterId?: string; answer?: string; version?: number };
  if (!fighterId || !answer || answer.length > 20000) return Response.json({ error: "Bad answer." }, { status: 400 });

  const fighter = await db.character.findUnique({ where: { id: fighterId } });
  if (!fighter || fighter.ownerId !== s.userId) return Response.json({ error: "Pick one of your own fighters." }, { status: 403 });

  const room = await db.room.findUnique({ where: { code } });
  if (!room || isStale(room)) return Response.json({ error: "That room has closed." }, { status: 404 });
  if (room.hostUserId === s.userId) return Response.json({ error: "You're the host of this room. Use a second account to join." }, { status: 409 });
  if (version && room.updatedAt.getTime() !== version) return Response.json({ error: "The host restarted the room. Rejoining…", retry: true }, { status: 409 });

  // Only claim the seat if it's still free (or already ours).
  const claimed = await db.room.updateMany({
    where: { code, updatedAt: room.updatedAt, OR: [{ guestUserId: null }, { guestUserId: s.userId }] },
    data: { guestUserId: s.userId, guestFighterId: fighterId, answer },
  });
  if (claimed.count === 0) return Response.json({ error: "Room's full. Two's a fight, three's a crowd." }, { status: 409 });
  return Response.json({ ok: true });
}
