// Dungeon difficulty curve: how often a mid-skill player clears each floor on the first try, against the
// target in docs/research/v2/bosses.json (85% on floor 1 falling to 15% on floor 10). The "mid-skill
// player" is the normal CPU playing each class's usual line in turn, against the boss with its floor's
// budget, cap and AI knobs.
//   npx tsx scripts/dungeon.ts [matches per floor, default 100]
//   npx tsx scripts/dungeon.ts --tune [N]   bisect each floor's stat budget onto the target; prints the budgets
//       to copy into src/game/dungeon.ts (the stat proportions stay the bosses' own)
// Also checks that a boss fight is deterministic (same seed, same result), which a resumed match relies on. The boss
// plays with its passive (and floor 10 with its second form), so re-tune after any change to either.

import assert from "node:assert/strict";
import { cpuThink, newBrain } from "../src/game/cpu";
import { bossLook, bossLookOf } from "../src/game/bossLook";
import { BOSSES, FLOORS, TIERS, VARIANTS, bossFighter, bossKnobs, bossPersona, bossRun, lockedReason, specialChoices, ultChoices } from "../src/game/dungeon";
import { BOSS_IDLES } from "../src/game/poses";
import { BASE_KINDS, BOSS_KINDS, CLASS_CHAIN, CLASS_ITEM, CLASS_SPECIAL, CLASS_STYLE, MOVES, SPECIAL_KINDS, STYLE_INFO, UNLOCK_FLOOR, UNLOCK_KINDS, type MoveName, type Style } from "../src/game/moves";
import { createMatch, deriveDef, EMPTY_INPUT, step, TICK_HZ, type FighterStats } from "../src/game/sim";
import { CLASSES, ELEMENTS, normClass, ruleStats } from "../src/lib/stats";

const TARGET = [0.85, 0.78, 0.7, 0.62, 0.54, 0.46, 0.38, 0.3, 0.22, 0.15];
const TUNING = process.argv[2] === "--tune";
const N = Number((TUNING ? process.argv[3] : process.argv[2]) ?? 100);
const SEED0 = Number(process.env.SEED0 ?? 1000); // the seeds of the player's matches: SEED0=777 measures on matches the tuner never saw

let seed = 1;
Math.random = () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

const neutral = { size: "medium", pose: "neutral", dominant_colors: [] } as const;
const player = (cls: string): FighterStats => ({ ...ruleStats(cls, { ...neutral, dominant_colors: [] }), class: cls, item: CLASS_ITEM[cls], style: CLASS_STYLE[cls], specialKind: CLASS_SPECIAL[cls] });

// One match, player on the left: true when the player wins.
function clear(floor: number, cls: string, s: number) {
  seed = s;
  const b = BOSSES[floor - 1];
  const ia = { ...EMPTY_INPUT }, ib = { ...EMPTY_INPUT };
  const run = bossRun(floor);
  const m = createMatch(player(cls), bossFighter(floor), [ia, ib], { boss: run.spec }); // the passive and the second form are part of the boss
  const me = newBrain("normal"), boss = newBrain("hard", b.cpu, b.persona);
  for (let t = 0; m.phase !== "matchEnd" && t < TICK_HZ * 360; t++) {
    boss.knobs = bossKnobs(run, m.boss?.phase);
    boss.persona = bossPersona(run, m.boss?.phase);
    cpuThink(m, 0, me, ia);
    cpuThink(m, 1, boss, ib);
    step(m, [ia, ib]);
  }
  return m.matchWinner === 0;
}

