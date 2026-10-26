// The Dungeon: ten floors, one boss each, harder as you climb (Sprint 5; the roster was rebuilt in Sprint 8, docs/changes/sprint-8-bosses.md).
// The floors climb a ladder: street fighters (1-2), trained martial artists (3-4), elite swordsmen (5-6), power users (7-9), the final boss (10).
// Each boss is a parody of one anime fighter (the inspiration is named in the docs only, never here), and everything about it comes from that one
// source: its own punch / kick chains (`kit`), its specials, its passive, its idle and aura (src/game/bossLook.ts) and how the computer plays it
// (`persona`, src/game/bossAi.ts). A boss fights with the floor's stat budget (clampStats honours `budget` / `cap`, which only bosses carry), the
// CPU knobs below, and a passive that only exists inside createMatch(..., { boss: bossRun(floor).spec }) (sim.ts).
// Beating floors 2, 4, 6, 8 and 10 unlocks the five special kinds in UNLOCK_FLOOR (moves.ts); the other floors unlock a named, element-tinted
// variant of a base kind (VARIANTS below).

import type { Knobs } from "./cpu";
import type { PersonaId } from "./bossAi";
import { BASE_KINDS, SPECIAL_INFO, SPECIAL_KINDS, UNLOCK_FLOOR, UNLOCK_KINDS, type BossKit, type SideSkill, type SpecialKind } from "./moves";
import type { BossSpec, FighterStats, PassiveId } from "./sim";
import type { PublicFighter } from "./protocol";

export const TIERS = ["Street fighter", "Martial artist", "Swordsman", "Power user", "Final boss"] as const;
export type Tier = (typeof TIERS)[number];

type Stats = { atk: number; def: number; spd: number; agi: number; iq: number };
type PassiveInfo = { name: string; rule: string; telegraph: string; hint: string }; // rule / telegraph: for the sim and the renderer; hint: for players

export type Boss = {
  floor: number;
  tier: Tier;
  title: string;
  epithet: string;
  archetype: string;
  cls: string;
  style: string;
  item: string;
  element: string;
  special: SpecialKind; // L
  ult: SpecialKind; // S + L (a kind only a boss has is set through BossSpec.ult instead of the stat line)
  moves: { special: string; ult: string }; // what the HUD calls them
  skill?: SideSkill; // null: the class's own
  kit: BossKit; // its own punch (J) and kick (K) chains over its class's and style's
  persona: PersonaId; // how the computer plays it
  budget: number; // stat points (players have 350), tuned by scripts/dungeon.ts --tune onto the clear-rate curve
  cap: number; // highest allowed stat
  stats: Stats;
  cpu: Pick<Knobs, "react" | "block" | "aggro" | "dodge" | "think"> & Partial<Pick<Knobs, "skill" | "ult">>; // cpu.ts knobs
  passive: PassiveInfo & { id: PassiveId };
  counterplay: string;
  teaches: string;
  taunt: string;
  reward: { type: "element_variant" | "new_special_kind"; name: string; kind: SpecialKind; element?: string; description: string };
  phase2?: Phase2;
  phase2Taunt?: string;
};

// The second form (floor 10): a whole new kit at 50% health (sim.ts checkPhase2).
export type Phase2 = {
  title: string; class: string; style: string; item: string; element: string; special: SpecialKind; ult: SpecialKind;
  moves: { special: string; ult: string };
  kit: BossKit;
  persona: PersonaId;
  banner: string; // across the arena when the form changes
  stats: Stats;
  cpu: Pick<Knobs, "react" | "block" | "aggro" | "dodge" | "think"> & Partial<Pick<Knobs, "skill" | "ult">>;
  passive: PassiveInfo & { id: PassiveId };
  counterplay: string;
};

