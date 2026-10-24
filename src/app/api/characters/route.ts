import { z } from "zod";
import { getSession, isAdmin } from "@/lib/auth";
import { cleanName } from "@/lib/names";
import { rateLimit, tooMany } from "@/lib/rateLimit";
import { db } from "@/lib/db";
import { MAX_BYTES, sniff, TYPES } from "@/lib/imageType";
import { saveDrawing } from "@/lib/storage";
import { SPECIAL_KINDS, STYLES } from "@/game/moves";
import { analyzeDrawing, type Picks } from "@/lib/vision";
import { ELEMENTS, suggestElement } from "@/lib/stats";

// Measurements from the browser. Untrusted: clamp every number, allow only known words.
const ratio = (max: number) => z.number().finite().transform((v) => Math.min(max, Math.max(0, v)));
const Facts = z.object({
  fill: ratio(1),
  aspect: ratio(5),
  stance: ratio(3),
  armSpread: ratio(3),
  colors: z.array(z.enum(["red", "blue", "green", "yellow", "black"])).max(5),
  item: z.enum(["sword", "mace", "book", "staff", "shield", "bow", "nothing"]),
});

// Explicit choices from the correction panel / builder: known values only.
function parsePicks(form: FormData): Picks {
  const one = <T extends string>(k: string, allowed: readonly T[]) => {
    const v = form.get(k);
    return typeof v === "string" && (allowed as readonly string[]).includes(v) ? (v as T) : undefined;
  };
  return {
    item: one("pick_item", ["sword", "mace", "book", "staff", "shield", "bow", "nothing"] as const),
    style: one("pick_style", STYLES),
    special: one("pick_special", SPECIAL_KINDS),
    element: one("pick_element", ELEMENTS),
    noAi: form.get("builder") === "1",
  };
}

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
    // Admins may fight with any design, so their "mine" is everything.
    return Response.json(await db.character.findMany({ where: isAdmin(s) ? {} : { ownerId: s.userId }, orderBy: { createdAt: "desc" } }));
  }
  return Response.json(await db.character.findMany({ where: { hidden: false }, orderBy: { createdAt: "desc" } }));
}

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return Response.json({ error: "Log in to create a fighter." }, { status: 401 });

  // Each upload costs storage and an AI call: cap bursts and the daily total per player.
  if (!(await rateLimit(`upload-min:${session.userId}`, 4, 60_000)) || !(await rateLimit(`upload-day:${session.userId}`, 25, 86_400_000))) return tooMany("Uploads");

  const form = await request.formData();
  const file = form.get("image");
  if (!(file instanceof File)) return Response.json({ error: "No drawing attached. Did it fall off the table?" }, { status: 400 });
  if (file.size > MAX_BYTES) return Response.json({ error: "Image is over 4MB. Try a smaller photo." }, { status: 400 });

  const bytes = Buffer.from(await file.arrayBuffer());
  const type = sniff(bytes);
  if (!type) return Response.json({ error: "That's not a JPG, PNG, WEBP or GIF." }, { status: 400 });
  const facts = parseFacts(form.get("features"));
  const picks = parsePicks(form);
  const [imageUrl, a] = await Promise.all([saveDrawing(bytes, TYPES[type], type, "cut-"), analyzeDrawing(bytes, type, facts, picks)]);
  const element = picks.element ?? a.element ?? suggestElement(facts?.colors ?? []);
  const item = picks.item ?? facts?.item ?? null;
  const character = await db.character.create({
    data: {
      name: cleanName(form.get("name")) ?? a.name,
      ownerId: session.userId,
      ownerHandle: session.name,
      imageUrl,
      class: a.class,
      hp: a.stats.hp,
      atk: a.stats.atk,
      def: a.stats.def,
      spd: a.stats.spd,
      agi: a.stats.agi,
      iq: a.stats.iq,
      element,
      item,
      specialMove: a.specialMove.name,
      specialDesc: a.specialMove.description,
      specialKind: a.specialKind,
      style: a.style,
      flavorText: a.flavorText,
      detectedItems: JSON.stringify(a.breakdown),
      pose: a.pose ? JSON.stringify(a.pose) : null,
      // The player's own "Turn" wins; otherwise the AI's read of where the head points.
      rotation: [90, 180, 270].includes(Number(form.get("rotation"))) ? Number(form.get("rotation")) : a.rotation,
    },
  });
  return Response.json(character, { status: 201 });
}
