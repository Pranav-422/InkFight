import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { createHash } from "crypto";
import { z } from "zod";
import { CLASS_SPECIAL_POOL, CLASS_STYLE, SPECIAL_INFO, SPECIAL_KINDS, SPECIAL_NAMES, STYLE_INFO, STYLES, type SpecialKind, type Style } from "@/game/moves";
import {
  blendStats,
  CLASSES,
  classFromItems,
  ruleAdjustments,
  ruleStats,
  type Adjustment,
  type CharacterClass,
  featuresFromMeasurements,
  type Features,
  type Measurements,
  type Stats,
} from "./stats";

// What the browser measured on the drawing, plus the item the user confirmed.
export type DrawingFacts = Measurements & { colors: string[]; item: string };

export const MODEL = "claude-opus-5-5";
// Gemini decides when GEMINI_API_KEY is set (it wins over Claude); GEMINI_MODEL overrides the model.
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-3.8-flash";

type Provider = "gemini" | "claude";
const provider = (): Provider | null => (process.env.GEMINI_API_KEY ? "gemini" : process.env.ANTHROPIC_API_KEY ? "claude" : null);

export function hasApiKey(): boolean {
  return provider() !== null;
}

const Point = z.object({ x: z.number(), y: z.number() });

const VisionSchema = z.object({
  name: z.string().describe("A short, punchy fighter name inspired by the drawing"),
  class: z.enum(CLASSES),
  detected_items: z.array(z.string()).describe("Held items/props, lowercase single nouns, e.g. ['book']"),
  detected_features: z.object({
    size: z.enum(["small", "medium", "large"]),
    pose: z.enum(["aggressive", "defensive", "neutral"]),
    dominant_colors: z.array(z.string()),
  }),
  stats: z.object({ hp: z.number(), atk: z.number(), def: z.number(), spd: z.number() }),
  special_move: z.object({
    kind: z.enum(SPECIAL_KINDS).describe("Which special-move building block fits this fighter"),
    name: z.string(),
    description: z.string(),
  }),
  fighting_style: z.enum(STYLES).describe("The fighting style that fits the drawing's look and pose"),
  flavor_text: z.string(),
  head_points: z.enum(["up", "left", "right", "down"]).describe("Which edge of the image the figure's head points toward (up = drawn upright)"),
  // Where the body parts are, as fractions of the image (x: 0 = left, y: 0 = top). Used to animate the drawing like a puppet.
  pose: z.object({
    head: Point,
    shoulder: Point,
    hip: Point,
    left_elbow: Point,
    left_hand: Point,
    right_elbow: Point,
    right_hand: Point,
    left_knee: Point,
    left_foot: Point,
    right_knee: Point,
    right_foot: Point,
  }),
});

export type PoseKeypoints = z.infer<typeof VisionSchema>["pose"];

export type Analysis = {
  name: string;
  class: CharacterClass;
  stats: Stats;
  specialMove: { name: string; description: string };
  specialKind: SpecialKind;
  style: Style;
  flavorText: string;
  pose: PoseKeypoints | null;
  rotation: number; // degrees clockwise to stand the drawing upright
  // Persisted in Character.detectedItems so the reveal screen can explain the stats.
  breakdown: {
    source: "claude" | "gemini" | "offline";
    items: string[];
    features: Features;
    classReason: string;
    ruleStats: Stats;
    modelStats: Stats | null;
    adjustments: Adjustment[];
    note?: string;
  };
};

