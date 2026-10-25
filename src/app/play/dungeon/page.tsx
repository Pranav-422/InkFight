import type { Metadata } from "next";
import { isAdmin, requireUser, sessionBuff } from "@/lib/auth";
import { db } from "@/lib/db";
import { publicFighter } from "@/lib/rooms";
import { DungeonClient } from "./DungeonClient";

export const metadata: Metadata = { title: "The Dungeon · InkFight" };
export const dynamic = "force-dynamic";

export default async function DungeonPage() {
  const user = await requireUser("/play/dungeon");
  const [me, fighters] = await Promise.all([
    db.user.findUnique({ where: { id: user.userId }, select: { dungeonFloor: true } }),
    db.character.findMany({ where: isAdmin(user) ? {} : { ownerId: user.userId }, orderBy: { createdAt: "desc" } }),
  ]);
  const buff = await sessionBuff(user);
  return <DungeonClient userId={user.userId} cleared={me?.dungeonFloor ?? 0} mine={fighters.map((c) => publicFighter(c, buff))} />;
}