// One identity: whatever the computer does with a boss stays in character. Play a few matches against each class and collect what the boss threw.
// Every move must belong to the boss's own chains (its kit, or its class's and style's where the kit names none) or be an air move, every special
// must be one of its two, and the personas that promise it hold to their word (the sheathed swordsman has nothing but his one draw; the boxer has no kicks).
const AIR: MoveName[] = ["airSlash", "divePunch", "flyingKick"];
function whatItThrows(floor: number, matches = 5) {
  const b = BOSSES[floor - 1], run = bossRun(floor);
  const moves = new Set<string>(), specials = new Set<string>();
  for (let k = 0; k < matches; k++) {
    seed = 77 + k * 104729;
    const ia = { ...EMPTY_INPUT }, ib = { ...EMPTY_INPUT };
    const m = createMatch(player(CLASSES[k % CLASSES.length]), bossFighter(floor), [ia, ib], { boss: run.spec });
    const me = newBrain("normal"), boss = newBrain("hard", b.cpu, b.persona);
    for (let t = 0; m.phase !== "matchEnd" && t < TICK_HZ * 360; t++) {
      boss.knobs = bossKnobs(run, m.boss?.phase);
      boss.persona = bossPersona(run, m.boss?.phase);
      cpuThink(m, 0, me, ia);
      cpuThink(m, 1, boss, ib);
      step(m, [ia, ib]);
      const f = m.fighters[1];
      if ((f.action === "attack" || f.action === "kick") && f.t === 0 && f.move) moves.add(f.move);
      if (f.action === "special" && f.t === 0) specials.add(f.ult ? m.defs[1].ult : m.defs[1].special);
    }
  }
  return { moves, specials };
}
for (const b of BOSSES) {
  const cls = normClass(b.cls);
  const own = new Set<MoveName>([...AIR, STYLE_INFO[b.style as Style].mix, ...(b.kit.punch ?? CLASS_CHAIN[cls] ?? STYLE_INFO[b.style as Style].punch), ...(b.kit.kick ?? STYLE_INFO[b.style as Style].kick)]); // (the style's own finisher when a string switches buttons belongs to it)
  if (b.phase2) for (const n of [...(b.phase2.kit.punch ?? []), ...(b.phase2.kit.kick ?? [])]) own.add(n);
  const { moves, specials } = whatItThrows(b.floor);
  for (const m of moves) assert.ok(own.has(m as MoveName), `floor ${b.floor} (${b.title}) threw ${m}, which isn't in its kit`);
  for (const k of specials) assert.ok([b.special, b.ult, b.phase2?.special, b.phase2?.ult].includes(k as never), `floor ${b.floor} (${b.title}) cast ${k}`);
  assert.ok(specials.has(b.special) || specials.has(b.ult), `floor ${b.floor} (${b.title}) never used its signature special`);
  if (b.persona === "sheathed") assert.deepEqual([...moves].filter((m) => !AIR.includes(m as MoveName)), ["thunderclap"], `${b.title} threw more than his draw`);
  if (b.persona === "boxer") for (const m of moves) assert.ok(AIR.includes(m as MoveName) || !MOVES[m as MoveName].tip.startsWith("foot"), `${b.title} kicked (${m})`);
  console.log(`floor ${String(b.floor).padStart(2)} ${b.title.padEnd(15)} throws: ${[...moves].filter((m) => !AIR.includes(m as MoveName)).join(", ")}  |  casts: ${[...specials].join(", ")}`);
}

// A boss's look is complete and comes from the research: a head and an outfit, an idle poses.ts has, and at least two of the hex colours its inspiration's
// moves are given in docs/research (the palette, the outfit and the head drawing together).
const RESEARCH: Record<number, string[]> = {
  1: ["#ff5500", "#ffffff", "#222222"], // Compressed Low Kick
  2: ["#4444ff", "#ff0000"], // Deconstruction
  3: ["#ffffff", "#888888"], // Dempsey Roll
  4: ["#000000", "#ff0033", "#ffffff"], // Counter Smash
  5: ["#ffff00", "#ffffff"], // Rokuren
  6: ["#00ff66", "#111111", "#ff0044", "#f0fff0", "#006400"], // Oni Giri, Lion's Song
  7: ["#ff2200", "#111111", "#ffffff", "#ffc0cb"], // Jet Gatling
  8: ["#800080", "#ffffff"], // Murasaki
  9: ["#00ccff", "#ffffff", "#0044ff", "#ffd700", "#ff8800"], // Kamehameha, Dragon Fist
  10: ["#ffd700", "#8800ff", "#00ffaa"], // The World
};
for (const b of BOSSES) {
  const look = bossLook(b.floor);
  assert.ok(look, `floor ${b.floor} has no look`);
  assert.ok(look.head.length >= 8 && look.outfit.length >= 2, `floor ${b.floor}: a head and an outfit are drawn from data`);
  assert.ok(BOSS_IDLES.includes(look.idle), `floor ${b.floor}: idle ${look.idle} isn't in poses.ts`);
  const text = JSON.stringify(look).toLowerCase();
  const hits = RESEARCH[b.floor].filter((c) => text.includes(`"${c}"`));
  assert.ok(hits.length >= 2, `floor ${b.floor} (${b.title}) carries only ${hits.length} of the research's colours`);
  assert.equal(bossLookOf(`/boss-art/${b.floor}`), look);
}
assert.equal(bossLookOf("/uploads/x.png"), null);