const SYSTEM = `You analyze photos of hand-drawn stick-figure characters for a friendly fighting game.
Look only at what is actually drawn. Report:
- held items/props as lowercase nouns (empty list if empty-handed)
- the class implied by the items: book→Mage, sword/blade→Warrior, staff/wand→Caster, shield→Tank, bow→Ranger, nothing→Brawler
- size of the figure relative to the page (small/medium/large), pose (aggressive/defensive/neutral), and dominant ink colors
- proposed stats within HP 60-140, ATK 40-90, DEF 40-90, SPD 40-90
- a special move. First pick its kind, the one that best matches the drawing's vibe:
${SPECIAL_KINDS.map((k) => `  - ${k}: ${SPECIAL_INFO[k].looks}`).join("\n")}
  Then name it like an over-the-top anime finisher that only THIS drawing could have: riff on something specific you see (the hair, a scribble, a hat, the item, the ink colour, the paper). Puns, fake-Japanese-sounding names and homages to famous anime moves are welcome (e.g. "Ink-ame-hameha", "Scribble-gan"), but make it fresh, never a straight copy. Description: one vivid sentence of what it looks like
- a fighting style, from how the figure stands and what it looks like:
${STYLES.map((s) => `  - ${s}: ${STYLE_INFO[s].blurb}`).join("\n")}
- a one-line flavor text, playful trash-talk tone, under 90 characters
- which edge of the image the head points toward (the drawing may be sideways in the photo)
- the pose: where the figure's head center, shoulder (where the arms meet the body), hip (where the legs meet the body), both elbows, hands, knees and feet are, as fractions of the whole image (x from the left edge, y from the top edge). "left"/"right" mean the image's left/right side. If a joint isn't drawn (stick arms have no elbow), give the midpoint of that limb
If the image is not a drawing of a character, still do your best with whatever is drawn.`;

type MediaType = "image/jpeg" | "image/png" | "image/webp" | "image/gif";

async function callClaude(image: Buffer, mediaType: MediaType) {
  const client = new Anthropic();
  const response = await client.beta.messages.parse({
    model: MODEL,
    max_tokens: 4000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    output_config: { effort: "low", format: betaZodOutputFormat(VisionSchema) },
    system: SYSTEM,
    messages: [
      {
        role: "user",
        content: [
          { type: "image", source: { type: "base64", media_type: mediaType, data: image.toString("base64") } },
          { type: "text", text: "Turn this drawing into a fighter." },
        ],
      },
    ],
  });
  if (response.stop_reason === "refusal") throw new Error("Model declined to analyze this image");
  const parsed = response.parsed_output;
  if (!parsed || !parsed.class || !parsed.special_move?.name) throw new Error("Vision output failed validation");
  return parsed;
}

// Same analysis through Gemini's REST API (no extra dependency). JSON mode plus the
// schema in the prompt, then the reply is validated with the same zod schema.
async function callGemini(image: Buffer, mediaType: MediaType) {
  const schema = JSON.stringify(z.toJSONSchema(VisionSchema));
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(GEMINI_MODEL)}:generateContent`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": process.env.GEMINI_API_KEY! },
    body: JSON.stringify({
      system_instruction: { parts: [{ text: `${SYSTEM}\n\nReply with only a JSON object matching this JSON Schema:\n${schema}` }] },
      contents: [
        {
          role: "user",
          parts: [{ inline_data: { mime_type: mediaType, data: image.toString("base64") } }, { text: "Turn this drawing into a fighter." }],
        },
      ],
      generationConfig: { responseMimeType: "application/json", temperature: 1 },
    }),
    signal: AbortSignal.timeout(45_000),
  });
  if (!res.ok) throw new Error(`Gemini ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const data = (await res.json()) as { candidates?: { content?: { parts?: { text?: string }[] }; finishReason?: string }[] };
  const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
  if (!text) throw new Error(`Gemini returned no text (${data.candidates?.[0]?.finishReason ?? "no candidates"})`);
  const parsed = VisionSchema.safeParse(JSON.parse(text.replace(/^```(?:json)?\s*|\s*```$/g, "")));
  if (!parsed.success) throw new Error(`Gemini output failed validation: ${parsed.error.message.slice(0, 200)}`);
  return parsed.data;
}

function build(
  source: Provider | "offline",
  name: string,
  items: string[],
  features: Features,
  modelStats: Stats | null,
  special: { kind: SpecialKind; name: string; description: string },
  style: Style,
  flavor: string,
  pose: PoseKeypoints | null,
  note?: string,
  rotation = 0,
): Analysis {
  // Class is decided by the item rule, not trusted from the model.
  const cls = classFromItems(items);
  const rule = ruleStats(cls, features);
  return {
    name: name.trim().slice(0, 40) || "Nameless Scribble",
    class: cls,
    stats: blendStats(rule, modelStats),
    specialMove: { name: special.name.slice(0, 40), description: special.description.slice(0, 160) },
    specialKind: special.kind,
    style,
    flavorText: flavor.slice(0, 140),
    pose,
    rotation,
    breakdown: {
      source,
      items,
      features,
      classReason: items.length ? `Holding ${items.join(", ")} → ${cls}` : `Empty-handed → ${cls}`,
      ruleStats: rule,
      modelStats,
      adjustments: ruleAdjustments(features),
      note,
    },
  };
}

