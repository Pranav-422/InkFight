import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";

// The host's browser runs the fight and reports the result once per match.
export async function POST(req: Request) {
  const s = await getSession();
  if (!s) return Response.json({ error: "Log in first." }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as {
    roomCode?: string;
    matchId?: string;
    winnerSlot?: number;
    wins?: number[];
    damage?: number[];
    rounds?: number;
  };
  const room = body.roomCode ? await db.room.findUnique({ where: { code: body.roomCode } }) : null;
  if (!room || room.hostUserId !== s.userId || !room.guestFighterId) return Response.json({ error: "Not your room." }, { status: 403 });
  if (body.winnerSlot !== 0 && body.winnerSlot !== 1) return Response.json({ error: "Bad result." }, { status: 400 });
  if (room.hostFighterId === room.guestFighterId) return Response.json({ ok: true, skipped: "mirror match" });

  const matchId = String(body.matchId ?? "").slice(0, 32);
  if (!matchId) return Response.json({ error: "Bad result." }, { status: 400 });
  try {
    await db.battle.create({
      data: {
        characterAId: room.hostFighterId,
        characterBId: room.guestFighterId,
        winnerId: body.winnerSlot === 0 ? room.hostFighterId : room.guestFighterId,
        matchKey: `${room.code}:${matchId}`,
        log: JSON.stringify({ mode: "p2p", wins: body.wins, damage: body.damage, rounds: body.rounds }),
      },
    });
  } catch {
    return Response.json({ ok: true, duplicate: true });
  }
  return Response.json({ ok: true });
}