export const BOSSES: Boss[] = [
  // ------------------------------------------------------------------ street fighters
  {
    floor: 1,
    tier: "Street fighter",
    title: "Brass Shin",
    epithet: "the Wrecking Kick",
    archetype: "a corner-store bruiser whose one huge kick breaks guards",
    cls: "Mace",
    style: "Muay Thai",
    item: "nothing",
    element: "FIRE",
    special: "wave",
    ult: "wave",
    moves: { special: "Forbidden Thai Cannon", ult: "Bad Guy Destroyer" },
    kit: { punch: ["jab", "elbow"], kick: ["kneeStomp", "roundhouse", "shinCannon"] },
    persona: "brawler",
    budget: 297,
    cap: 100,
    stats: { atk: 92, def: 80, spd: 58, agi: 52, iq: 44 },
    cpu: { react: 20, block: 0.2, aggro: 0.62, dodge: 0.25, think: 11 },
    passive: {
      id: "guard-crush",
      name: "Guard Crush",
      rule: "Brass Shin's Compressed Kick (the finisher of his kick string) goes through a guard: the hit lands whole, and the guard stays down for 40 ticks. His other hits are blocked as usual.",
      telegraph: "The finisher starts with a stomp: the front foot drives into the floor and a ring of cracks spreads, the rear leg is cocked back and the shin glows orange. Fifteen ticks later it swings.",
      hint: "his big kick breaks your guard. When you see the stomp, step back or hop it: don't block.",
    },
    counterplay: "Block the jab and the elbow, but when the foot stomps and the cracks spread, walk out of the kick's reach (or jump). It has a long recovery, so then you hit him freely. Don't trade with the wind-up: a mace-class finisher does not flinch from light hits.",
    teaches: "Reading a telegraph: block the small hits, avoid the big one, punish the long recovery.",
    taunt: "Block this. Go on. Everybody tries.",
    reward: { type: "element_variant", name: "Hero's Shin Wrecker", kind: "wave", element: "FIRE", description: "A ground-hugging shockwave off a heavy kick, and it leaves what it hits burning." },
  },
  {
    floor: 2,
    tier: "Street fighter",
    title: "Crosshatch",
    epithet: "the Eraser Hand",
    archetype: "a scarred wanderer whose right hand takes things apart",
    cls: "Fighter",
    style: "Street",
    item: "nothing",
    element: "ELECTRIC",
    special: "shatter",
    ult: "shatter",
    moves: { special: "Matter Break", ult: "Tattoo Touch" },
    skill: "poise",
    kit: { punch: ["hook", "palm", "heartPunch"], kick: ["frontKick", "lowKick"] },
    persona: "grappler",
    budget: 297,
    cap: 100,
    stats: { atk: 92, def: 82, spd: 66, agi: 58, iq: 52 },
    cpu: { react: 13, block: 0.42, aggro: 0.72, dodge: 0.4, think: 8 },
    passive: {
      id: "fracture",
      name: "Fracture",
      rule: "Each clean hit by Crosshatch adds a crack (up to 3; they close after 90 ticks without a landed hit). The hit that lands at 3 cracks deconstructs you: bleed for 3 s. A blocked hit closes the cracks.",
      telegraph: "Red crack lines creep up his right arm, one more for each stack. At three the whole arm glows and sheds sparks: the next hit is the one.",
      hint: "three clean hits in a row and the next one makes you bleed. Block one and he starts over. And watch the open hand: it grabs through your guard.",
    },
    counterplay: "Block his strings to keep the cracks at 0. When the open palm comes forward (a grab), do not block: jump or step back, then punish the 30 ticks of recovery it leaves.",
    teaches: "Blocking works, except against a grab: jump or step the grab.",
    taunt: "Hold your guard up. It is only in my way.",
    reward: { type: "new_special_kind", name: "Matter Break", kind: "shatter", description: "A short-range grab (reach 60 px, startup 12, active 4, recovery 30). Cannot be blocked. Misses airborne targets." },
  },
  // ------------------------------------------------------------------ trained martial artists
  {
    floor: 3,
    tier: "Martial artist",
    title: "Pip Punchline",
    epithet: "the Rolling Fist",
    archetype: "a small, tireless boxer who never stops moving his head",
    cls: "Fighter",
    style: "Boxing",
    item: "nothing",
    element: "BLEED",
    special: "uppercut",
    ult: "barrage",
    moves: { special: "Antelope Strike", ult: "Infinity Hooks" },
    kit: { punch: ["flickerJab", "corkscrew", "gazelleHook", "dempsey"], kick: ["lowKick"] },
    persona: "boxer",
    budget: 309,
    cap: 100,
    stats: { atk: 78, def: 64, spd: 94, agi: 88, iq: 60 },
    cpu: { react: 11, block: 0.55, aggro: 0.75, dodge: 0.55, think: 7 },
    passive: {
      id: "afterimage",
      name: "Bob & Weave",
      rule: "Once every 360 ticks, the first hit that would land while Pip is on the move is slipped: no damage, no hit-stun, and he slides 60 px.",
      telegraph: "While the slip is ready his head bobs side to side and a faint ghost of his gloves trails behind. When it is spent the ghost disappears until it recharges.",
      hint: "hit him while he is bobbing and he slips it. Wait for him to stop, then answer his string.",
    },
    counterplay: "Do not swing at a bobbing target: the slip is ready. Wait until he stops to throw, block the first jab of the string, and hit him after the last punch. Infinity Hooks is a long barrage: block it, then punish.",
    teaches: "Patience against a slippery target: hit on the stop, not on the move.",
    taunt: "Left, right, left. You keep swinging at where I was.",
    reward: { type: "element_variant", name: "Antelope Strike", kind: "uppercut", element: "BLEED", description: "A leaping uppercut from a crouch. The cut it leaves bleeds while the target keeps moving." },
  },
  {
    floor: 4,
    tier: "Martial artist",
    title: "Pale Ogre",
    epithet: "the Counter Smash",
    archetype: "a calm, patient master who lets you swing first",
    cls: "Tank",
    style: "Karate",
    item: "nothing",
    element: "NONE",
    special: "counter",
    ult: "charge",
    moves: { special: "Pale Counter", ult: "Oni Ink Smash" },
    kit: { punch: ["seiken", "palm"], kick: ["lowKick", "roundhouse", "kaitenGeri"] },
    persona: "counterer",
    budget: 350,
    cap: 100,
    stats: { atk: 88, def: 96, spd: 62, agi: 70, iq: 84 },
    cpu: { react: 9, block: 0.6, aggro: 0.6, dodge: 0.55, think: 7 },
    passive: {
      id: "whiteout-guard",
      name: "Aikido Redirect",
      rule: "Each hit Pale Ogre blocks adds a crack (they close after 120 ticks without another). The third redirects the attacker: thrown back 16 px/tick and stunned for 22 ticks.",
      telegraph: "Hairline cracks appear on his guard, one per blocked hit. At two his eyes turn white and black-and-crimson smoke rises off him.",
      hint: "three blocked hits and he throws you across the page. Hit his guard twice, then stop.",
    },
    counterplay: "Don't mash into his guard: hit twice, then wait, step back or jump over. When the open-palm stance is up, do not attack: back off and punish its recovery. Specials push through a block.",
    teaches: "Do not mash into a guard: pace your pressure, bait the counter, punish the whiff.",
    taunt: "Swing. I am in no hurry.",
    reward: { type: "new_special_kind", name: "White Ogre Counter", kind: "counter", description: "A 24-tick stance. If a melee hit lands on you in that window, it deals no damage and you strike back for 1.5x your punch damage. Projectiles go through. A whiffed stance leaves 30 ticks of recovery." },
  },
  // ------------------------------------------------------------------ elite swordsmen
  {
    floor: 5,
    tier: "Swordsman",
    title: "Yellow Streak",
    epithet: "the Sleeping Thunder",
    archetype: "a trembling swordsman who does exactly one thing, faster than you can blink",
    cls: "Sword",
    style: "Karate",
    item: "sword",
    element: "ELECTRIC",
    special: "teleport",
    ult: "teleport",
    moves: { special: "Static Dash", ult: "Thunder Bolt: Sixfold" },
    kit: { punch: ["thunderclap"], kick: ["thunderclap"] },
    persona: "sheathed",
    budget: 299,
    cap: 115,
    stats: { atk: 98, def: 54, spd: 112, agi: 98, iq: 50 },
    cpu: { react: 8, block: 0.5, aggro: 0.9, dodge: 0.6, think: 6 },
    passive: {
      id: "sheathed-draw",
      name: "Sheathed Draw",
      rule: "If Yellow Streak has stood still (no step, no swing) for 20 ticks, his next swing is a draw: a lightning dash (3x lunge) for 1.5x damage, then 12 extra ticks of recovery.",
      telegraph: "Yellow sparks crawl along the scabbard from the first tick of stillness. At 20 ticks the blade flashes white and the whole body crackles: the next swing dashes.",
      hint: "when he crackles white he is about to dash through you. Don't stand off at range: block or hop the dash, and hit him while he sheathes.",
    },
    counterplay: "Stay outside his dash and he waits; step in and he draws. Block the dash (or jump it) and punish the 12 extra ticks of recovery, then stay close: after a draw he needs 20 ticks of stillness to arm again. Or grab him while he stands arming it.",
    teaches: "Reacting to a telegraph: block on a visual cue, then punish a long recovery.",
    taunt: "I don't want to fight! (...zzz)",
    reward: { type: "element_variant", name: "Static Dash", kind: "teleport", element: "ELECTRIC", description: "Vanish in a crack of thunder and strike from behind; the hit leaves them stunned." },
  },
  {
    floor: 6,
    tier: "Swordsman",
    title: "Triple Nib",
    epithet: "Lord of the Three Pens",
    archetype: "a swordsman with three blades who never stops walking forward",
    cls: "Sword",
    style: "Karate",
    item: "sword",
    element: "POISON",
    special: "dash_slash",
    ult: "teleport",
    moves: { special: "Triple Blade", ult: "Lion's Ink Song" },
    kit: { punch: ["iai", "risingSlash", "oniCut"] },
    persona: "swordsman",
    budget: 286,
    cap: 115,
    stats: { atk: 98, def: 90, spd: 78, agi: 72, iq: 72 },
    cpu: { react: 7, block: 0.62, aggro: 0.85, dodge: 0.65, think: 5 },
    passive: {
      id: "unbending-spine",
      name: "Nothing Happened",
      rule: "While Triple Nib is in the wind-up of a swing, normal hits do not interrupt him and do 20% less damage. Launchers, specials and projectiles flinch him as usual.",
      telegraph: "Every armoured wind-up flashes a green-and-black flame along the blades; a hit absorbed sparks green instead of red.",
      hint: "you can't stop his swings once they wind up. Block, or sweep him: don't trade.",
    },
    counterplay: "Don't trade jabs with a wind-up: block the cross-cut and punish its recovery. Launchers (sweep, uppercut) and specials break the armour. When you turtle, expect the cut from behind.",
    teaches: "Not trading: block, then punish the recovery; know which of your moves beat armour.",
    taunt: "Which way is the exit? Never mind. It's through you.",
    reward: { type: "new_special_kind", name: "Triple Blade", kind: "dash_slash", description: "Dash 220 px straight through the opponent (startup 10, active 8, recovery 22) and hit once as you pass. You end up behind them." },
  },
  // ------------------------------------------------------------------ power users
  {
    floor: 7,
    tier: "Power user",
    title: "Rubber Bo",
    epithet: "the Elastic Storm",
    archetype: "a cheerful brawler whose arms stretch across the page",
    cls: "Fighter",
    style: "Street",
    item: "nothing",
    element: "GRAVITY",
    special: "barrage",
    ult: "barrage",
    moves: { special: "Rubber Rapid", ult: "Cartoon Red Fist" },
    kit: { punch: ["pistol", "pistol", "bazooka"], kick: ["whip"] },
    persona: "poker",
    budget: 288,
    cap: 115,
    stats: { atk: 92, def: 86, spd: 92, agi: 82, iq: 62 },
    cpu: { react: 6, block: 0.6, aggro: 0.8, dodge: 0.7, think: 5 },
    passive: {
      id: "rubber",
      name: "Rubber Body",
      rule: "Blows from fists (the punch string) deal 65% to Rubber Bo. Kicks, weapons, projectiles and specials hit him as normal.",
      telegraph: "A punch that lands on him bounces off: a wobble and a BOING. His arms stretch to the full length of their reach.",
      hint: "punches barely hurt him. Kick him, or use your specials.",
    },
    counterplay: "He hits first from 150 px: hop in or step inside his reach, where he backs away. Kick him (K), don't punch: kicks, blades and specials hit for full.",
    teaches: "Spacing against reach, and changing tools when one doesn't work.",
    taunt: "Heehee! Stretch, stretch, stretch!",
    reward: { type: "element_variant", name: "Elastic Ink Gatling", kind: "barrage", element: "GRAVITY", description: "A flurry of stretched fists, and each hit drags the target back into range." },
  },
  {
    floor: 8,
    tier: "Power user",
    title: "Asymptote",
    epithet: "the Limitless Margin",
    archetype: "a blindfolded sorcerer who is never quite where the pen lands",
    cls: "Attacker",
    style: "Systema",
    item: "nothing",
    element: "GRAVITY",
    special: "pull",
    ult: "beam",
    moves: { special: "Blue Pull", ult: "Void Grape" },
    kit: {},
    persona: "zoner",
    budget: 316,
    cap: 115,
    stats: { atk: 58, def: 84, spd: 100, agi: 105, iq: 115 },
    cpu: { react: 5, block: 0.72, aggro: 0.7, dodge: 0.88, think: 4 },
    passive: {
      id: "infinite-margin",
      name: "Infinite Margin",
      rule: "Projectile hits on Asymptote deal 40% (blasts) or 60% (projectile specials) unless he is reeling or mid-special. If you stay within 110 px of him for 90 ticks in total, he blinks 600 px away after an 18-tick shimmer (cooldown 300 ticks). A clean hit during the shimmer cancels the blink.",
      telegraph: "Concentric rings ripple round him and projectiles slow near his body. The blink shimmer is an 18-tick ink-blot ripple centred on him, short but always the same.",
      hint: "your projectiles barely hurt him, and if you crowd him he blinks across the page. Fight him at close range, and keep after him.",
    },
    counterplay: "Zoning loses here, so walk him into a corner instead. Keep up close pressure, but hit him as soon as the ripple starts to cancel the blink. Block the pull's hook (it is a slow projectile), and jump the purple beam.",
    teaches: "Committed rushdown and cornering: keep the pressure on an opponent who wants space.",
    taunt: "You can get closer. You just cannot arrive.",
    reward: { type: "new_special_kind", name: "Blue Pull", kind: "pull", description: "A slow, short projectile (range 300 px). On hit it does light damage, pulls the target to 80 px in front of you and steals 25 energy. Blockable." },
  },
  {
    floor: 9,
    tier: "Power user",
    title: "Saffron Spike",
    epithet: "the Wave Master",
    archetype: "a cheerful champion who gathers his strength, then fires it",
    cls: "Fighter",
    style: "Karate",
    item: "nothing",
    element: "FROST",
    special: "beam",
    ult: "uppercut",
    moves: { special: "K-Wave", ult: "Golden Serpent Fist" },
    kit: {},
    persona: "charger",
    budget: 327,
    cap: 115,
    stats: { atk: 100, def: 92, spd: 96, agi: 90, iq: 94 },
    cpu: { react: 5, block: 0.72, aggro: 0.78, dodge: 0.8, think: 4, ult: 0.6 },
    passive: {
      id: "charge-up",
      name: "Ki Charge",
      rule: "While Saffron Spike stands still and is not blocking, his meter fills 3x faster. A special fired after 2 s of charge (120 ticks) hits 30% harder. Moving, swinging or blocking lets the charge drain away.",
      telegraph: "A cyan aura gathers round him and grows in three steps as the charge builds; at the last step it turns gold and the floor shakes.",
      hint: "while he stands still his meter fills three times faster, and a fully charged wave hits harder. Don't leave him alone.",
    },
    counterplay: "Rush him while he stands: a charging fighter is open. Hop the beam (it is thrown from range) or block its chip. If the aura has turned gold, a charged wave is coming.",
    teaches: "Interrupting a charge-up: close the distance on a target that stands still.",
    taunt: "Wow, you're strong! Let's see how strong!",
    reward: { type: "element_variant", name: "Turtle Ink Wave", kind: "beam", element: "FROST", description: "A charged beam whose hit chills the target: it walks slower." },
  },
  // ------------------------------------------------------------------ the final boss
  {
    floor: 10,
    tier: "Final boss",
    title: "The Overdue",
    epithet: "King of Borrowed Time",
    archetype: "a king who stops the clock, then fills the moment with knives",
    cls: "Fighter",
    style: "Street",
    item: "nothing",
    element: "BLEED",
    special: "arrow",
    ult: "time_stop_barrage",
    moves: { special: "Blade Fan", ult: "Paused Ink World" },
    skill: "bubble",
    kit: { punch: ["mudaJab", "mudaJab", "mudaJab", "mudaJab", "hook"], kick: ["frontKick", "lowKick"] },
    persona: "timekeeper",
    budget: 300,
    cap: 115,
    stats: { atk: 106, def: 96, spd: 98, agi: 86, iq: 100 },
    cpu: { react: 9, block: 0.5, aggro: 0.6, dodge: 0.5, think: 8, ult: 0.5 },
    passive: {
      id: "time-stop",
      name: "Borrowed Time",
      rule: "At a full meter The Overdue can stop time: after a 10-tick tell, anyone within 180 px is held in front of him while eight blows land, then launched, and the two knives he laid fall where they land. Out of reach, the stop finds nobody and he is left standing. At half health he unseals a second form: the stop lasts 10 ticks longer, lands ten blows and lays four knives, and his special becomes a delayed cut.",
      telegraph: "A gold clock face floats over his head and its hand sweeps with his meter; at a full meter it flashes. The stop itself freezes the world for a beat and inverts every colour.",
      hint: "a flashing clock above his head means the next thing he does is stop time. Stay outside 180 px, or hit him before it lands.",
    },
    counterplay: "Watch the clock. With it flashing, stay out of 180 px (the stop finds nobody) or hit him in the ten-tick tell. Hop the knives, walk off the cut in the second form, and block his jab strings. Everything from floors 1-9 applies.",
    teaches: "The final exam: block discipline, punishing recovery, spacing, and reading a form change.",
    taunt: "Your time was already up. I merely held it for you.",
    reward: { type: "new_special_kind", name: "Stopped Clock", kind: "remote_detonation", description: "Mark the opponent's current x. 40 ticks later a vertical cut lands there (40 px wide). Blockable; avoided by moving." },
    phase2: {
      title: "The Overdue, Unwound",
      class: "Fighter",
      style: "Street",
      item: "nothing",
      element: "BLEED",
      special: "remote_detonation",
      ult: "time_stop_barrage",
      moves: { special: "Stopped Clock", ult: "Paused Ink World: Overtime" },
      kit: { punch: ["mudaJab", "mudaJab", "mudaJab", "mudaJab", "hook"], kick: ["frontKick", "lowKick"] },
      persona: "timekeeper",
      banner: "TIME UNWINDS",
      stats: { atk: 110, def: 82, spd: 104, agi: 82, iq: 110 },
      cpu: { react: 3, block: 0.8, aggro: 0.92, dodge: 0.88, think: 3, ult: 1 },
      passive: {
        id: "time-stop",
        name: "Borrowed Time, Unwound",
        rule: "The same stop, ten ticks longer, ten blows and four knives. His special marks where you stand and cuts there 40 ticks later (a knife left hanging in stopped time).",
        telegraph: "The clock above his head spins faster and is cracked; the page tints gold and violet.",
        hint: "the clock spins faster and the stops last longer. Keep out of 180 px when it flashes.",
      },
      counterplay: "Never block on top of the mark: walk off it, then block. He has less durability in this form (DUR 82), so your punishes hit harder; keep out of 180 px with a full clock.",
    },
    phase2Taunt: "Fine. I will stop being polite, and start being late.",
  },
];

