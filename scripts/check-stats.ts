// Self-check for "stats come from the drawing": npx tsx scripts/check-stats.ts

import assert from "node:assert/strict";
import { boxesFromPose, headSpecks, measureInk } from "../src/game/sprite";
import { BUDGET, classFromItems, clampStats, featuresFromMeasurements, HP, ruleStats, STAT_CAPS, suggestElement, type StatKey } from "../src/lib/stats";

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

// suggestElement: hue wins, pen width breaks ties for black-only drawings.
// Coloured ink: hue takes priority regardless of width.
assert.equal(suggestElement(["red"], 3), "FIRE", "red → FIRE even with thin pen");
assert.equal(suggestElement(["blue"], 9), "ELECTRIC", "blue → ELECTRIC even with thick pen");
assert.equal(suggestElement(["green"], 3), "POISON", "green → POISON even with thin pen");
// Black-only: thickness decides.
assert.equal(suggestElement(["black"], 9), "GRAVITY", "thick black pen → GRAVITY");
assert.equal(suggestElement(["black"], 3), "ELECTRIC", "thin black pen → ELECTRIC");
assert.equal(suggestElement(["black"], 6), "GRAVITY", "mid-width black pen → GRAVITY (default)");
// No width provided: falls back to GRAVITY.
assert.equal(suggestElement(["black"]), "GRAVITY", "black with no width → GRAVITY");
// Mixed colours with black: hue wins.
assert.equal(suggestElement(["black", "blue"], 3), "ELECTRIC", "blue + black → ELECTRIC (hue wins)");
assert.equal(suggestElement(["black", "red"], 9), "FIRE", "red + black → FIRE (hue wins over thick)");