// The ladder: five tiers, two floors each but the last (and three for the power users), in order, and a floor's `teaches` line is written.
assert.equal(FLOORS, 10);
assert.deepEqual(BOSSES.map((b) => TIERS.indexOf(b.tier)), [0, 0, 1, 1, 2, 2, 3, 3, 3, 4], "the tiers climb: street, martial arts, swords, power, final");
for (const b of BOSSES) assert.ok(b.teaches.length > 20 && b.counterplay.length > 20 && b.passive.hint.length > 20, `floor ${b.floor}: a floor teaches something`);

// Parody names only: nothing a player can read about a boss (names, moves, passive, hints, taunts, rewards) is a name from its source; the docs name those.
const OFFICIAL = /zenitsu|agatsuma|zoro|roronoa|luffy|monkey d|gojo|satoru|goku|\bdio\b|brando|ippo|makunouchi|vasco|\bscar\b|gun park|kamehameha|gomu|hollow purple|rasengan|za warudo|road roller|oni ?giri|santoryu|thunderclap and flash|lion's song|dempsey roll|gazelle punch|jet gatling|rokuren|dragon fist|kaio|muda/i;
const isOfficial = (text: string) => OFFICIAL.test(text) || /\bThe World\b/.test(text); // ("the world" in lower case is just English)
const INTERNAL = new Set(["kit", "stats", "cpu"]); // (move ids and numbers are never shown)
const strings = (v: unknown): string[] => (typeof v === "string" ? [v] : v && typeof v === "object" ? Object.entries(v).flatMap(([k, x]) => (INTERNAL.has(k) ? [] : strings(x))) : []);
for (const b of BOSSES) for (const text of strings(b)) assert.ok(!isOfficial(text), `floor ${b.floor} (${b.title}) shows an official name: "${text}"`);
assert.equal(new Set(BOSSES.map((b) => b.title)).size, 10, "ten different names");

