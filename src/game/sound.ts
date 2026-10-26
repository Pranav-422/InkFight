// Procedural sound: every effect is synthesised with Web Audio (noise bursts and pitched blips), so there are
// no asset files. One AudioContext, one master chain and one shared noise buffer are reused for every voice, and
// the number of voices sounding at once is capped, which keeps it light on a phone.
//
// The on/off switch is kept in localStorage (default on) and is separate from "Reduce flashes". Browsers block
// audio until a user gesture, so the context is created on the first pointer press or key press (installUnlock).

export type Sfx = "punch" | "kick" | "block" | "whiff" | "slip" | "special" | "ultimate" | "clash" | "ko" | "round" | "skill" | "phase" | "tap" | "rumble" | "crack" | "meteor" | "impact" | "grind" | "eruption" | "hiss" | "chime" | "shimmer";

const KEY = "inkfight.sound";
const MAX_VOICES = 10;
// Sounds that must never be dropped by the voice cap (the rest are).
const IMPORTANT: Sfx[] = ["ko", "ultimate", "special", "round", "phase", "eruption"];

let on: boolean | null = null;
const listeners = new Set<() => void>();

export function subscribeSound(fn: () => void) {
  listeners.add(fn);
  return () => void listeners.delete(fn);
}

export function getSoundOn(): boolean {
  if (on !== null) return on;
  try {
    on = localStorage.getItem(KEY) !== "0";
  } catch {
    on = true;
  }
  return on;
}

export function setSoundOn(v: boolean) {
  on = v;
  try {
    localStorage.setItem(KEY, v ? "1" : "0");
  } catch {}
  if (v) play("tap");
  listeners.forEach((fn) => fn());
}

// ---------------------------------------------------------------- the audio graph

type Graph = { ctx: AudioContext; master: AudioNode; noise: AudioBuffer; voices: number };
let graph: Graph | null = null;

// Creates the context (once). Safe to call from any gesture handler; resumes a suspended context.
export function unlockAudio(): Graph | null {
  if (graph) {
    if (graph.ctx.state === "suspended") void graph.ctx.resume().catch(() => {});
    return graph;
  }
  try {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    const ctx = new Ctor({ latencyHint: "interactive" });
    // A compressor on the master so a pile-up of voices can't clip.
    const comp = ctx.createDynamicsCompressor();
    const gain = ctx.createGain();
    gain.gain.value = 0.55;
    comp.connect(gain).connect(ctx.destination);
    // One second of white noise, shared by every noise burst.
    const noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = noise.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    graph = { ctx, master: comp, noise, voices: 0 };
    if (ctx.state === "suspended") void ctx.resume().catch(() => {});
    return graph;
  } catch {
    return null;
  }
}

let installed = false;
// Start the context on the first user gesture (and keep trying until it runs: iOS suspends it again after a call or a lock).
export function installUnlock() {
  if (installed || typeof window === "undefined") return;
  installed = true;
  const go = () => {
    if (getSoundOn()) unlockAudio();
  };
  for (const ev of ["pointerdown", "keydown", "touchend"]) window.addEventListener(ev, go, { capture: true, passive: true });
}

// ---------------------------------------------------------------- recipes

// What a recipe is given: the context, where to connect, when to start, and how hard (0..1).
type Rig = { ctx: BaseAudioContext; out: AudioNode; noise: AudioBuffer; t: number; power: number };

// A pitched blip: an oscillator gliding from f0 to f1 over `dur` seconds under a quick-attack, exponential-decay envelope.
function blip(r: Rig, type: OscillatorType, f0: number, f1: number, dur: number, gain: number, at = 0) {
  const o = r.ctx.createOscillator();
  const g = r.ctx.createGain();
  const t0 = r.t + at;
  o.type = type;
  o.frequency.setValueAtTime(f0, t0);
  o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain, t0 + 0.004);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g).connect(r.out);
  o.start(t0);
  o.stop(t0 + dur + 0.02);
  return o;
}

// A burst of filtered noise: the filter sweeps from f0 to f1 (Hz) while the level decays.
function burst(r: Rig, filter: BiquadFilterType, f0: number, f1: number, dur: number, gain: number, at = 0, q = 1) {
  const s = r.ctx.createBufferSource();
  const f = r.ctx.createBiquadFilter();
  const g = r.ctx.createGain();
  const t0 = r.t + at;
  s.buffer = r.noise;
  f.type = filter;
  f.Q.value = q;
  f.frequency.setValueAtTime(f0, t0);
  f.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain, t0 + 0.004);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  s.connect(f).connect(g).connect(r.out);
  s.start(t0, Math.random() * 0.5);
  s.stop(t0 + dur + 0.02);
  return s;
}

type Recipe = (r: Rig) => AudioScheduledSourceNode | void;