// Synthetic drawings: ink strokes on white paper.
// halfW = half-width of the stroke brush (dy/dx radius): 2 → 5px stroke, 4 → 9px stroke.
function figure(extra?: (line: Line) => void, halfW = 2) {
  const W = 300, H = 400;
  const alpha = new Uint8ClampedArray(W * H);
  const line: Line = (x0, y0, x1, y1) => {
    const n = Math.ceil(Math.hypot(x1 - x0, y1 - y0));
    for (let i = 0; i <= n; i++) {
      const x = Math.round(x0 + ((x1 - x0) * i) / n), y = Math.round(y0 + ((y1 - y0) * i) / n);
      for (let dy = -halfW; dy <= halfW; dy++) for (let dx = -halfW; dx <= halfW; dx++) {
        const px = x + dx, py = y + dy;
        if (px >= 0 && py >= 0 && px < W && py < H) alpha[py * W + px] = 255;
      }
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
// Ink that doesn't touch the hand is not a held item: a cap's brim off the head, or a stray mark.
assert.equal(figure((l) => l(172, 52, 205, 50)).item, "nothing", "a cap brim became an item");
assert.equal(figure((l) => l(240, 60, 262, 72)).item, "nothing", "a stray mark became an item");
const shield = figure((l) => {
  for (let a = 0; a < Math.PI * 2; a += 0.05) l(225 + Math.cos(a) * 35, 165 + Math.sin(a) * 50, 225 + Math.cos(a + 0.05) * 35, 165 + Math.sin(a + 0.05) * 50);
});
assert.ok(["shield", "book"].includes(shield.item), `shield drew as ${shield.item}`);

// penWidth field is measured and in-range.
const bare = figure();
assert.ok(typeof bare.penWidth === "number" && bare.penWidth > 0, "penWidth is a positive number");

// Thick stroke (halfW=4 → ~9px): suggestElement with that penWidth and black-only → GRAVITY.
const thickFig = figure(undefined, 4);
assert.ok(thickFig.penWidth >= 6, `thick pen (halfW=4) should have penWidth>=6, got ${thickFig.penWidth}`);
assert.equal(suggestElement(["black"], thickFig.penWidth), "GRAVITY", "thick black drawing → GRAVITY");

// Thin stroke (halfW=1 → ~3px): penWidth small, black-only → ELECTRIC.
const thinFig = figure(undefined, 1);
assert.ok(thinFig.penWidth <= 5, `thin pen (halfW=1) should have penWidth<=5, got ${thinFig.penWidth}`);
assert.equal(suggestElement(["black"], thinFig.penWidth), "ELECTRIC", "thin black drawing → ELECTRIC");

console.log("check-stats: all good", { bare: figure(), shield: shield.item, thickW: thickFig.penWidth, thinW: thinFig.penWidth });

// Scribbled head: a 2 px face outline with two eyes and a mouth, plus loose specks and a hatch of thin parallel
// strokes. The cleanup must drop the specks and the hatching and keep the outline, eyes and mouth.
{
  const N = 64, a = new Uint8Array(N * N);
  const dot = (x: number, y: number, r = 0) => { for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) a[(y + dy) * N + x + dx] = 255; };
  for (let t = 0; t < 360; t += 1) dot(Math.round(32 + 28 * Math.cos((t * Math.PI) / 180)), Math.round(32 + 28 * Math.sin((t * Math.PI) / 180)));
  const face = [[22, 26], [42, 26]];
  for (const [x, y] of face) dot(x, y, 2); // eyes (5x5 blobs)
  for (let x = 24; x <= 40; x++) dot(x, 42); // mouth: one thin stroke
  const specks = [[10, 30], [54, 20], [30, 8], [46, 52], [18, 50]];
  for (const [x, y] of specks) dot(x, y); // single pixels
  const hatch: number[][] = [];
  for (let k = 0; k < 5; k++) for (let i = 0; i <= 6; i++) hatch.push([18 + k * 6 + i, 12 + i]); // 5 parallel diagonals above the eyes
  for (const [x, y] of hatch) a[y * N + x] = 255;
  const before = a.filter((v) => v).length;
  const drop = headSpecks(a, N, N);
  const kept = (x: number, y: number) => !drop[y * N + x];
  assert.ok(specks.every(([x, y]) => !kept(x, y)), "specks are dropped");
  assert.ok(hatch.every(([x, y]) => !kept(x, y)), "parallel hatching is dropped");
  assert.ok(kept(60, 32) && kept(32, 4) && kept(32, 60), "the outline stays");
  assert.ok(face.every(([x, y]) => kept(x, y)) && kept(32, 42), "eyes and mouth stay");
  assert.ok(drop.reduce((n, v) => n + v, 0) < before * 0.4);
  // A clean face is left alone, and so is a face with only two brows and a mouth (fewer than four strokes).
  const clean = new Uint8Array(N * N);
  for (let t = 0; t < 360; t++) clean[Math.round(32 + 28 * Math.sin((t * Math.PI) / 180)) * N + Math.round(32 + 28 * Math.cos((t * Math.PI) / 180))] = 255;
  for (const [x0, y0, x1] of [[18, 20, 28], [36, 20, 46], [24, 44, 40]]) for (let x = x0; x <= x1; x++) clean[y0 * N + x] = 255;
  assert.equal(headSpecks(clean, N, N).reduce((n, v) => n + v, 0), 0, "brows and a mouth are not shading");
}
// Hatching that starts at the outline is part of the outline's blob; it still goes (inside the ring), the outline stays.
{
  const N = 64, a = new Uint8Array(N * N), ring: number[] = [], strokes: number[] = [];
  for (let t = 0; t < 720; t++) {
    const x = Math.round(32 + 28 * Math.cos((t * Math.PI) / 360)), y = Math.round(32 + 28 * Math.sin((t * Math.PI) / 360));
    a[y * N + x] = 255;
    ring.push(y * N + x);
  }
  for (const deg of [200, 215, 230, 245, 260]) {
    const x0 = Math.round(32 + 28 * Math.cos((deg * Math.PI) / 180)), y0 = Math.round(32 + 28 * Math.sin((deg * Math.PI) / 180));
    for (let i = 3; i <= 14; i++) {
      a[(y0 + i) * N + x0 + i] = 255;
      if (Math.hypot(x0 + i - 32, y0 + i - 32) < 21) strokes.push((y0 + i) * N + x0 + i);
    }
  }
  const drop = headSpecks(a, N, N);
  assert.ok(strokes.length > 20 && strokes.every((q) => drop[q]), "hatching inside the face is dropped");
  assert.ok(ring.every((q) => !drop[q]), "the outline stays");
}
// Boxes from the pose JSON land in cut-out pixels; malformed ones are ignored, so joints-only poses work as before.
{
  const toSprite = (v: { x: number; y: number }) => ({ x: v.x * 200 - 10, y: v.y * 400 - 20 });
  const both = boxesFromPose({ head_box: { x: 0.5, y: 0.1, r: 0.05 }, item_box: { x0: 0.8, y0: 0.5, x1: 0.6, y1: 0.2 } }, toSprite, 400);
  assert.deepEqual(both.headBox, { x: 90, y: 20, r: 20 });
  assert.deepEqual(both.itemBox, { x0: 110, y0: 60, x1: 150, y1: 180 }); // corners given in the wrong order are fixed
  assert.deepEqual(boxesFromPose({ head_box: { x: "a", y: 0, r: 1 }, item_box: null }, toSprite, 400), { headBox: null, itemBox: null });
  assert.deepEqual(boxesFromPose({}, toSprite, 400), { headBox: null, itemBox: null });
  assert.deepEqual(boxesFromPose(null, toSprite, 400), { headBox: null, itemBox: null });
}

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
    pose: { ...Object.fromEntries(["head", "shoulder", "hip", "left_elbow", "left_hand", "right_elbow", "right_hand", "left_knee", "left_foot", "right_knee", "right_foot"].map((k) => [k, { x: 0.5, y: 0.5 }])), head_box: { x: 0.5, y: 0.52, r: 0.05 }, item_box: { x0: 0.45, y0: 0.3, x1: 0.55, y1: 0.7 } } as Record<string, unknown>,
  };
  let sent: { url: string; body: { generationConfig: { responseMimeType: string } } } | null = null;
  globalThis.fetch = (async (url: string, init: RequestInit) => {
    sent = { url, body: JSON.parse(String(init.body)) };
    return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: "```json\n" + JSON.stringify(reply) + "\n```" }] } }] }));
  }) as typeof fetch;
  const { analyzeDrawing } = await import("../src/lib/vision");
  const a = await analyzeDrawing(Buffer.from("img"), "image/png", null);
  assert.equal(a.breakdown.source, "gemini");
  // The two boxes ride along in the stored pose; a box that doesn't fit its joints is dropped, the joints stay.
  assert.deepEqual(a.pose?.head_box, { x: 0.5, y: 0.52, r: 0.05 });
  assert.deepEqual(a.pose?.item_box, { x0: 0.45, y0: 0.3, x1: 0.55, y1: 0.7 });
  reply.pose.head_box = { x: 0.1, y: 0.9, r: 0.05 }; // nowhere near the head joint
  reply.pose.item_box = { x0: 0.0, y0: 0.0, x1: 0.1, y1: 0.1 }; // nowhere near a hand
  const stray = await analyzeDrawing(Buffer.from("img"), "image/png", null);
  assert.ok(stray.pose && !stray.pose.head_box && !stray.pose.item_box && stray.pose.head.x === 0.5);
  reply.pose.head_box = { x: 0.5, y: 0.52, r: 0.05 };
  reply.pose.item_box = { x0: 0.45, y0: 0.3, x1: 0.55, y1: 0.7 };
  delete (reply.pose as Record<string, unknown>).item_box; // a reply without the extras still works
  assert.ok((await analyzeDrawing(Buffer.from("img"), "image/png", null)).pose?.head_box);
  reply.pose.item_box = { x0: 0.45, y0: 0.3, x1: 0.55, y1: 0.7 };
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
