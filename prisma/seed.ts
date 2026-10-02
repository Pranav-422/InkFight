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
    class: "Warrior",
    hp: 120, atk: 76, def: 63, spd: 52,
    specialMove: "Ballpoint Rush",
    specialDesc: "Charges in with the sword drawn three times over",
    flavorText: "Drew the sword first, the face second. Priorities.",
    features: { size: "large", pose: "aggressive", dominant_colors: ["red"] },
    items: ["sword"],
  },
  {
    name: "Margin Mage",
    imageUrl: "/samples/mage.png",
    class: "Mage",
    hp: 82, atk: 74, def: 52, spd: 68,
    specialMove: "Footnote Bolt",
    specialDesc: "Fires a spell straight out of the open book",
    flavorText: "Reads the rules. Then ignores them at high speed.",
    features: { size: "medium", pose: "neutral", dominant_colors: ["blue"] },
    items: ["book"],
  },
];

async function main() {
  for (const [i, acc] of DEMO_ACCOUNTS.entries()) {
    const user = await db.user.upsert({
      where: { email: acc.email },
      update: {},
      create: { email: acc.email, name: acc.name, passwordHash: await bcrypt.hash(acc.password, 10) },
    });
    const s = STARTERS[i];
    const has = await db.character.findFirst({ where: { ownerId: user.id, imageUrl: s.imageUrl } });
    if (!has) {
      await db.character.create({
        data: {
          name: s.name,
          ownerId: user.id,
          ownerHandle: user.name,
          imageUrl: s.imageUrl,
          class: s.class,
          hp: s.hp,
          atk: s.atk,
          def: s.def,
          spd: s.spd,
          specialMove: s.specialMove,
          specialDesc: s.specialDesc,
          flavorText: s.flavorText,
          detectedItems: JSON.stringify({
            source: "offline",
            items: s.items,
            features: s.features,
            classReason: `Holding ${s.items.join(", ")} → ${s.class}`,
            ruleStats: { hp: s.hp, atk: s.atk, def: s.def, spd: s.spd },
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
