import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { createHash } from "crypto";
import { z } from "zod";
import {
  blendStats,
  CLASSES,
  classFromItems,
  ruleAdjustments,
  ruleStats,
  type Adjustment,
  type CharacterClass,
  type Features,
  type Stats,
} from "./stats";

export const MODEL = "claude-opus-5-5";

export function hasApiKey(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

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
  special_move: z.object({ name: z.string(), description: z.string() }),
  flavor_text: z.string(),
});

export type Analysis = {
  name: string;
  class: CharacterClass;
  stats: Stats;
  specialMove: { name: string; description: string };
  flavorText: string;
  // Persisted in Character.detectedItems so the reveal screen can explain the stats.
  breakdown: {
    source: "claude" | "offline";
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
- a special move whose name and description reference something specific in the drawing (hair, a scribble, a hat, the item...)
- a one-line flavor text, playful trash-talk tone, under 90 characters
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

function build(
  source: "claude" | "offline",
  name: string,
  items: string[],
  features: Features,
  modelStats: Stats | null,
  special: { name: string; description: string },
  flavor: string,
  note?: string,
): Analysis {
  // Class is decided by the item rule, not trusted from the model.
  const cls = classFromItems(items);
  const rule = ruleStats(cls, features);
  return {
    name: name.trim().slice(0, 40) || "Nameless Scribble",
    class: cls,
    stats: blendStats(rule, modelStats),
    specialMove: { name: special.name.slice(0, 40), description: special.description.slice(0, 160) },
    flavorText: flavor.slice(0, 140),
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

// Deterministic stand-in used when there's no API key or the vision call fails twice.
function offlineAnalysis(image: Buffer, note: string): Analysis {
  const h = createHash("sha256").update(image).digest();
  const pick = <T,>(arr: readonly T[], i: number) => arr[h[i] % arr.length];
  const items = pick([[], ["sword"], ["book"], [], ["shield"], ["staff"], ["bow"]], 0);
  const features: Features = {
    size: pick(["small", "medium", "large"] as const, 1),
    pose: pick(["aggressive", "defensive", "neutral"] as const, 2),
    dominant_colors: [pick(["black", "blue", "red", "green"], 3)],
  };
  const first = pick(["Scribbles", "Inky", "Doodle", "Smudge", "Sketchy", "Pencil", "Crayon", "Margin"], 4);
  const last = pick(["McGee", "the Bold", "Von Stick", "Jr.", "Supreme", "the Unerasable"], 5);
  const moves = [
    { name: "Eraser Rush", description: "Charges in so fast the lines blur behind them" },
    { name: "Margin Slam", description: "Body-slams the opponent right off the page" },
    { name: "Ink Splatter", description: "Flicks a wet blot straight at the opponent's face" },
    { name: "Graphite Guard Break", description: "A heavy overhead that snaps through any block" },
  ];
  return build(
    "offline",
    `${first} ${last}`,
    items,
    features,
    null,
    pick(moves, 6),
    "Drawn in thirty seconds, fights like it took thirty years.",
    note,
  );
}

export async function analyzeDrawing(image: Buffer, mediaType: MediaType): Promise<Analysis> {
  if (!hasApiKey()) return offlineAnalysis(image, "Offline mode: set ANTHROPIC_API_KEY for real drawing analysis.");

  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const v = await callClaude(image, mediaType);
      return build(
        "claude",
        v.name,
        v.detected_items.map((i) => i.toLowerCase()),
        v.detected_features,
        v.stats,
        v.special_move,
        v.flavor_text,
      );
    } catch (err) {
      lastError = err;
      console.error(`[vision] attempt ${attempt + 1} failed:`, err);
    }
  }
  const reason = lastError instanceof Error ? lastError.message : "unknown error";
  return offlineAnalysis(image, `Vision analysis failed twice (${reason}); used offline generator.`);
}
