// The Dungeon: ten floors, one boss each, harder as you climb (Sprint 5). Boss data is game data, written
// from docs/research/v2/bosses.json (original titles only). Bosses fight as tinted stickmen drawn by
// /boss-art/[floor], with the floor's stat budget (clampStats honours `budget`/`cap`, which only bosses carry),
// CPU knobs, and a passive that only exists inside createMatch(..., { boss: bossRun(floor).spec }) (sim.ts).
// Beating floors 2, 4, 6, 8 and 10 unlocks the five special kinds in UNLOCK_FLOOR (moves.ts); the other floors
// unlock a named, element-tinted variant of an existing kind (VARIANTS below).

import type { Knobs } from "./cpu";
import { BASE_KINDS, SPECIAL_INFO, UNLOCK_FLOOR, UNLOCK_KINDS, type SpecialKind } from "./moves";
import type { BossSpec, FighterStats, PassiveId } from "./sim";
import type { PublicFighter } from "./protocol";

export type Boss = {
  floor: number;
  title: string;
  epithet: string;
  archetype: string;
  cls: string;
  style: string;
  item: string;
  element: string;
  special: string; // a SpecialKind, or one of the new kinds still to build
  tint: string; // ink colour of the boss's stickman
  budget: number; // stat points (players have 350), tuned by scripts/dungeon.ts --tune onto the clear-rate curve
  cap: number; // highest allowed stat
  stats: { atk: number; def: number; spd: number; agi: number; iq: number };
  cpu: { react: number; block: number; aggro: number; dodge: number; think: number }; // cpu.ts knobs
  passive: { id: PassiveId; name: string; rule: string; telegraph: string; hint: string }; // rule/telegraph: for the sim; hint: for players
  counterplay: string;
  teaches: string;
  taunt: string;
  reward: { type: string; name: string; kind: string; element?: string; description: string };
  phase2?: Phase2;
  phase2Taunt?: string;
};

// The second form (floor 10): a whole new kit at 50% health. `cpu.special` (a keener special) has no matching knob in cpu.ts, so it is unused.
export type Phase2 = {
  title: string; class: string; style: string; item: string; element: string; special: string;
  stats: { atk: number; def: number; spd: number; agi: number; iq: number };
  cpu: { react: number; block: number; aggro: number; dodge: number; think: number; special?: number };
  passive: { name: string; rule: string; telegraph: string; hook?: string; implementation?: string };
  trigger?: string; transition?: unknown; ai_personality?: string; // design notes: the sim implements them (sim.ts checkPhase2)
  counterplay: string;
};

