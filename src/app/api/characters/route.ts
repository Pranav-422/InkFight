import { z } from "zod";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { saveDrawing } from "@/lib/storage";
import { analyzeDrawing } from "@/lib/vision";

const TYPES = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif" } as const;
const MAX_BYTES = 4 * 1024 * 1024; // Vercel functions cap request bodies at 4.5MB

// Measurements from the browser. Untrusted: clamp every number, allow only known words.
const ratio = (max: number) => z.number().finite().transform((v) => Math.min(max, Math.max(0, v)));
const Facts = z.object({
  fill: ratio(1),
  aspect: ratio(5),
  stance: ratio(3),
  armSpread: ratio(3),
  colors: z.array(z.enum(["red", "blue", "green", "yellow", "black"])).max(5),
  item: z.enum(["sword", "book", "staff", "shield", "bow", "nothing"]),
});

function parseFacts(raw: FormDataEntryValue | null) {
  if (typeof raw !== "string") return null;
  try {
    const r = Facts.safeParse(JSON.parse(raw));
    return r.success ? r.data : null;
  } catch {
    return null;
  }
}

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
    analyzeDrawing(bytes, file.type as keyof typeof TYPES, parseFacts(form.get("features"))),
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
      specialKind: a.specialKind,
      style: a.style,
      flavorText: a.flavorText,
      detectedItems: JSON.stringify(a.breakdown),
      pose: a.pose ? JSON.stringify(a.pose) : null,
      rotation: a.rotation,
    },
  });
  return Response.json(character, { status: 201 });
}
