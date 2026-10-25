import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { SecurityForm } from "./SecurityForm";

export const metadata = { title: "Security question · InkFight" };

export default async function SecurityPage({ searchParams }: PageProps<"/security">) {
  const { next } = await searchParams;
  const nextPath = typeof next === "string" && next.startsWith("/") && !next.startsWith("//") ? next : "/home";
  const s = await requireUser(`/security?next=${encodeURIComponent(nextPath)}`);
  const user = await db.user.findUnique({ where: { id: s.userId }, select: { securityQuestion: true } });
  return (
    <div className="py-6">
      <SecurityForm next={nextPath} current={user?.securityQuestion ?? null} />
    </div>
  );
}