export const BOSSES: Boss[] = [
  {
    floor: 1,
    title: "Smudge",
    epithet: "the Margin Runner",
    archetype: "a very fast assassin who wins with speed and dodges, not power",
    cls: "Fighter",
    style: "Systema",
    item: "nothing",
    element: "BLEED",
    special: "teleport",
    tint: "#6b6b73",
    budget: 350,
    cap: 100,
    stats: {
      atk: 62,
      def: 48,
      spd: 96,
      agi: 92,
      iq: 52
    },
    cpu: {
      react: 15,
      block: 0.38,
      aggro: 0.55,
      dodge: 0.4,
      think: 9
    },
    passive: {
      id: "afterimage",
      name: "Afterimage",
      rule: "Once every 360 ticks, the first unblocked hit that would land while Smudge is walking (f.moving) misses: no damage, no hit-stun. Smudge slides 60 px away from the attacker and leaves a grey smear.",
      telegraph: "While the afterimage is ready (pv.cd === 0) a faint grey copy trails 1 frame behind Smudge's body. When it is spent, the trail disappears until it recharges.",
      hint: "a hit on Smudge while it walks with its grey trail just misses. Strike when it stops to attack."
    },
    counterplay: "Do not swing at Smudge while it is walking with the grey trail on. Wait for it to attack and punish the recovery (it is standing still then, so no afterimage). After the teleport, turn and block: it always reappears behind you.",
    teaches: "Whiff punishing and patience: hit an opponent in its recovery, not while it is moving.",
    taunt: "Blink and you miss me. Do not blink and you still miss me.",
    reward: {
      type: "element_variant",
      name: "Smudge Step",
      kind: "teleport",
      element: "BLEED",
      description: "Vanish, reappear behind them, and leave a paper cut that bleeds while they walk."
    }
  },
  {
    floor: 2,
    title: "Cinder Knuckle",
    epithet: "the Scorched Doodle",
    archetype: "a hot-headed brawler with burning fists who rushes you down",
    cls: "Fighter",
    style: "Street",
    item: "nothing",
    element: "FIRE",
    special: "shatter",
    tint: "#e5482d",
    budget: 311,
    cap: 100,
    stats: {
      atk: 98,
      def: 78,
      spd: 72,
      agi: 60,
      iq: 57
    },
    cpu: {
      react: 13,
      block: 0.44,
      aggro: 0.68,
      dodge: 0.45,
      think: 8
    },
    passive: {
      id: "heat-stacks",
      name: "Heat Stacks",
      rule: "Each unblocked normal hit Cinder lands adds 1 heat (max 3). Heat fades after 90 ticks without a landed hit. Any blocked Cinder hit resets heat to 0. A normal hit landed at 3 heat applies FIRE (burn, as an element special would) and resets heat to 0.",
      telegraph: "The fists glow brighter per stack: 0 plain ink, 1 orange rim, 2 orange fill, 3 flames plus a flicker. The 3-stack hit is always the next punch, so flames mean 'block now'.",
      hint: "three clean hits in a row and the next punch sets you on fire. Block one and its heat is gone."
    },
    counterplay: "Block the strings to keep heat at 0. When the fists show flames, block for sure. When the open-hand super-flash appears, jump or walk back: shatter cannot be blocked but misses airborne targets and has 30 ticks of recovery to punish.",
    teaches: "Blocking, and the one exception to it: grabs beat block, so jump the grab.",
    taunt: "I only have two settings: on fire and about to set you on fire.",
    reward: {
      type: "new_special_kind",
      name: "Knuckle Crumple",
      kind: "shatter",
      description: "A short-range grab (reach 60 px, startup 12, active 4, recovery 30). Cannot be blocked. Misses airborne targets. Damage multiplier is set in the SPECIAL_TUNE pass."
    }
  },
  {
    floor: 3,
    title: "Volt Nib",
    epithet: "Swordsman of the Charged Line",
    archetype: "a lightning swordsman whose single dashing draw-cut is his whole game",
    cls: "Sword",
    style: "Karate",
    item: "sword",
    element: "ELECTRIC",
    special: "slash",
    tint: "#2f5be0",
    budget: 327,
    cap: 100,
    stats: {
      atk: 92,
      def: 62,
      spd: 94,
      agi: 72,
      iq: 60
    },
    cpu: {
      react: 12,
      block: 0.5,
      aggro: 0.62,
      dodge: 0.52,
      think: 7
    },
    passive: {
      id: "sheathed-draw",
      name: "Sheathed Draw",
      rule: "If Volt Nib has stood still (no walking, no attack) for 20 ticks or more, his next punch-chain opener is a draw-cut: lunge x3, damage x1.5, then +12 recovery ticks. The charge is spent on hit, block or whiff.",
      telegraph: "Blue sparks crawl along the blade from tick 1 of stillness; at tick 20 the blade flashes white and stays lit. A lit blade means the next swing dashes.",
      hint: "stand still and its blade charges: the next swing dashes in for half again the damage. Don't stand off at range."
    },
    counterplay: "When the blade is lit, do not walk in and do not throw a button at range. Block the dash (or jump it), then punish the 12 extra recovery ticks. Or grab him with Knuckle Crumple while he is standing still arming it.",
    teaches: "Reacting to a telegraph: block on a visual cue, then punish a long recovery.",
    taunt: "I draw once. The page does the rest.",
    reward: {
      type: "element_variant",
      name: "Static Crescent",
      kind: "slash",
      element: "ELECTRIC",
      description: "A dashing crescent that adds the electric stun on hit."
    }
  },
  {
    floor: 4,
    title: "Whiteout",
    epithet: "the Correction-Fluid Ghost",
    archetype: "a pale, calm tank-fighter who turtles behind a guard and counters",
    cls: "Tank",
    style: "Muay Thai",
    item: "shield",
    element: "FROST",
    special: "counter",
    tint: "#dfe6ee",
    budget: 354,
    cap: 100,
    stats: {
      atk: 76,
      def: 100,
      spd: 62,
      agi: 67,
      iq: 90
    },
    cpu: {
      react: 11,
      block: 0.62,
      aggro: 0.45,
      dodge: 0.5,
      think: 7
    },
    passive: {
      id: "whiteout-guard",
      name: "Whiteout Guard",
      rule: "Each hit Whiteout blocks adds a crack. At 3 cracks within 120 ticks, the guard bursts: the attacker is shoved back 14 px/tick and gets FROST for 60 ticks (half the normal frost time). Cracks reset after the burst or after 120 ticks with no blocked hit.",
      telegraph: "Hairline cracks appear on the shield, one per blocked hit. At 2 cracks the shield frosts over and gives off a white mist.",
      hint: "three blocked hits in a row burst its guard, shoving you back and freezing you. Don't just hammer its shield."
    },
    counterplay: "Hit the guard at most twice, then stop, wait, or jump over. Use specials (they push 40% through a block) and low sweeps. When the white counter outline is up, do not attack: walk back and punish its 30-tick whiff recovery.",
    teaches: "Not mashing into a guard: pace your pressure and bait the counter.",
    taunt: "Write whatever you like. I am the part that goes over it.",
    reward: {
      type: "new_special_kind",
      name: "Whiteout Parry",
      kind: "counter",
      description: "A 24-tick stance. If a melee hit lands on you in that window, it deals no damage and you strike back for 1.5x your punch damage. Projectiles go through. A whiffed stance leaves 30 ticks of recovery."
    }
  },
  {
    floor: 5,
    title: "Prince Vellum",
    epithet: "Heir to the Hardcover",
    archetype: "a proud royal zoner who fires energy blasts and a huge beam",
    cls: "Attacker",
    style: "Boxing",
    item: "nothing",
    element: "GRAVITY",
    special: "beam",
    tint: "#7b4fd6",
    budget: 297,
    cap: 100,
    stats: {
      atk: 70,
      def: 66,
      spd: 82,
      agi: 92,
      iq: 100
    },
    cpu: {
      react: 10,
      block: 0.55,
      aggro: 0.66,
      dodge: 0.7,
      think: 6
    },
    passive: {
      id: "royal-pride",
      name: "Royal Pride",
      rule: "Below 40% HP, the Prince's energy gain doubles and each Attacker punch blast fires a second blast 8 ticks after the first (same damage, same height).",
      telegraph: "At the threshold, a 'banner' crown of ink appears above the head and the body outline thickens. Doubled blasts have a faint second ring.",
      hint: "below 40% health its meter fills twice as fast and every blast comes in pairs. Finish it fast."
    },
    counterplay: "Approach in hops: jump over a blast, walk while it recovers, block the beam (chip only). Once you are close he is the weakest boss in melee. Finish him fast once the crown appears; do not trade blasts at range.",
    teaches: "Approaching a zoner: jump projectiles, close distance, and push the advantage at low HP.",
    taunt: "Kneel. It saves you the trouble of being knocked down.",
    reward: {
      type: "element_variant",
      name: "Crown Pressure Beam",
      kind: "beam",
      element: "GRAVITY",
      description: "A charged beam whose hits slam the target to the floor with gravity."
    }
  },
  {
    floor: 6,
    title: "Dawnstroke",
    epithet: "the Sunline Dancer",
    archetype: "a graceful sun-themed swordsman whose combos flow without pause",
    cls: "Sword",
    style: "Taekwondo",
    item: "sword",
    element: "FIRE",
    special: "dash_slash",
    tint: "#f2b705",
    budget: 320,
    cap: 115,
    stats: {
      atk: 98,
      def: 66,
      spd: 112,
      agi: 89,
      iq: 60
    },
    cpu: {
      react: 8,
      block: 0.62,
      aggro: 0.8,
      dodge: 0.68,
      think: 5
    },
    passive: {
      id: "endless-dance",
      name: "Endless Dance",
      rule: "When Dawnstroke's combo chain ends and its last move hit (not blocked), the chain restarts at step 0 with no cooldown. At most 2 restarts per chain. If any hit of the dance is blocked, the dance stops and Dawnstroke takes +12 cooldown ticks.",
      telegraph: "Gold footwork trails on the floor, brighter with each loop. The loop restart always begins with the same roundhouse, so the first kick of each loop is the cue.",
      hint: "if its combo lands, it starts again with no rest. Block one hit of the dance and it stalls."
    },
    counterplay: "Block the first kick of any string: a blocked hit ends the dance and opens a 12-tick punish window. Parry the predictable restart roundhouse with Whiteout Parry. After dash_slash it ends behind you; turn and block.",
    teaches: "Block-then-punish: finding the gap in a long combo instead of trading into it.",
    taunt: "The sun never stops between steps. Neither will I.",
    reward: {
      type: "new_special_kind",
      name: "Sunline Pass",
      kind: "dash_slash",
      description: "Dash 220 px straight through the opponent (startup 10, active 8, recovery 22) and hit once as you pass. You end up behind them."
    }
  },
  {
    floor: 7,
    title: "Ferrule",
    epithet: "the Pencil-Case Armory",
    archetype: "a weapon genius who switches weapons mid-fight and masters each one",
    cls: "Mace",
    style: "Karate",
    item: "mace",
    element: "POISON",
    special: "arrow",
    tint: "#3f8f5a",
    budget: 331,
    cap: 115,
    stats: {
      atk: 104,
      def: 92,
      spd: 78,
      agi: 70,
      iq: 96
    },
    cpu: {
      react: 7,
      block: 0.65,
      aggro: 0.72,
      dodge: 0.72,
      think: 5
    },
    passive: {
      id: "pencil-case",
      name: "Pencil Case",
      rule: "Every 480 ticks Ferrule swaps weapon in the cycle mace -> sword -> shield -> mace. The swap takes 50 ticks: it cannot attack or block and takes x1.25 damage. After the swap its class trait matches the weapon (Mace: +6 hit-stun and armor break; Sword: +32 reach; Shield/Tank: 0.7 block). Stats, style and the CLASS_TUNE damage factor stay fixed at Mace's.",
      telegraph: "A pencil case pops open above Ferrule 60 ticks before the swap, and the next weapon's icon spins in it. During the 50-tick swap Ferrule rummages with both hands, which is clearly not a fighting pose.",
      hint: "it swaps weapons every few seconds and can't fight while it rummages: that's your opening."
    },
    counterplay: "Watch the pencil case: dash in during the swap with Sunline Pass or any combo for x1.25 damage. Respect the sword's reach, block the mace (it stuns longer on hit), and do not hit the shield phase more than twice in a row.",
    teaches: "Reading a changing opponent and punishing a scheduled weakness window.",
    taunt: "Pick your favourite weapon. I own that one too.",
    reward: {
      type: "element_variant",
      name: "Compass Needle Volley",
      kind: "arrow",
      element: "POISON",
      description: "A fast needle that poisons: the target deals 15% less while poisoned."
    }
  },
  {
    floor: 8,
    title: "Hardcover Atlas",
    epithet: "the Strongest Page in the Book",
    archetype: "the mightiest pure fighter: no tricks, overwhelming strength and toughness",
    cls: "Fighter",
    style: "Boxing",
    item: "nothing",
    element: "NONE",
    special: "pull",
    tint: "#17171a",
    budget: 304,
    cap: 115,
    stats: {
      atk: 115,
      def: 112,
      spd: 88,
      agi: 76,
      iq: 64
    },
    cpu: {
      react: 6,
      block: 0.7,
      aggro: 0.86,
      dodge: 0.7,
      think: 4
    },
    passive: {
      id: "unbending-spine",
      name: "Unbending Spine",
      rule: "While Atlas is in the startup of a punch or kick (action attack/kick and t < move.from), normal hits do not interrupt him: he takes x0.8 damage and keeps attacking. Specials, projectile specials and any hit with launch interrupt him normally.",
      telegraph: "Every armored startup flashes a thick dark outline on the body (the same outline every time). A hit absorbed by armor sparks grey instead of red.",
      hint: "you can't stop its punches and kicks once they start winding up. Block or sweep, don't trade."
    },
    counterplay: "Do not trade jabs with him. Block his heavy punch, then punish in his recovery (no armor there). Use specials or launchers (sweep, knee, uppercut) to break armor, and poison him to cut his damage. Jump the reel.",
    teaches: "Not trading: block, then punish recovery; know which of your moves beat armor.",
    taunt: "I was not drawn. I was carved into the cover.",
    reward: {
      type: "new_special_kind",
      name: "Iron Reel",
      kind: "pull",
      description: "A slow, short projectile (range 300 px). On hit it does light damage, pulls the target to 80 px in front of you and steals 25 energy. Blockable."
    }
  },
  {
    floor: 9,
    title: "Asymptote",
    epithet: "the Page That Never Ends",
    archetype: "a near-untouchable mage whose barrier stops attacks before they reach him",
    cls: "Attacker",
    style: "Systema",
    item: "book",
    element: "FROST",
    special: "orb",
    tint: "#8fd3e8",
    budget: 328,
    cap: 115,
    stats: {
      atk: 64,
      def: 86,
      spd: 100,
      agi: 105,
      iq: 115
    },
    cpu: {
      react: 5,
      block: 0.74,
      aggro: 0.7,
      dodge: 0.88,
      think: 4
    },
    passive: {
      id: "infinite-margin",
      name: "Infinite Margin",
      rule: "Part 1: projectile hits on Asymptote deal x0.4 (blasts) or x0.6 (projectile specials), unless he is in hit-stun or doing a special. Part 2 (Blink): if the player stays within 110 px of him for 90 ticks in total, he blinks to 600 px away (clamped inside the arena) after an 18-tick shimmer. Cooldown 300 ticks. Hitting him during the shimmer cancels the blink and resets the 90-tick count.",
      telegraph: "A ruled-line grid shimmers around him while projectiles slow near his body (render-only effect). The blink shimmer is an 18-tick ink-blot ripple centred on him: the only tell, short on purpose for floor 9, but always the same.",
      hint: "your projectiles barely hurt it, and if you crowd it, it blinks across the page. Fight it mid-range."
    },
    counterplay: "Zoning loses here, so walk him into a corner instead. Use Iron Reel to drag him in. Keep up close pressure, but hit him as soon as the ripple appears to cancel the blink. Frost slows your walk, so block the orb rather than eat it.",
    teaches: "Committed rushdown and cornering: keep the pressure on an opponent who wants to escape.",
    taunt: "You can get closer. You just cannot arrive.",
    reward: {
      type: "element_variant",
      name: "Stillwater Orb",
      kind: "orb",
      element: "FROST",
      description: "A heavy orb that launches and slows the target's walk."
    }
  },
  {
    floor: 10,
    title: "The Redline Regent",
    epithet: "King of the Red Margin",
    archetype: "a cursed king who marks his victims and, at half health, unseals a second, deadlier form",
    cls: "Fighter",
    style: "Street",
    item: "nothing",
    element: "POISON",
    special: "spiral",
    tint: "#9e1b1b",
    budget: 330,
    cap: 115,
    stats: {
      atk: 110,
      def: 96,
      spd: 98,
      agi: 86,
      iq: 95
    },
    cpu: {
      react: 5,
      block: 0.76,
      aggro: 0.82,
      dodge: 0.82,
      think: 4
    },
    passive: {
      id: "curse-marks",
      name: "Curse Marks",
      rule: "Each unblocked Regent hit adds a red mark on the player (max 5). One mark fades every 120 ticks without a new mark. At 5 marks they detonate: 16 flat damage (after armor, ignores block), POISON for 180 ticks, and the marks reset to 0.",
      telegraph: "Red tally strokes are drawn on the player's body, one per mark, like a counted score. At 4 marks the strokes pulse.",
      hint: "every clean hit marks you; at five marks they explode and poison you. Block to keep the count low."
    },
    counterplay: "Phase 1: block well, the marks only grow on unblocked hits. When you have 4 marks, play pure defense until one fades (120 ticks). Bait the spiral and punish its recovery.",
    teaches: "The final exam: block discipline (floors 2, 4), punishing recovery (1, 3, 6, 8), approaching and cornering (5, 9) and adapting to a form change (7).",
    taunt: "Every page has a margin. You have been living in mine.",
    reward: {
      type: "new_special_kind",
      name: "Red Margin",
      kind: "remote_detonation",
      description: "Mark the opponent's current x. 40 ticks later a vertical cut lands there (40 px wide). Blockable; avoided by moving. Damage is set in the SPECIAL_TUNE pass."
    },
    phase2: {
      trigger: "The first time in each round that the Regent's HP falls to 100 (50%) or below. The triggering hit's damage is clamped so HP becomes exactly 100: a big combo cannot skip phase 2. Each round is a full two-phase fight.",
      transition: {
        freeze: 40,
        event: "{ type: 'phase', slot, n: 2 }",
        banner: "THE MARGIN TEARS",
        effects: [
          "m.defs[boss] = deriveBossDef(phase2 stats/kit) with the same budget/cap",
          "boss statuses cleared, boss energy set to 50",
          "Curse Marks on the player cleared",
          "both fighters pushed apart to 300 px and all projectiles and hazards removed",
          "the page background tints red (render only)"
        ]
      },
      title: "The Redline Regent, Unbound",
      class: "Sword",
      style: "Street",
      item: "sword",
      element: "BLEED",
      special: "remote_detonation",
      stats: {
        atk: 112,
        def: 80,
        spd: 102,
        agi: 80,
        iq: 111
      },
      cpu: {
        react: 4,
        block: 0.8,
        aggro: 0.9,
        dodge: 0.88,
        think: 3,
        special: 0.95
      },
      passive: {
        name: "Red Margin Lines",
        rule: "Every 240 ticks a red ruled line is drawn at the player's current x (40 px wide). After 45 ticks it cuts: 12 damage plus BLEED if the player is still inside it and grounded. A block halves it. Jumping or walking off avoids it. Curse Marks stay active in phase 2.",
        hook: "step (hazard list) + updateFighter (spawn timer)",
        implementation: "m.hazards: { x, w: 40, at, dmg: 12, owner, element: 'BLEED' }[]. onTick(boss): if (m.phaseT % 240 === 0) m.hazards.push({ x: opp.x, w: 40, at: m.phaseT + 45, ... }). step: for each due hazard, if the target overlaps x +- w/2 and is grounded, call applyHit(owner, target, dmg, { knock: 4, special: true, at }); then remove it.",
        telegraph: "A thin red pen line appears on the floor and slowly darkens over 45 ticks. It flashes for the last 8 ticks before the cut."
      },
      ai_personality: "Mixes the lines with pressure: it times its attacks so that blocking keeps you standing on a line. Fires remote_detonation (a delayed cut at your position) when you stand still to block. Telegraph for remote_detonation: a red crosshair drawn on you for 40 ticks.",
      counterplay: "Never block on top of a red line: walk or jump off first, then block. Keep moving when the crosshair appears. Stillwater Orb slows his approach while you reposition. He has less durability in phase 2 (DUR 80), so your punishes hit harder."
    },
    phase2Taunt: "Fine. I will stop writing politely."
  }
];

