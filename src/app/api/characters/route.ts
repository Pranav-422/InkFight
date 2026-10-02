import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { saveDrawing } from "@/lib/storage";
import { analyzeDrawing } from "@/lib/vision";

const TYPES = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif" } as const;
const MAX_BYTES = 4 * 1024 * 1024; // Vercel functions cap request bodies at 4.5MB

export async function GET(request: Request) {
  const mine = new URL(request.url).searchParams.get("mine") === "1";
  if (mine) {
    const s = await getSession();
    if (!s) return Response.json({ error: "Log in first." }, { status: 401 });
    return Response.json(await db.character.findMany({ where: { ownerId: s.userId }, orderBy: { createdAt: "desc" } }));
  }
  return Response.json(await db.character.findMany({ orderBy: { createdAt: "desc" } }));
}

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return Response.json({ error: "Log in to create a fighter." }, { status: 401 });

  const form = await request.formData();
  const file = form.get("image");
  if (!(file instanceof File)) return Response.json({ error: "No drawing attached. Did it fall off the table?" }, { status: 400 });
  const ext = TYPES[file.type as keyof typeof TYPES];
  if (!ext) return Response.json({ error: "That's not a JPG, PNG, WEBP or GIF." }, { status: 400 });
  if (file.size > MAX_BYTES) return Response.json({ error: "Image is over 4MB. Try a smaller photo." }, { status: 400 });

  const bytes = Buffer.from(await file.arrayBuffer());
  const [imageUrl, a] = await Promise.all([
    saveDrawing(bytes, ext, file.type),
    analyzeDrawing(bytes, file.type as keyof typeof TYPES),
  ]);
  const character = await db.character.create({
    data: {
      name: a.name,
      ownerId: session.userId,
      ownerHandle: session.name,
      imageUrl,
      class: a.class,
      ...a.stats,
      specialMove: a.specialMove.name,
      specialDesc: a.specialMove.description,
      flavorText: a.flavorText,
      detectedItems: JSON.stringify(a.breakdown),
    },
  });
  return Response.json(character, { status: 201 });
}