// power: 0 (a poke) .. 1 (a big hit). A heavier hit is lower, longer and louder.
export const RECIPES: Record<Sfx, Recipe> = {
  punch: (r) => {
    const p = r.power;
    burst(r, "bandpass", 1500 - p * 600, 500, 0.07 + p * 0.05, 0.5 + p * 0.4, 0, 1.2);
    return blip(r, "sine", 230 - p * 110, 55, 0.1 + p * 0.1, 0.7 + p * 0.3);
  },
  kick: (r) => {
    const p = r.power;
    burst(r, "lowpass", 2200 - p * 900, 300, 0.1 + p * 0.07, 0.6 + p * 0.4);
    return blip(r, "triangle", 170 - p * 90, 42, 0.15 + p * 0.1, 0.8 + p * 0.3);
  },
  block: (r) => {
    burst(r, "highpass", 2600, 1400, 0.05, 0.35);
    return blip(r, "square", 820, 470, 0.06, 0.16);
  },
  whiff: (r) => burst(r, "bandpass", 500, 2600, 0.13, 0.7, 0, 0.9),
  slip: (r) => burst(r, "bandpass", 3000, 900, 0.12, 0.65, 0, 2),
  special: (r) => {
    burst(r, "bandpass", 400, 3200, 0.28, 0.25, 0, 1.4);
    blip(r, "sawtooth", 200, 520, 0.3, 0.18);
    return blip(r, "sine", 400, 1000, 0.32, 0.25);
  },
  ultimate: (r) => {
    // A rising scream, a sub boom and a swell of noise: it should be bigger than any special.
    blip(r, "sawtooth", 90, 1300, 0.7, 0.2);
    blip(r, "square", 180, 700, 0.55, 0.1, 0.05);
    burst(r, "bandpass", 300, 5000, 0.8, 0.35, 0, 1);
    return blip(r, "sine", 70, 38, 0.75, 0.9, 0.25);
  },
  clash: (r) => {
    blip(r, "square", 1900, 1700, 0.09, 0.14);
    blip(r, "square", 2500, 2300, 0.09, 0.1);
    return burst(r, "highpass", 3000, 2000, 0.1, 0.35);
  },
  ko: (r) => {
    blip(r, "sine", 340, 40, 1, 0.6);
    burst(r, "lowpass", 900, 80, 1, 0.55);
    return blip(r, "triangle", 120, 30, 0.9, 0.7, 0.05);
  },
  round: (r) => {
    blip(r, "triangle", 440, 440, 0.16, 0.28);
    return blip(r, "triangle", 660, 660, 0.3, 0.32, 0.17);
  },
  skill: (r) => {
    burst(r, "highpass", 2000, 4500, 0.1, 0.18);
    return blip(r, "triangle", 520, 1100, 0.16, 0.22);
  },
  phase: (r) => {
    blip(r, "sawtooth", 55, 30, 1.1, 0.5);
    burst(r, "lowpass", 3000, 100, 1.1, 0.6);
    return blip(r, "square", 330, 110, 0.9, 0.15, 0.1);
  },
  tap: (r) => blip(r, "sine", 950, 700, 0.035, 0.18),
  // Arena 1 (src/game/arena.ts): light cues, so the fight stays audible. Every damaging hazard also has a visual warning.
  rumble: (r) => {
    // The ground trembles: low noise under a wobbling sub.
    burst(r, "lowpass", 220, 70, 0.9, 0.45, 0, 0.8);
    return blip(r, "sine", 55, 38, 0.9, 0.5);
  },
  crack: (r) => {
    // A stone crack: a sharp snap, then a low thud.
    burst(r, "highpass", 3500, 1200, 0.06, 0.4);
    burst(r, "bandpass", 900, 250, 0.18, 0.35, 0.02, 1.4);
    return blip(r, "sine", 120, 45, 0.2, 0.45, 0.03);
  },
  meteor: (r) => blip(r, "sawtooth", 1500, 260, 0.5, 0.09), // the descending whistle that goes with the marker
  impact: (r) => {
    burst(r, "lowpass", 1800, 120, 0.35, 0.6);
    return blip(r, "sine", 100, 36, 0.4, 0.75);
  },
  grind: (r) => {
    // A boulder rising: scraping stone.
    burst(r, "bandpass", 300, 700, 0.7, 0.4, 0, 2.5);
    return blip(r, "sawtooth", 62, 48, 0.7, 0.14);
  },
  eruption: (r) => {
    burst(r, "lowpass", 1400, 90, 1.6, 0.7);
    blip(r, "sawtooth", 70, 28, 1.5, 0.35);
    return blip(r, "sine", 55, 30, 1.6, 0.8, 0.05);
  },
  hiss: (r) => burst(r, "highpass", 4000, 6500, 0.18, 0.1),
  // The opening ceremony: a constellation locked in (two bell notes), and the stars waking (a soft rising run).
  chime: (r) => {
    blip(r, "sine", 880, 880, 0.35, 0.22);
    blip(r, "triangle", 1320, 1320, 0.45, 0.14, 0.08);
    return blip(r, "sine", 1760, 1760, 0.6, 0.12, 0.16);
  },
  shimmer: (r) => {
    [660, 880, 1100, 1320, 1760].forEach((f, i) => blip(r, "sine", f, f * 1.01, 0.5, 0.1, i * 0.09));
    return burst(r, "highpass", 5000, 8000, 0.5, 0.04, 0.05);
  },
};

// ---------------------------------------------------------------- playing

// Play one sound. Does nothing when sound is off, before the first gesture, or when too many voices are sounding.
export function play(name: Sfx, power = 0.5) {
  if (!getSoundOn() || !graph) return;
  if (graph.ctx.state !== "running") return;
  if (graph.voices >= MAX_VOICES && !IMPORTANT.includes(name)) return;
  const g = graph;
  const last = RECIPES[name]({ ctx: g.ctx, out: g.master, noise: g.noise, t: g.ctx.currentTime + 0.005, power: Math.max(0, Math.min(1, power)) });
  g.voices++;
  // A recipe's last node ends the voice (its other nodes end at about the same time).
  if (last) last.onended = () => void (g.voices = Math.max(0, g.voices - 1));
  else g.voices = Math.max(0, g.voices - 1);
}
