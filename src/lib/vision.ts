import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { createHash } from "crypto";
import { z } from "zod";
import { CLASS_SPECIAL_POOL, CLASS_STYLE, CLASS_ULT, SPECIAL_INFO, SPECIAL_KINDS, SPECIAL_NAMES, STYLE_INFO, STYLES, ULT_NAMES, type SpecialKind, type Style } from "@/game/moves";
import {
  blendStats,
  CLASSES,
  classFromItems,
  ELEMENTS,
  featuresFromMeasurements,
  ruleAdjustments,
  ruleStats,
  suggestElement,
  type Adjustment,
  type CharacterClass,
  type Features,
  type Measurements,
  type StatLine,
  type Stats,
} from "./stats";

// What the browser measured on the drawing, plus the item the user confirmed.
export type DrawingFacts = Measurements & { colors: string[]; item: string };

// What the player chose explicitly (correction panel or the category builder). These
// always win over the AI. noAi: the image is our own rendering (builder), skip vision.
export type Picks = { item?: string; style?: Style; special?: SpecialKind; ult?: SpecialKind; element?: string; noAi?: boolean };

// A special the player picked gets a generated name, unless the AI named that same kind.
function pickSpecial(p: Picks, ai: { kind: SpecialKind; name: string; description: string }, roll: number) {
  if (!p.special || p.special === ai.kind) return ai;
  const [name, description] = SPECIAL_NAMES[p.special][roll % SPECIAL_NAMES[p.special].length];
  return { kind: p.special, name, description };
}

// The same for the ultimate (S + L): the player's pick gets a generated name, unless the AI named that kind. An
// ultimate that repeats slot 1 is moved on to the class's own, so the two slots are never the same move.
type Named = { kind: SpecialKind; name: string; description: string };
function pickUlt(p: Picks, ai: Named | undefined, slot1: SpecialKind, cls: CharacterClass, roll: number): Named {
  const want = p.ult ?? ai?.kind;
  const kind = want && (p.ult || want !== slot1) ? want : slot1 !== CLASS_ULT[cls] ? CLASS_ULT[cls] : (CLASS_SPECIAL_POOL[cls] ?? SPECIAL_KINDS).find((k) => k !== slot1) ?? "meteor";
  if (ai && kind === ai.kind) return ai;
  const [name, description] = ULT_NAMES[kind][roll % ULT_NAMES[kind].length];
  return { kind, name, description };
}

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
  element: z.enum(ELEMENTS).describe("An elemental affinity (FIRE, ELECTRIC, FROST, POISON, BLEED, GRAVITY, or NONE) suggested by ink colors or weapon vibe"),
  detected_items: z.array(z.string()).describe("Held items/props, lowercase single nouns, e.g. ['book']"),
  detected_features: z.object({
    size: z.enum(["small", "medium", "large"]),
    pose: z.enum(["aggressive", "defensive", "neutral"]),
    dominant_colors: z.array(z.string()),
  }),
  stats: z.object({ hp: z.number(), atk: z.number(), def: z.number(), spd: z.number(), agi: z.number(), iq: z.number() }),
  special_move: z.object({
    kind: z.enum(SPECIAL_KINDS).describe("Which special-move building block fits this fighter"),
    name: z.string(),
    description: z.string(),
  }),
  ultimate: z
    .object({
      kind: z.enum(SPECIAL_KINDS).describe("A different building block from special_move: the finisher this fighter saves up for"),
      name: z.string(),
      description: z.string(),
    })
    .optional(),
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
  element: string;
  specialMove: { name: string; description: string };
  specialKind: SpecialKind;
  ultimate: { kind: SpecialKind; name: string; description: string };
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
    modelStats: StatLine | null;
    adjustments: Adjustment[];
    note?: string;
  };
};

