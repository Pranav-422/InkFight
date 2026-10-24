import type { PublicFighter } from "./protocol";

// Built-in fighters for the no-login sample fight (same art and stats as the demo accounts' starters).
export const SAMPLE_FIGHTERS: [PublicFighter, PublicFighter] = [
  {
    id: "sample-warrior",
    name: "Sir Scribbles",
    class: "Sword",
    item: "sword",
    imageUrl: "/samples/warrior.png",
    specialMove: "Ballpoint Rush",
    specialKind: "slash",
    style: "Karate",
    element: "NONE",
    hp: 200,
    atk: 80,
    def: 72,
    spd: 58,
    agi: 70,
    iq: 70,
  },
  {
    id: "sample-mage",
    name: "Margin Mage",
    class: "Attacker",
    item: "book",
    imageUrl: "/samples/mage.png",
    specialMove: "Ink-ame-hameha",
    specialKind: "beam",
    style: "Systema",
    element: "NONE",
    hp: 200,
    atk: 84,
    def: 54,
    spd: 72,
    agi: 70,
    iq: 70,
  },
];