export const FLOORS = BOSSES.length;

// A boss as a fighter for the sim and the renderer. `budget`/`cap` lift its stats past the player's 350.
export function bossFighter(floor: number): PublicFighter & { budget: number; cap: number } {
  const b = BOSSES[floor - 1];
  return {
    id: `boss-${b.floor}`,
    name: b.title,
    class: b.cls,
    imageUrl: `/boss-art/${b.floor}`,
    specialMove: b.reward.name,
    hp: 200,
    ...b.stats,
    element: b.element,
    item: b.item,
    specialKind: b.special,
    style: b.style,
    budget: b.budget,
    cap: b.cap,
  };
}

// The sim's side of a boss (passive, second form) and the CPU's (knobs per form), built once per floor so a React
// effect that depends on it doesn't restart the match.
export type BossRun = { spec: BossSpec; cpu: Partial<Knobs>; cpu2?: Partial<Knobs> };
const runs = new Map<number, BossRun>();
export function bossRun(floor: number): BossRun {
  let r = runs.get(floor);
  if (!r) {
    const b = BOSSES[floor - 1];
    const p2 = b.phase2;
    const { special: _unusedKnob, ...cpu2 } = p2?.cpu ?? {}; // eslint-disable-line @typescript-eslint/no-unused-vars
    const stats: FighterStats | null = p2
      ? { hp: 200, ...p2.stats, class: p2.class, item: p2.item, style: p2.style, element: p2.element, specialKind: p2.special, budget: b.budget, cap: b.cap }
      : null;
    r = {
      spec: { slot: 1, passive: b.passive.id, ...(p2 && stats && { phase2: { stats, passive: "red-margin-lines" as const, cls: p2.class, item: p2.item } }) },
      cpu: b.cpu,
      ...(p2 && { cpu2 }),
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

// The CPU's knobs for the form the boss is in now.
export const bossKnobs = (run: BossRun, phase: 1 | 2 | undefined): Partial<Knobs> => (phase === 2 && run.cpu2 ? run.cpu2 : run.cpu);

// ---------------------------------------------------------------- what the floors unlock

// The odd floors' rewards: a named, element-tinted version of an existing kind (the element is set with it).
export type Variant = { floor: number; id: string; name: string; kind: SpecialKind; element: string; description: string };
export const VARIANTS: Variant[] = BOSSES.filter((b) => b.reward.type === "element_variant").map((b) => ({
  floor: b.floor,
  id: `v${b.floor}`,
  name: b.reward.name,
  kind: b.reward.kind as SpecialKind,
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
