import { FLOORS } from "@/game/dungeon";
import { isAdmin } from "@/lib/auth";
import { db } from "@/lib/db";

// How many Dungeon floors this player has cleared (what they may pick for specials). Admins have every floor.
export async function clearedFloors(s: { userId: string; email: string }): Promise<number> {
  if (isAdmin(s)) return FLOORS;
  return (await db.user.findUnique({ where: { id: s.userId }, select: { dungeonFloor: true } }))?.dungeonFloor ?? 0;
}
