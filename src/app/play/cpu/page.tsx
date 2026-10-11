import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { publicFighter } from "@/lib/rooms";
import { CpuClient } from "./CpuClient";

export default async function CpuPage({ searchParams }: PageProps<"/play/cpu">) {
  const { opponent, fighter } = await searchParams;
  const user = await requireUser(`/play/cpu${typeof opponent === "string" ? `?opponent=${opponent}` : ""}`);
  const all = await db.character.findMany({ orderBy: { createdAt: "desc" } });
  const mine = all.filter((c) => c.ownerId === user.userId);
  return (
    <CpuClient
      userId={user.userId}
      mine={mine.map(publicFighter)}
      gallery={all.map((c) => ({ ...publicFighter(c), ownerHandle: c.ownerHandle }))}
      initialOpponent={typeof opponent === "string" ? opponent : null}
      initialFighter={typeof fighter === "string" ? fighter : null}
    />
  );
}
