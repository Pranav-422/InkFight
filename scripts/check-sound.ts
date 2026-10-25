// Self-check for src/game/sound.ts without a browser: a fake Web Audio that counts nodes, so we can assert that every
// effect builds a graph, that the switch and the voice cap work, and that the context and noise buffer are created once.
//   npx tsx scripts/check-sound.ts
// (What it can't tell you is how it sounds: see docs/changes/sprint-6-sound.md for the real-browser render check.)

import assert from "node:assert/strict";

let contexts = 0, buffers = 0, nodes = 0, started = 0;
const ended: Node[] = []; // nodes that were told to stop: "ending" them fires onended, as the browser would later

class Param {
  setValueAtTime() {}
  exponentialRampToValueAtTime() {}
  value = 0;
}
class Node {
  frequency = new Param();
  gain = new Param();
  Q = new Param();
  type = "";
  buffer: unknown = null;
  onended: (() => void) | null = null;
  constructor() {
    nodes++;
  }
  connect(n: Node) {
    return n;
  }
  start() {
    started++;
  }
  stop() {
    ended.push(this);
  }
}
class FakeCtx {
  state = "running";
  sampleRate = 8000;
  currentTime = 1;
  destination = new Node();
  constructor() {
    contexts++;
  }
  resume() {
    return Promise.resolve();
  }
  createDynamicsCompressor = () => new Node();
  createGain = () => new Node();
  createOscillator = () => new Node();
  createBufferSource = () => new Node();
  createBiquadFilter = () => new Node();
  createBuffer(_c: number, len: number) {
    buffers++;
    return { getChannelData: () => new Float32Array(len) };
  }
}
const store = new Map<string, string>();
Object.assign(globalThis, {
  window: { AudioContext: FakeCtx },
  localStorage: { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) },
});

async function main() {
  const snd = await import("../src/game/sound");
  const names = Object.keys(snd.RECIPES) as (keyof typeof snd.RECIPES)[];

  // Default on; nothing sounds before the first gesture creates the context.
  assert.equal(snd.getSoundOn(), true, "sound should default to on");
  snd.play("punch");
  assert.equal(nodes, 0, "a sound played before the audio context existed");

  // The first gesture creates one context, one master chain and one noise buffer; more gestures reuse them.
  snd.unlockAudio();
  snd.unlockAudio();
  assert.equal(contexts, 1, "more than one AudioContext");
  assert.equal(buffers, 1, "the noise buffer is shared");
  const base = nodes;

  // Every effect builds something and starts something, at any power.
  for (const n of names) {
    for (const p of [0, 0.5, 1]) {
      const before = started;
      snd.play(n, p);
      assert.ok(started > before, `${n} (power ${p}) started nothing`);
      ended.splice(0).forEach((n) => n.onended?.());
    }
  }
  assert.ok(nodes > base);

  // The switch: off means silence, and the choice is stored (and survives a re-read).
  snd.setSoundOn(false);
  assert.equal(store.get("inkfight.sound"), "0");
  const n0 = started;
  for (const n of names) snd.play(n);
  assert.equal(started, n0, "a sound played while muted");
  snd.setSoundOn(true);
  assert.equal(store.get("inkfight.sound"), "1");
  assert.ok(started > n0, "turning sound on should give a tap");

  // The voice cap: ordinary sounds are dropped past the limit, the important ones still play, and finished voices free their slot.
  ended.length = 0;
  for (let i = 0; i < 40; i++) snd.play("punch");
  const voices = started;
  snd.play("punch");
  assert.equal(started, voices, "an ordinary sound played past the voice cap");
  const k = started;
  snd.play("ko");
  assert.ok(started > k, "a KO must not be dropped by the cap");
  ended.splice(0).forEach((n) => n.onended?.());
  const m = started;
  snd.play("punch");
  assert.ok(started > m, "finished voices should free their slots");

  console.log(`check-sound: all good (${names.length} effects, ${nodes} nodes built)`);
}
void main();
