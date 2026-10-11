import type { PublicFighter } from "./protocol";

// Built-in fighters for the no-login sample fight (same art and stats as the demo accounts' starters).
export const SAMPLE_FIGHTERS: [PublicFighter, PublicFighter] = [
  {
    id: "sample-warrior",
    name: "Sir Scribbles",
    class: "Warrior",
    imageUrl: "/samples/warrior.png",
    specialMove: "Ballpoint Rush",
    hp: 120, atk: 76, def: 63, spd: 52,
  },
  {
    id: "sample-mage",
    name: "Margin Mage",
    class: "Mage",
    imageUrl: "/samples/mage.png",
    specialMove: "Footnote Bolt",
    hp: 82, atk: 74, def: 52, spd: 68,
  },
];
