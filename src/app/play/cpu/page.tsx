import { isAdmin, requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { publicFighter } from "@/lib/rooms";
import { CpuClient } from "./CpuClient";

export default async function CpuPage({ searchParams }: PageProps<"/play/cpu">) {
  const { opponent, fighter } = await searchParams;
  const user = await requireUser(`/play/cpu${typeof opponent === "string" ? `?opponent=${opponent}` : ""}`);
  const all = await db.character.findMany({ orderBy: { createdAt: "desc" } });
  // Admins can pick any design for either side; players get their own vs the CPU roster.
  const admin = isAdmin(user);
  const mine = admin ? all : all.filter((c) => c.ownerId === user.userId);
  const roster = admin ? all : all.filter((c) => c.cpu && !c.hidden);
  return (
    <CpuClient
      userId={user.userId}
      mine={mine.map(publicFighter)}
      gallery={roster.map((c) => ({ ...publicFighter(c), ownerHandle: c.ownerHandle }))}
      initialOpponent={typeof opponent === "string" ? opponent : null}
      initialFighter={typeof fighter === "string" ? fighter : null}
    />
  );
}