export const FLOORS = BOSSES.length;

// A boss as a fighter for the sim and the renderer. `budget`/`cap` lift its stats past the player's 350. A kind only a boss has is not on the stat line
// (the sim refuses it there); it goes in through bossRun(floor).spec.
export function bossFighter(floor: number): PublicFighter & { budget: number; cap: number } {
  const b = BOSSES[floor - 1];
  return {
    id: `boss-${b.floor}`,
    name: b.title,
    class: b.cls,
    imageUrl: `/boss-art/${b.floor}`,
    specialMove: b.moves.special,
    ultMove: b.moves.ult,
    hp: 200,
    ...b.stats,
    element: b.element,
    item: b.item,
    specialKind: b.special,
    ultKind: (SPECIAL_KINDS as readonly string[]).includes(b.ult) ? b.ult : null,
    style: b.style,
    sideSkill: b.skill ?? null,
    budget: b.budget,
    cap: b.cap,
  };
}

// The sim's side of a boss (passive, kit, second form) and the CPU's (knobs and persona per form), built once per floor so a React
// effect that depends on it doesn't restart the match.
export type BossRun = { spec: BossSpec; cpu: Partial<Knobs>; persona: PersonaId; cpu2?: Partial<Knobs>; persona2?: PersonaId };
const runs = new Map<number, BossRun>();
const bossOnly = (kind: SpecialKind) => !(SPECIAL_KINDS as readonly string[]).includes(kind);
export function bossRun(floor: number): BossRun {
  let r = runs.get(floor);
  if (!r) {
    const b = BOSSES[floor - 1];
    const p2 = b.phase2;
    const stats: FighterStats | null = p2
      ? { hp: 200, ...p2.stats, class: p2.class, item: p2.item, style: p2.style, element: p2.element, specialKind: p2.special, sideSkill: b.skill ?? null, budget: b.budget, cap: b.cap }
      : null;
    r = {
      spec: {
        slot: 1,
        passive: b.passive.id,
        floor: b.floor,
        kit: b.kit,
        ...(bossOnly(b.ult) && { ult: b.ult }),
        ...(p2 && stats && { phase2: { stats, passive: p2.passive.id, cls: p2.class, item: p2.item, kit: p2.kit, banner: p2.banner, ...(bossOnly(p2.ult) && { ult: p2.ult }) } }),
      },
      cpu: b.cpu,
      persona: b.persona,
      ...(p2 && { cpu2: p2.cpu, persona2: p2.persona }),
    };
    runs.set(floor, r);
  }
  // The second form shares the floor's budget, and the tuner (scripts/dungeon.ts) changes budgets on the fly.
  if (r.spec.phase2) {
    r.spec.phase2.stats.budget = BOSSES[floor - 1].budget;
    r.spec.phase2.stats.cap = BOSSES[floor - 1].cap;
  }
  return r;
}

