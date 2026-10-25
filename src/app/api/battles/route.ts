import { rateLimit, tooMany } from "@/lib/rateLimit";
import { buffOn, getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { isArenaId } from "@/game/arena";

// Arena fights (src/game/arena.ts) are reported like any online fight and show on the leaderboard. A draw (equal health at
// 5:00) has no winner, so it is refused below and never stored. Set false to keep arena fights off the leaderboard.
const RECORD_ARENA = true;

// The host's browser runs the fight and reports the result once per match.
export async function POST(req: Request) {
  const s = await getSession();
  if (!s) return Response.json({ error: "Log in first." }, { status: 401 });
  if (!(await rateLimit(`battle:${s.userId}`, 20, 60_000))) return tooMany();
  const body = (await req.json().catch(() => ({}))) as {
    roomCode?: string;
    matchId?: string;
    winnerSlot?: number;
    wins?: number[];
    damage?: number[];
    rounds?: number;
    mode?: string; // an arena id (the host's pick), absent for the normal best-of-3
  };
  const room = body.roomCode ? await db.room.findUnique({ where: { code: body.roomCode } }) : null;
  if (!room || room.hostUserId !== s.userId || !room.guestFighterId) return Response.json({ error: "Not your room." }, { status: 403 });
  if (body.winnerSlot !== 0 && body.winnerSlot !== 1) return Response.json({ error: "Bad result." }, { status: 400 });
  if (room.hostFighterId === room.guestFighterId) return Response.json({ ok: true, skipped: "mirror match" });
  const arena = isArenaId(body.mode) ? body.mode : null;
  if (arena && !RECORD_ARENA) return Response.json({ ok: true, skipped: "arena fight" });
  const players = await db.user.findMany({ where: { id: { in: [room.hostUserId, room.guestUserId ?? ""] } }, select: { email: true, buff: true } });
  if (players.some(buffOn)) return Response.json({ ok: true, skipped: "admin buff" });

  const matchId = String(body.matchId ?? "").slice(0, 32);
  if (!matchId) return Response.json({ error: "Bad result." }, { status: 400 });
  try {
    await db.battle.create({
      data: {
        characterAId: room.hostFighterId,
        characterBId: room.guestFighterId,
        winnerId: body.winnerSlot === 0 ? room.hostFighterId : room.guestFighterId,
        matchKey: `${room.code}:${matchId}`,
        log: JSON.stringify({ mode: arena ? `arena-${arena}` : "p2p", wins: body.wins, damage: body.damage, rounds: body.rounds }),
      },
    });
  } catch {
    return Response.json({ ok: true, duplicate: true });
  }
  return Response.json({ ok: true });
}
