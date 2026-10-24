// Self-check for the touch joystick's direction mapping: npx tsx scripts/check-stick.ts
import assert from "node:assert/strict";
import { stickDirs } from "../src/components/Joystick";

const R = 60; // knob travel in px at scale 1 (Joystick.tsx)
const at = (fx: number, fy: number) => stickDirs(fx * R, fy * R);

assert.deepEqual(at(0, 0), { left: false, right: false, block: false, up: false, centre: true });
assert.equal(at(0.5, 0).right, true);
assert.equal(at(-0.5, 0).left, true);
assert.equal(at(0.3, 0).right, false, "inside the dead zone");
assert.equal(at(0, 0.7).block, true, "pull down blocks");
assert.equal(at(0, -0.7).up, true, "flick up jumps");
assert.equal(at(0.5, 0.7).right && at(0.5, 0.7).block, true, "walk and block keys can be held together");
assert.equal(at(0.25, 0.1).centre, true, "near the middle re-arms the jump");
console.log("check-stick: all good");
