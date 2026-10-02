import { db } from "@/lib/db";

export async function GET(_req: Request, ctx: RouteContext<"/api/characters/[id]">) {
  const { id } = await ctx.params;
  const character = await db.character.findUnique({ where: { id } });
  if (!character) return Response.json({ error: "No fighter by that id." }, { status: 404 });
  return Response.json(character);
}
