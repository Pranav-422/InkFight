import { getSession, isAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { CUT_PREFIX } from "@/lib/cutout";
import { MAX_BYTES, sniff, TYPES } from "@/lib/imageType";
import { rateLimit, tooMany } from "@/lib/rateLimit";
import { deleteDrawing, saveDrawing } from "@/lib/storage";

// Admin only: swap a fighter's stored photo (or a pre-Sprint-4 white cut-out) for a transparent cut-out (made in the
// admin's browser, see the re-cut tool on /admin), then delete the old file. The new file name carries CUT_PREFIX, which
// is what marks the row as done.
export async function PUT(req: Request, ctx: RouteContext<"/api/characters/[id]/image">) {
  const s = await getSession();
  if (!s || !isAdmin(s)) return Response.json({ error: "Only admins can do that." }, { status: 403 });
  if (!(await rateLimit(`recut:${s.userId}`, 120, 60_000))) return tooMany();
  const { id } = await ctx.params;
  const c = await db.character.findUnique({ where: { id } });
  if (!c) return Response.json({ error: "No fighter by that id." }, { status: 404 });
  if (c.imageUrl.startsWith("/samples/")) return Response.json({ error: "Starter art stays as it is." }, { status: 400 });

  const file = (await req.formData()).get("image");
  if (!(file instanceof File) || file.size > MAX_BYTES) return Response.json({ error: "Bad image." }, { status: 400 });
  const bytes = Buffer.from(await file.arrayBuffer());
  const type = sniff(bytes);
  if (!type) return Response.json({ error: "Bad image." }, { status: 400 });

  const imageUrl = await saveDrawing(bytes, TYPES[type], type, CUT_PREFIX);
  // The cut-out is upright, and the AI keypoints were fractions of the old photo: the
  // browser estimates the joints again from the new image.
  const updated = await db.character.update({ where: { id }, data: { imageUrl, rotation: 0, pose: null } });
  await deleteDrawing(c.imageUrl);
  return Response.json(updated);
}
