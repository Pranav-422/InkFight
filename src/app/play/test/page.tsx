import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { publicFighter } from "@/lib/rooms";
import { TestClient } from "./TestClient";

export const metadata = { title: "Test match · Inkfight" };

export default async function TestPage() {
  const user = await requireUser("/play/test");
  const mine = await db.character.findMany({ where: { ownerId: user.userId }, orderBy: { createdAt: "desc" } });
  return <TestClient userId={user.userId} mine={mine.map(publicFighter)} />;
}
