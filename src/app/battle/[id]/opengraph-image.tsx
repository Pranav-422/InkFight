import { db } from "@/lib/db";
import { battleScore, renderCard, resolveFighter, siteOrigin } from "@/lib/shareCard";

export const alt = "An InkFight result";
export const size = { width: 1080, height: 1080 };
export const contentType = "image/png";

// The stored battle's card: the link preview of /battle/[id].
export default async function Image({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const b = await db.battle.findUnique({ where: { id }, select: { characterAId: true, characterBId: true, winnerId: true, log: true } });
  const [A, B] = b ? await Promise.all([resolveFighter(b.characterAId), resolveFighter(b.characterBId)]) : [null, null];
  const wins = b ? battleScore(b.log, b.winnerId === b.characterAId) : null;
  const origin = (await siteOrigin()).replace(/^https?:\/\//, "");
  if (!b || !A || !B || !wins) return renderCard({ name: "?", imageUrl: "" }, { name: "?", imageUrl: "" }, [2, 0], origin);
  return renderCard(A, B, wins, `${origin}/battle/${id}`);
}
