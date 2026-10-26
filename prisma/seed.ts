// Idempotent: creates the two demo accounts, each with a starter fighter.
// Runs locally via `npm run seed` and on every Vercel build.

import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { DEMO_ACCOUNTS } from "../src/app/(auth)/demo";

const db = new PrismaClient();

const STARTERS = [
  {
    name: "Sir Scribbles",
    imageUrl: "/samples/warrior.png",
    class: "Sword",
    item: "sword",
    element: "NONE",
    hp: 200, atk: 80, def: 72, spd: 58, agi: 70, iq: 70,
    specialMove: "Ballpoint Rush",
    specialDesc: "Charges in with the sword drawn three times over",
    specialKind: "slash",
    ultKind: "teleport",
    ultName: "Eraser Step: Infinite Redraw",
    ultDesc: "Erased, redrawn, erased again, always behind you",
    style: "Karate",
    flavorText: "Drew the sword first, the face second. Priorities.",
    features: { size: "large", pose: "aggressive", dominant_colors: ["red"] },
    items: ["sword"],
  },
  {
    name: "Margin Mage",
    imageUrl: "/samples/mage.png",
    class: "Attacker",
    item: "book",
    element: "NONE",
    hp: 200, atk: 84, def: 54, spd: 72, agi: 70, iq: 70,
    specialMove: "Ink-ame-hameha",
    specialDesc: "Cups the open book, screams, and fires a beam the width of the page",
    specialKind: "beam",
    ultKind: "spiral",
    ultName: "Great Spiral Notebook",
    ultDesc: "Spins until the page runs out",
    style: "Systema",
    flavorText: "Reads the rules. Then ignores them at high speed.",
    features: { size: "medium", pose: "neutral", dominant_colors: ["blue"] },
    items: ["book"],
  },
];

async function main() {
  for (const [i, acc] of DEMO_ACCOUNTS.entries()) {
    const user = await db.user.upsert({
      where: { email: acc.email },
      // Shared accounts: put the published password back and clear any security question someone set on them.
      update: { passwordHash: await bcrypt.hash(acc.password, 10), securityQuestion: null, securityAnswer: null, resetHash: null, resetExpires: null },
      create: { email: acc.email, name: acc.name, passwordHash: await bcrypt.hash(acc.password, 10) },
    });
    const s = STARTERS[i];
    const has = await db.character.findFirst({ where: { ownerId: user.id, imageUrl: s.imageUrl } });
    if (has) {
      await db.character.update({
        where: { id: has.id },
        data: {
          class: s.class,
          item: s.item,
          element: s.element,
          agi: s.agi,
          iq: s.iq,
          specialKind: s.specialKind,
          ultKind: s.ultKind,
          ultName: s.ultName,
          ultDesc: s.ultDesc,
          style: s.style,
          specialMove: s.specialMove,
          specialDesc: s.specialDesc,
          detectedItems: JSON.stringify({
            source: "offline",
            items: s.items,
            features: s.features,
            classReason: `Holding ${s.items.join(", ")} → ${s.class}`,
            ruleStats: { hp: s.hp, atk: s.atk, def: s.def, spd: s.spd, agi: s.agi, iq: s.iq },
            modelStats: null,
            adjustments: [],
            note: "Starter fighter for the demo account.",
          }),
        },
      });
    }
    if (!has) {
      await db.character.create({
        data: {
          name: s.name,
          ownerId: user.id,
          ownerHandle: user.name,
          imageUrl: s.imageUrl,
          class: s.class,
          item: s.item,
          element: s.element,
          hp: s.hp,
          atk: s.atk,
          def: s.def,
          spd: s.spd,
          agi: s.agi,
          iq: s.iq,
          specialMove: s.specialMove,
          specialDesc: s.specialDesc,
          specialKind: s.specialKind,
          ultKind: s.ultKind,
          ultName: s.ultName,
          ultDesc: s.ultDesc,
          style: s.style,
          flavorText: s.flavorText,
          detectedItems: JSON.stringify({
            source: "offline",
            items: s.items,
            features: s.features,
            classReason: `Holding ${s.items.join(", ")} → ${s.class}`,
            ruleStats: { hp: s.hp, atk: s.atk, def: s.def, spd: s.spd, agi: s.agi, iq: s.iq },
            modelStats: null,
            adjustments: [],
            note: "Starter fighter for the demo account.",
          }),
        },
      });
    }
    console.log(`seeded ${acc.email}`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