// Rewards: the floor's signature move made player-safe. Even floors hand out one of the five unlockable kinds (on the floor UNLOCK_FLOOR has always put
// it), odd floors a named, element-tinted version of a base kind. Both are kinds the PvP balance already prices (balance.ts), neither is boss-only, and the
// reward is a move the boss itself throws.
for (const b of BOSSES) {
  const r = b.reward;
  const tag = `floor ${b.floor} (${b.title}) reward ${r.name}`;
  assert.ok((SPECIAL_KINDS as readonly string[]).includes(r.kind), `${tag}: ${r.kind} isn't a kind a player can pick`);
  assert.ok(!(BOSS_KINDS as readonly string[]).includes(r.kind), `${tag}: ${r.kind} is boss-only`);
  assert.ok([b.special, b.ult, b.phase2?.special, b.phase2?.ult].includes(r.kind), `${tag}: ${r.kind} isn't one of ${b.title}'s own specials`);
  assert.equal(r.type, b.floor % 2 ? "element_variant" : "new_special_kind", `${tag}: odd floors give a variant, even floors a new kind`);
  if (r.type === "new_special_kind") assert.equal(UNLOCK_FLOOR[r.kind as keyof typeof UNLOCK_FLOOR], b.floor, `${tag}: ${r.kind} unlocks on floor ${UNLOCK_FLOOR[r.kind as keyof typeof UNLOCK_FLOOR]}`);
  else {
    assert.ok((BASE_KINDS as readonly string[]).includes(r.kind), `${tag}: a variant tints a base kind`);
    assert.ok(r.element && r.element !== "NONE" && (ELEMENTS as readonly string[]).includes(r.element), `${tag}: a variant carries an element`);
  }
  assert.ok(r.description.length > 20, `${tag}: says what it does`);
  assert.ok(!isOfficial(r.name), `${tag}: an official name`);
}
assert.equal(new Set(BOSSES.map((b) => b.reward.name)).size, 10, "ten different rewards");
// Each unlockable kind is the reward of exactly its floor; the variants keep the ids pickers have stored since Sprint 5; and what a player may pick grows with the floors they cleared.
for (const k of UNLOCK_KINDS) assert.deepEqual(BOSSES.filter((b) => b.reward.type === "new_special_kind" && b.reward.kind === k).map((b) => b.floor), [UNLOCK_FLOOR[k]], `${k} is the reward of floor ${UNLOCK_FLOOR[k]}`);
assert.deepEqual(UNLOCK_FLOOR, { shatter: 2, counter: 4, dash_slash: 6, pull: 8, remote_detonation: 10 }, "the unlock floors never move");
assert.deepEqual(VARIANTS.map((v) => v.id), ["v1", "v3", "v5", "v7", "v9"]);
for (let cleared = 0; cleared <= FLOORS; cleared++) {
  const open = UNLOCK_KINDS.filter((k) => UNLOCK_FLOOR[k] <= cleared).length, tints = VARIANTS.filter((v) => v.floor <= cleared).length;
  const picks = specialChoices(cleared);
  assert.equal(picks.length, BASE_KINDS.length + open + tints, `${cleared} floors cleared: what the special picker lists`);
  assert.equal(ultChoices(cleared).length, BASE_KINDS.length + open);
  for (const c of picks) assert.ok((SPECIAL_KINDS as readonly string[]).includes(c.kind) && !(BOSS_KINDS as readonly string[]).includes(c.kind));
  for (const k of UNLOCK_KINDS) assert.equal(lockedReason(k, cleared) === null, UNLOCK_FLOOR[k] <= cleared, `${k} with ${cleared} floors cleared`);
}

// Bosses keep their budget through deriveDef (players are always clamped to 350).
for (const b of BOSSES) {
  const d = deriveDef(bossFighter(b.floor));
  const { budget, cap, ...plain } = bossFighter(b.floor); // eslint-disable-line @typescript-eslint/no-unused-vars
  const p = deriveDef(plain);
  if (b.budget > 350) assert.ok(d.punch + d.magic + d.speed > p.punch + p.magic + p.speed, `floor ${b.floor}: budget not applied`);
}
assert.equal(clear(1, "Fighter", 42), clear(1, "Fighter", 42), "a boss fight isn't deterministic");

const rateOf = (floor: number) => {
  let wins = 0;
  for (let i = 0; i < N; i++) wins += clear(floor, CLASSES[i % CLASSES.length], SEED0 + i * 7919) ? 1 : 0;
  return wins / N;
};

if (TUNING) {
  // More budget, fewer clears: bisect each floor onto its target.
  for (const b of BOSSES) {
    let lo = 200, hi = 560;
    for (let i = 0; i < 8; i++) {
      b.budget = Math.round((lo + hi) / 2);
      if (rateOf(b.floor) > TARGET[b.floor - 1]) lo = b.budget;
      else hi = b.budget;
    }
    b.budget = Math.round((lo + hi) / 2);
    console.log(`floor ${b.floor}: budget ${b.budget}`);
  }
  console.log(`BUDGETS ${JSON.stringify(BOSSES.map((b) => b.budget))}`);
}

console.log(`floor  boss                    clear   target   (${N} matches each, normal CPU as the player, 5 classes)`);
let prev = 1;
let rising = 0;
for (const b of BOSSES) {
  const rate = rateOf(b.floor);
  if (rate > prev + 0.05) rising++;
  prev = rate;
  const t = TARGET[b.floor - 1];
  const mark = Math.abs(rate - t) <= 0.12 ? "" : rate > t ? "  too easy" : "  too hard";
  console.log(`${String(b.floor).padStart(5)}  ${b.title.padEnd(22)}  ${String(Math.round(rate * 100)).padStart(4)}%   ${String(Math.round(t * 100)).padStart(4)}%${mark}`);
}
console.log(rising ? `curve: ${rising} floor(s) easier than the one below` : "curve: falls floor by floor");
