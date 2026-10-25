// Self-check for "stats come from the drawing": npx tsx scripts/check-stats.ts

import assert from "node:assert/strict";
import { measureInk } from "../src/game/sprite";
import { BUDGET, classFromItems, clampStats, featuresFromMeasurements, HP, ruleStats, STAT_CAPS, type StatKey } from "../src/lib/stats";

const thin = featuresFromMeasurements({ fill: 0.05, aspect: 0.35, stance: 0.2, armSpread: 0.3 }, ["black"]);
const bulky = featuresFromMeasurements({ fill: 0.25, aspect: 1, stance: 0.5, armSpread: 0.5 }, ["red"]);
assert.equal(thin.size, "small");
assert.equal(bulky.size, "large");
assert.ok(ruleStats("Fighter", bulky).def > ruleStats("Fighter", thin).def, "bigger fill → more durability");
assert.ok(ruleStats("Fighter", thin).spd > ruleStats("Fighter", bulky).spd, "thin → faster");
assert.equal(featuresFromMeasurements({ fill: 0.1, aspect: 0.6, stance: 0.2, armSpread: 0.8 }, []).pose, "aggressive");
assert.equal(featuresFromMeasurements({ fill: 0.1, aspect: 0.6, stance: 0.6, armSpread: 0.3 }, []).pose, "defensive");
assert.equal(classFromItems(["shield"]), "Tank");
assert.equal(classFromItems([]), "Fighter");
assert.equal(classFromItems(["mace"]), "Mace");
// Caps hold even for absurd input.
const huge = ruleStats("Tank", featuresFromMeasurements({ fill: 1, aspect: 5, stance: 3, armSpread: 0 }, ["blue"]));
for (const k of Object.keys(STAT_CAPS) as StatKey[]) assert.ok(huge[k] >= STAT_CAPS[k][0] && huge[k] <= STAT_CAPS[k][1], k);
// Fairness: every line, however lopsided, ends at 200 HP and exactly the budget.
for (const s of [huge, ruleStats("Attacker", thin), clampStats({ hp: 60, atk: 90, def: 90, spd: 90 }), clampStats({ hp: 140, atk: 1, def: 1, spd: 1 }), clampStats({ hp: 100, atk: 100, def: 40, spd: 40 })]) {
  assert.equal(s.hp, HP);
  assert.equal(s.atk + s.def + s.spd + s.agi + s.iq, BUDGET, JSON.stringify(s));
}

// Synthetic drawings: ink strokes on white paper.
function figure(extra?: (line: Line) => void) {
  const W = 300, H = 400;
  const alpha = new Uint8ClampedArray(W * H);
  const line: Line = (x0, y0, x1, y1) => {
    const n = Math.ceil(Math.hypot(x1 - x0, y1 - y0));
    for (let i = 0; i <= n; i++) {
      const x = Math.round(x0 + ((x1 - x0) * i) / n), y = Math.round(y0 + ((y1 - y0) * i) / n);
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) alpha[(y + dy) * W + x + dx] = 255;
    }
  };
  for (let a = 0; a < Math.PI * 2; a += 0.02) line(150 + Math.cos(a) * 25, 60 + Math.sin(a) * 25, 150 + Math.cos(a + 0.02) * 25, 60 + Math.sin(a + 0.02) * 25);
  line(150, 85, 150, 220); // spine
  line(150, 120, 105, 175); // arms
  line(150, 120, 195, 175);
  line(150, 220, 115, 340); // legs
  line(150, 220, 185, 340);
  extra?.(line);
  const px = new Uint8ClampedArray(W * H * 4); // black ink
  return measureInk(px, alpha, W, H);
}
type Line = (x0: number, y0: number, x1: number, y1: number) => void;

assert.equal(figure().item, "nothing");
assert.equal(figure((l) => l(195, 175, 265, 85)).item, "sword");
const shield = figure((l) => {
  for (let a = 0; a < Math.PI * 2; a += 0.05) l(225 + Math.cos(a) * 35, 165 + Math.sin(a) * 50, 225 + Math.cos(a + 0.05) * 35, 165 + Math.sin(a + 0.05) * 50);
});
assert.ok(["shield", "book"].includes(shield.item), `shield drew as ${shield.item}`);
console.log("check-stats: all good", { bare: figure(), shield: shield.item });

// Gemini path, with a canned API reply (no network, no key needed).
async function checkGemini() {
  process.env.GEMINI_API_KEY = "test-key";
  const reply = {
    name: "Inky Supreme", class: "Attacker", detected_items: ["book"],
    detected_features: { size: "medium", pose: "neutral", dominant_colors: ["blue"] },
    stats: { hp: 90, atk: 70, def: 50, spd: 70, agi: 70, iq: 70 },
    element: "ELECTRIC",
    special_move: { kind: "beam", name: "Ink-ame-hameha", description: "A beam the width of the page" },
    ultimate: { kind: "spiral", name: "Great Spiral Notebook", description: "Spins until the page runs out" },
    fighting_style: "Systema", flavor_text: "Reads the rules, then ignores them.", head_points: "up",
    pose: Object.fromEntries(["head", "shoulder", "hip", "left_elbow", "left_hand", "right_elbow", "right_hand", "left_knee", "left_foot", "right_knee", "right_foot"].map((k) => [k, { x: 0.5, y: 0.5 }])),
  };
  let sent: { url: string; body: { generationConfig: { responseMimeType: string } } } | null = null;
  globalThis.fetch = (async (url: string, init: RequestInit) => {
    sent = { url, body: JSON.parse(String(init.body)) };
    return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: "```json\n" + JSON.stringify(reply) + "\n```" }] } }] }));
  }) as typeof fetch;
  const { analyzeDrawing } = await import("../src/lib/vision");
  const a = await analyzeDrawing(Buffer.from("img"), "image/png", null);
  assert.equal(a.breakdown.source, "gemini");
  assert.equal(a.specialKind, "beam");
  assert.equal(a.style, "Systema");
  assert.equal(a.class, "Attacker"); // class still comes from the item rule
  assert.equal(a.element, "ELECTRIC");
  assert.deepEqual([a.ultimate.kind, a.ultimate.name], ["spiral", "Great Spiral Notebook"]);
  // A player's pick wins and gets a stock name; an AI ultimate that repeats slot 1 moves on to the class's.
  const picked = await analyzeDrawing(Buffer.from("img"), "image/png", null, { ult: "meteor" });
  assert.equal(picked.ultimate.kind, "meteor");
  assert.ok(picked.ultimate.name.length > 0);
  reply.ultimate.kind = "beam";
  const dup = await analyzeDrawing(Buffer.from("img"), "image/png", null);
  assert.notEqual(dup.ultimate.kind, dup.specialKind, "the two slots must differ unless the player chose so");
  // Builder mode skips the AI: both picks are kept as chosen.
  const built = await analyzeDrawing(Buffer.from("img"), "image/png", null, { noAi: true, special: "beam", ult: "beam" });
  assert.deepEqual([built.specialKind, built.ultimate.kind], ["beam", "beam"]);
  assert.ok(sent!.url.includes(":generateContent") && sent!.body.generationConfig.responseMimeType === "application/json");
  console.log("check-gemini: all good", a.specialMove.name);
}
checkGemini();
