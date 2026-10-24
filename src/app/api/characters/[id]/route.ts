import { getSession, isAdmin, type Session } from "@/lib/auth";
import { db } from "@/lib/db";
import { cleanName } from "@/lib/names";
import { rateLimit, tooMany } from "@/lib/rateLimit";
import { deleteDrawing } from "@/lib/storage";

export async function GET(_req: Request, ctx: RouteContext<"/api/characters/[id]">) {
  const { id } = await ctx.params;
  const character = await db.character.findUnique({ where: { id } });
  if (!character) return Response.json({ error: "No fighter by that id." }, { status: 404 });
  return Response.json(character);
}

// Owner (or admin) only. The demo accounts' starters are shared by everyone who logs
// into them, so only an admin may rename or delete those.
async function editable(ctx: RouteContext<"/api/characters/[id]">) {
  const s = await getSession();
  if (!s) return { error: Response.json({ error: "Log in first." }, { status: 401 }) };
  if (!(await rateLimit(`edit:${s.userId}`, 60, 60_000))) return { error: tooMany() };
  const { id } = await ctx.params;
  const c = await db.character.findUnique({ where: { id } });
  if (!c) return { error: Response.json({ error: "No fighter by that id." }, { status: 404 }) };
  const admin = isAdmin(s);
  if (c.ownerId !== s.userId && !admin) return { error: Response.json({ error: "That's not your fighter." }, { status: 403 }) };
  if (c.imageUrl.startsWith("/samples/") && !admin) return { error: Response.json({ error: "Starter fighters can't be changed." }, { status: 403 }) };
  return { s: s as Session, c };
}

export async function PATCH(req: Request, ctx: RouteContext<"/api/characters/[id]">) {
  const r = await editable(ctx);
  if (r.error) return r.error;
  const body = (await req.json().catch(() => ({}))) as { rotation?: unknown; name?: unknown; cpu?: unknown; hidden?: unknown; flipItem?: unknown };
  const data: { rotation?: number; name?: string; cpu?: boolean; hidden?: boolean; flipItem?: boolean } = {};
  // Moderation flags are admin-only.
  for (const k of ["cpu", "hidden"] as const) {
    if (body[k] === undefined) continue;
    if (!isAdmin(r.s) || typeof body[k] !== "boolean") return Response.json({ error: "Only admins can change that." }, { status: 403 });
    data[k] = body[k];
  }
  if (body.rotation !== undefined) {
    if (![0, 90, 180, 270].includes(Number(body.rotation))) return Response.json({ error: "Rotation must be 0, 90, 180 or 270." }, { status: 400 });
    data.rotation = Number(body.rotation);
  }
  if (body.flipItem !== undefined) {
    if (typeof body.flipItem !== "boolean") return Response.json({ error: "flipItem must be true or false." }, { status: 400 });
    data.flipItem = body.flipItem;
  }
  if (body.name !== undefined) {
    const name = cleanName(body.name);
    if (!name) return Response.json({ error: "Names need 2 to 32 characters." }, { status: 400 });
    data.name = name;
  }
  if (!Object.keys(data).length) return Response.json({ error: "Nothing to change." }, { status: 400 });
  return Response.json(await db.character.update({ where: { id: r.c.id }, data }));
}

export async function DELETE(_req: Request, ctx: RouteContext<"/api/characters/[id]">) {
  const r = await editable(ctx);
  if (r.error) return r.error;
  await db.character.delete({ where: { id: r.c.id } }); // its battles go with it (cascade)
  await deleteDrawing(r.c.imageUrl);
  return Response.json({ ok: true });
}