// The CPU's knobs and persona for the form the boss is in now.
export const bossKnobs = (run: BossRun, phase: 1 | 2 | undefined): Partial<Knobs> => (phase === 2 && run.cpu2 ? run.cpu2 : run.cpu);
export const bossPersona = (run: BossRun, phase: 1 | 2 | undefined): PersonaId => (phase === 2 && run.persona2 ? run.persona2 : run.persona);

// ---------------------------------------------------------------- what the floors unlock

// The odd floors' rewards: a named, element-tinted version of a base kind (the element is set with it).
export type Variant = { floor: number; id: string; name: string; kind: SpecialKind; element: string; description: string };
export const VARIANTS: Variant[] = BOSSES.filter((b) => b.reward.type === "element_variant").map((b) => ({
  floor: b.floor,
  id: `v${b.floor}`,
  name: b.reward.name,
  kind: b.reward.kind,
  element: b.reward.element ?? "NONE",
  description: b.reward.description,
}));

// One entry per thing a player can pick for the special slot, given the floors they have cleared.
export type SpecialChoice = { id: string; label: string; kind: SpecialKind; how: string; variant?: Variant };
export function specialChoices(cleared: number): SpecialChoice[] {
  return [
    ...BASE_KINDS.map((k) => ({ id: k, label: k, kind: k, how: SPECIAL_INFO[k].looks })),
    ...UNLOCK_KINDS.filter((k) => UNLOCK_FLOOR[k] <= cleared).map((k) => ({ id: k, label: k.replace("_", " "), kind: k, how: SPECIAL_INFO[k].looks })),
    ...VARIANTS.filter((v) => v.floor <= cleared).map((v) => ({ id: v.id, label: `${v.name} (${v.kind}, ${v.element.toLowerCase()})`, kind: v.kind, how: v.description, variant: v })),
  ];
}
// Kinds an ultimate may be (variants are for the special slot only).
export const ultChoices = (cleared: number): SpecialKind[] => [...BASE_KINDS, ...UNLOCK_KINDS.filter((k) => UNLOCK_FLOOR[k] <= cleared)];

// null when `kind` may be picked with `cleared` floors done, else why not.
export function lockedReason(kind: string, cleared: number): string | null {
  const floor = UNLOCK_FLOOR[kind as keyof typeof UNLOCK_FLOOR];
  if (!floor || floor <= cleared) return null;
  return `${kind.replace("_", " ")} is locked: beat floor ${floor} of the Dungeon (${BOSSES[floor - 1].title}) to copy it.`;
}
