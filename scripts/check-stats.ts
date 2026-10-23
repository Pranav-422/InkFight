// Self-check for "stats come from the drawing": npx tsx scripts/check-stats.ts

import assert from "node:assert/strict";
import { measureInk } from "../src/game/sprite";
import { classFromItems, featuresFromMeasurements, ruleStats, STAT_CAPS, type StatKey } from "../src/lib/stats";

const thin = featuresFromMeasurements({ fill: 0.05, aspect: 0.35, stance: 0.2, armSpread: 0.3 }, ["black"]);
const bulky = featuresFromMeasurements({ fill: 0.25, aspect: 1, stance: 0.5, armSpread: 0.5 }, ["red"]);
assert.equal(thin.size, "small");
assert.equal(bulky.size, "large");
assert.ok(ruleStats("Brawler", bulky).hp > ruleStats("Brawler", thin).hp, "bigger fill → more HP");
assert.ok(ruleStats("Brawler", thin).spd > ruleStats("Brawler", bulky).spd, "thin → faster");
assert.equal(featuresFromMeasurements({ fill: 0.1, aspect: 0.6, stance: 0.2, armSpread: 0.8 }, []).pose, "aggressive");
assert.equal(featuresFromMeasurements({ fill: 0.1, aspect: 0.6, stance: 0.6, armSpread: 0.3 }, []).pose, "defensive");
assert.equal(classFromItems(["shield"]), "Tank");
assert.equal(classFromItems([]), "Brawler");
// Caps hold even for absurd input.
const huge = ruleStats("Tank", featuresFromMeasurements({ fill: 1, aspect: 5, stance: 3, armSpread: 0 }, ["blue"]));
for (const k of Object.keys(STAT_CAPS) as StatKey[]) assert.ok(huge[k] >= STAT_CAPS[k][0] && huge[k] <= STAT_CAPS[k][1], k);

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