const SYSTEM = `You analyze photos of hand-drawn stick-figure characters for a friendly fighting game.
Look only at what is actually drawn. Report:
- held items/props as lowercase nouns (empty list if empty-handed). Check BOTH hands and the whole figure: a round, oval or spiral shape held at a hand or arm is usually a shield; a long straight line from a hand is a sword, staff or spear; hats/helmets are not items
- the class implied by the items: Sword: sword/blade; Mace: mace/club/hammer/axe; Tank: shield; Attacker: book/staff/wand/bow; Fighter: empty hands
- elemental affinity (NONE, FIRE, ELECTRIC, FROST, POISON, BLEED, GRAVITY), suggested by ink colors or weapon vibe
- size of the figure relative to the page (small/medium/large), pose (aggressive/defensive/neutral), and dominant ink colors
- proposed stats. Every fighter has HP 200 (put 200). Split the rest between STR (physical damage), DUR (damage taken), SPD (walking and combo speed), AGI (jump / air control / recovery) and IQ (energy gain and magic damage), each 40-100, about 350 in total: bulky/armored → more DUR, big weapon or spiky → more STR, thin/small/dynamic → more SPD/AGI, smart/magical → more IQ. They are rebalanced to exactly 350
- a special move. First pick its kind, the one that best matches the drawing's vibe:
${SPECIAL_KINDS.map((k) => `  - ${k}: ${SPECIAL_INFO[k].looks}`).join("\n")}
  Then name it like an over-the-top anime finisher that only THIS drawing could have: riff on something specific you see (the hair, a scribble, a hat, the item, the ink colour, the paper). Puns, fake-Japanese-sounding names and homages to famous anime moves are welcome (e.g. "Ink-ame-hameha", "Scribble-gan"), but make it fresh, never a straight copy. Description: one vivid sentence of what it looks like
- an ultimate: a second, bigger finisher the fighter saves a full meter for. It grabs the opponent and pounds them before launching them. Pick its kind from the same list but NOT the same kind as the special move, name it even more over-the-top ("... Final", "... Apocalypse", "... Overdrive"), and give a one-sentence description
- a fighting style, from how the figure stands and what it looks like. Read the cues: fists up or arms forward → Boxing; long legs, a leg raised, tall and thin → Taekwondo; wide low stance, knees bent, bulky → Muay Thai; neat straight lines, upright and calm → Karate; messy, scribbly, wild or rough → Street; loose, relaxed, odd or tricky pose → Systema. Don't default to Karate; pick what the drawing really suggests:
${STYLES.map((s) => `  - ${s}: ${STYLE_INFO[s].blurb}`).join("\n")}
- a one-line flavor text, playful trash-talk tone, under 90 characters
- which edge of the image the head points toward (the drawing may be sideways in the photo)
- the pose: where the figure's head center, shoulder (where the arms meet the body), hip (where the legs meet the body), both elbows, hands, knees and feet are, as fractions of the whole image (x from the left edge, y from the top edge). "left"/"right" mean the image's left/right side. If a joint isn't drawn (stick arms have no elbow), give the midpoint of that limb. The head center is the middle of the drawn head or face circle itself: ignore hats, caps, hair, horns, crowns and scribbled shading around it. A hand is where the arm stroke ends (where it grips an item), never the far tip of a sword, staff or bow it holds. Marks that aren't part of the figure (stray lines, letters, shading) are not joints
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
// A busy (503/429), slow or unavailable-to-this-key (404) model falls through to the next.
const GEMINI_MODELS = [...new Set([GEMINI_MODEL, "gemini-3.6-flash", "gemini-3.5-flash", "gemini-3-flash-preview"])];

// deadline: the whole analysis gets ~20 s, then the offline generator takes over (4 models x 25 s x 2 attempts
// once kept a player staring at "Analyzing..." for minutes).
async function callGemini(image: Buffer, mediaType: MediaType, deadline: number) {
  const schema = JSON.stringify(z.toJSONSchema(VisionSchema));
  const body = JSON.stringify({
    system_instruction: { parts: [{ text: `${SYSTEM}\n\nReply with only a JSON object matching this JSON Schema:\n${schema}` }] },
    contents: [
      {
        role: "user",
        parts: [{ inline_data: { mime_type: mediaType, data: image.toString("base64") } }, { text: "Turn this drawing into a fighter." }],
      },
    ],
    generationConfig: { responseMimeType: "application/json", temperature: 1 },
  });
  let res: Response | null = null;
  let busy = "";
  for (const model of GEMINI_MODELS) {
    const left = deadline - Date.now();
    if (left < 1500) {
      busy += "out of time; ";
      break;
    }
    try {
      res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": process.env.GEMINI_API_KEY! },
        body,
        signal: AbortSignal.timeout(Math.min(12_000, left)),
      });
    } catch (err) {
      if (err instanceof Error && err.name === "TimeoutError") {
        busy += `${model} timed out; `;
        continue;
      }
      throw err;
    }
    if (res.status !== 503 && res.status !== 429 && res.status !== 404 && res.status < 500) break;
    busy += `${model} ${res.status}; `;
    res = null;
  }
  if (!res) throw new Error(`Gemini busy: ${busy}`);
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
  modelStats: StatLine | null,
  special: { kind: SpecialKind; name: string; description: string },
  ultimate: { kind: SpecialKind; name: string; description: string },
  style: Style,
  flavor: string,
  pose: PoseKeypoints | null,
  note?: string,
  rotation = 0,
  element = "NONE",
): Analysis {
  // Class is decided by the item rule, not trusted from the model.
  const cls = classFromItems(items);
  const rule = ruleStats(cls, features);
  return {
    name: name.trim().slice(0, 40) || "Nameless Scribble",
    class: cls,
    stats: blendStats(rule, modelStats),
    element,
    specialMove: { name: special.name.slice(0, 40), description: special.description.slice(0, 160) },
    specialKind: special.kind,
    ultimate: { kind: ultimate.kind, name: ultimate.name.slice(0, 40), description: ultimate.description.slice(0, 160) },
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
function offlineAnalysis(image: Buffer, note: string, facts: DrawingFacts | null, picks: Picks = {}): Analysis {
  const h = createHash("sha256").update(image).digest();
  const pick = <T,>(arr: readonly T[], i: number) => arr[h[i] % arr.length];
  // No measurements (an old client): fall back to guesses, and say so.
  const items = picks.item ? itemList({ item: picks.item } as DrawingFacts) : facts ? itemList(facts) : pick([[], ["sword"], ["mace"], ["book"], [], ["shield"], ["staff"], ["bow"]], 0);
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
  const special = pickSpecial(picks, { kind, name, description }, h[9]);
  // The ultimate: the class's own (or the next pool entry when the pick took it), named from the ultimate list.
  const ult = pickUlt(picks, undefined, special.kind, cls, h[10]);
  const element = picks.element ?? suggestElement(facts?.colors ?? features.dominant_colors, facts?.penWidth);
  return build(
    "offline",
    `${first} ${last}`,
    items,
    features,
    null,
    special,
    ult,
    picks.style ?? styleFromLook(features, cls, h[8]),
    "Drawn in thirty seconds, fights like it took thirty years.",
    null, // the browser estimates the skeleton from the ink
    note,
    0,
    element,
  );
}

export async function analyzeDrawing(image: Buffer, mediaType: MediaType, facts: DrawingFacts | null = null, picks: Picks = {}): Promise<Analysis> {
  const ai = provider();
  if (picks.noAi) return offlineAnalysis(image, "Built from the category panel: you chose the moves; stats are split fairly from the class.", facts, picks);
  if (!ai) return offlineAnalysis(image, "Offline mode: name and special are generated, stats come from your drawing's measurements.", facts, picks);

  let lastError: unknown;
  const deadline = Date.now() + 20_000;
  for (let attempt = 0; attempt < 2 && Date.now() < deadline - 1500; attempt++) {
    try {
      const v = ai === "gemini" ? await callGemini(image, mediaType, deadline) : await callClaude(image, mediaType);
      const seen = v.detected_items.map((i) => i.toLowerCase());
      const element = picks.element ?? v.element ?? suggestElement(facts?.colors ?? v.detected_features.dominant_colors, facts?.penWidth);
      const items = picks.item ? itemList({ item: picks.item } as DrawingFacts) : seen.length || !facts ? seen : itemList(facts);
      const special = pickSpecial(picks, v.special_move, image.length);
      return build(
        ai,
        v.name,
        // The player's explicit correction wins; then the AI's read; then the browser's guess.
        items,
        facts ? featuresFromMeasurements(facts, v.detected_features.dominant_colors) : v.detected_features,
        v.stats,
        special,
        pickUlt(picks, v.ultimate, special.kind, classFromItems(items), image.length + 1),
        picks.style ?? v.fighting_style,
        v.flavor_text,
        validPose(v.pose),
        undefined,
        ({ up: 0, left: 90, down: 180, right: 270 } as const)[v.head_points] ?? 0,
        element,
      );
    } catch (err) {
      lastError = err;
      console.error(`[vision] attempt ${attempt + 1} failed:`, err);
    }
  }
  const reason = lastError instanceof Error ? lastError.message : "unknown error";
  return offlineAnalysis(image, `Vision analysis failed twice (${reason}); used offline generator.`, facts, picks);
}
