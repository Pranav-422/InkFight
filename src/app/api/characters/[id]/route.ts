import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";

export async function GET(_req: Request, ctx: RouteContext<"/api/characters/[id]">) {
  const { id } = await ctx.params;
  const character = await db.character.findUnique({ where: { id } });
  if (!character) return Response.json({ error: "No fighter by that id." }, { status: 404 });
  return Response.json(character);
}

// Owner-only tweaks. For now: rotate a drawing that was photographed sideways.
export async function PATCH(req: Request, ctx: RouteContext<"/api/characters/[id]">) {
  const s = await getSession();
  if (!s) return Response.json({ error: "Log in first." }, { status: 401 });
  const { id } = await ctx.params;
  const c = await db.character.findUnique({ where: { id } });
  if (!c) return Response.json({ error: "No fighter by that id." }, { status: 404 });
  if (c.ownerId !== s.userId) return Response.json({ error: "That's not your fighter." }, { status: 403 });

  const { rotation } = (await req.json().catch(() => ({}))) as { rotation?: number };
  if (![0, 90, 180, 270].includes(Number(rotation))) return Response.json({ error: "Rotation must be 0, 90, 180 or 270." }, { status: 400 });
  const updated = await db.character.update({ where: { id }, data: { rotation: Number(rotation) } });
  return Response.json(updated);
}