// Keep only plausible keypoints (all inside the image, feet below the head).
function validPose(p: PoseKeypoints): PoseKeypoints | null {
  const pts = Object.values(p);
  const inside = pts.every((q) => q.x >= -0.05 && q.x <= 1.05 && q.y >= -0.05 && q.y <= 1.05);
  return inside ? p : null; // orientation is handled by head_points → rotation
}

const itemList = (f: DrawingFacts) => (f.item === "nothing" ? [] : [f.item]);

// Offline fighting style from the drawing's shape: arms out → a boxer, wide legs → Muay
// Thai, tall and thin → Taekwondo kicks, bulky → a street fighter.
function styleFromLook(f: Features, cls: CharacterClass, roll: number): Style {
  const m = f.measured;
  if (m?.armSpread !== undefined && m.armSpread > 0.6) return "Boxing";
  if (m && m.stance > 0.45) return "Muay Thai";
  if (m && m.aspect < 0.4) return "Taekwondo";
  if (f.size === "large") return "Street";
  return roll % 3 === 0 ? "Karate" : roll % 3 === 1 ? "Systema" : CLASS_STYLE[cls];
}

// Used when there's no API key or the vision call fails twice. Stats come from the
// browser's measurements; the hash only picks a name and special.
function offlineAnalysis(image: Buffer, note: string, facts: DrawingFacts | null): Analysis {
  const h = createHash("sha256").update(image).digest();
  const pick = <T,>(arr: readonly T[], i: number) => arr[h[i] % arr.length];
  // No measurements (an old client): fall back to guesses, and say so.
  const items = facts ? itemList(facts) : pick([[], ["sword"], ["book"], [], ["shield"], ["staff"], ["bow"]], 0);
  const features: Features = facts
    ? featuresFromMeasurements(facts, facts.colors)
    : {
        size: pick(["small", "medium", "large"] as const, 1),
        pose: pick(["aggressive", "defensive", "neutral"] as const, 2),
        dominant_colors: [pick(["black", "blue", "red", "green"], 3)],
      };
  if (!facts) note += " No measurements were sent, so size and pose are guesses.";
  const first = pick(["Scribbles", "Inky", "Doodle", "Smudge", "Sketchy", "Pencil", "Crayon", "Margin"], 4);
  const last = pick(["McGee", "the Bold", "Von Stick", "Jr.", "Supreme", "the Unerasable"], 5);
  const cls = classFromItems(items);
  const kind = pick(CLASS_SPECIAL_POOL[cls] ?? ["uppercut"], 6);
  const [name, description] = pick(SPECIAL_NAMES[kind], 7);
  return build(
    "offline",
    `${first} ${last}`,
    items,
    features,
    null,
    { kind, name, description },
    styleFromLook(features, cls, h[8]),
    "Drawn in thirty seconds, fights like it took thirty years.",
    null, // the browser estimates the skeleton from the ink
    note,
  );
}

export async function analyzeDrawing(image: Buffer, mediaType: MediaType, facts: DrawingFacts | null = null): Promise<Analysis> {
  const ai = provider();
  if (!ai) return offlineAnalysis(image, "Offline mode: name and special are generated, stats come from your drawing's measurements.", facts);

  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const v = ai === "gemini" ? await callGemini(image, mediaType) : await callClaude(image, mediaType);
      const seen = v.detected_items.map((i) => i.toLowerCase());
      return build(
        ai,
        v.name,
        // The AI's read of the item wins when it saw one; otherwise trust the user's pick.
        seen.length || !facts ? seen : itemList(facts),
        facts ? featuresFromMeasurements(facts, v.detected_features.dominant_colors) : v.detected_features,
        v.stats,
        v.special_move,
        v.fighting_style,
        v.flavor_text,
        validPose(v.pose),
        undefined,
        ({ up: 0, left: 90, down: 180, right: 270 } as const)[v.head_points] ?? 0,
      );
    } catch (err) {
      lastError = err;
      console.error(`[vision] attempt ${attempt + 1} failed:`, err);
    }
  }
  const reason = lastError instanceof Error ? lastError.message : "unknown error";
  return offlineAnalysis(image, `Vision analysis failed twice (${reason}); used offline generator.`, facts);
}
