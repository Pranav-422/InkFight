import type { Character } from "@prisma/client";
import { db } from "./db";

export type LeaderboardEntry = Character & { wins: number; losses: number; winRate: number };

export async function getLeaderboard(): Promise<LeaderboardEntry[]> {
  const [characters, battles] = await Promise.all([
    db.character.findMany(),
    db.battle.findMany({ select: { characterAId: true, characterBId: true, winnerId: true } }),
  ]);
  const record = new Map<string, { wins: number; losses: number }>();
  for (const c of characters) record.set(c.id, { wins: 0, losses: 0 });
  for (const b of battles) {
    const loser = b.winnerId === b.characterAId ? b.characterBId : b.characterAId;
    const w = record.get(b.winnerId);
    const l = record.get(loser);
    if (w) w.wins++;
    if (l) l.losses++;
  }
  return characters
    .map((c) => {
      const r = record.get(c.id)!;
      const total = r.wins + r.losses;
      return { ...c, ...r, winRate: total ? r.wins / total : 0 };
    })
    .sort((a, b) => b.wins - a.wins || b.winRate - a.winRate || a.losses - b.losses || +a.createdAt - +b.createdAt);
}
