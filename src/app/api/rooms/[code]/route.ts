import { ROOM_CODE } from "@/game/protocol";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { isStale, publicFighter } from "@/lib/rooms";

// Room state for signaling. Polled by both peers while connecting.
export async function GET(_req: Request, ctx: RouteContext<"/api/rooms/[code]">) {
  const s = await getSession();
  if (!s) return Response.json({ error: "Log in first." }, { status: 401 });
  const code = (await ctx.params).code.toUpperCase();
  const room = await db.room.findUnique({ where: { code } });
  if (!room || isStale(room)) return Response.json({ exists: false, you: s.userId });

  const [host, guest] = await Promise.all([
    db.character.findUnique({ where: { id: room.hostFighterId } }),
    room.guestFighterId ? db.character.findUnique({ where: { id: room.guestFighterId } }) : null,
  ]);
  return Response.json({
    exists: true,
    you: s.userId,
    isHost: room.hostUserId === s.userId,
    full: Boolean(room.answer) && room.guestUserId !== s.userId && room.hostUserId !== s.userId,
    offer: room.offer,
    answer: room.answer,
    hostFighter: host ? publicFighter(host) : null,
    guestFighter: guest ? publicFighter(guest) : null,
    version: room.updatedAt.getTime(),
  });
}

// Host creates the room (or re-creates it after a refresh / lost guest).
export async function POST(req: Request, ctx: RouteContext<"/api/rooms/[code]">) {
  const s = await getSession();
  if (!s) return Response.json({ error: "Log in first." }, { status: 401 });
  const code = (await ctx.params).code.toUpperCase();
  if (!ROOM_CODE.test(code)) return Response.json({ error: "That room code looks wrong." }, { status: 400 });

  const { fighterId, offer } = (await req.json().catch(() => ({}))) as { fighterId?: string; offer?: string };
  if (!fighterId || !offer || offer.length > 20000) return Response.json({ error: "Bad offer." }, { status: 400 });
  const fighter = await db.character.findUnique({ where: { id: fighterId } });
  if (!fighter || fighter.ownerId !== s.userId) return Response.json({ error: "Pick one of your own fighters." }, { status: 403 });

  const existing = await db.room.findUnique({ where: { code } });
  if (existing && !isStale(existing) && existing.hostUserId !== s.userId) {
    return Response.json({ error: "Someone else is hosting this room." }, { status: 409 });
  }
  const data = { hostUserId: s.userId, hostFighterId: fighterId, offer, answer: null, guestUserId: null, guestFighterId: null };
  try {
    await db.room.upsert({ where: { code }, create: { code, ...data }, update: data });
  } catch {
    // Two people created the same code at once: the loser becomes the guest.
    return Response.json({ error: "Someone else is hosting this room." }, { status: 409 });
  }
  return Response.json({ ok: true });
}
