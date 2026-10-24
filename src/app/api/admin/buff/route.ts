import { getSession, isAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { rateLimit, tooMany } from "@/lib/rateLimit";

// Admin only: switch the admin's own buff on or off (see BUFF in src/game/sim.ts).
export async function PATCH(req: Request) {
  const s = await getSession();
  if (!s || !isAdmin(s)) return Response.json({ error: "Only admins can do that." }, { status: 403 });
  if (!(await rateLimit(`edit:${s.userId}`, 60, 60_000))) return tooMany();
  const { on } = (await req.json().catch(() => ({}))) as { on?: unknown };
  if (typeof on !== "boolean") return Response.json({ error: "Send { on: true | false }." }, { status: 400 });
  await db.user.update({ where: { id: s.userId }, data: { buff: on } });
  return Response.json({ ok: true, buff: on });
}
