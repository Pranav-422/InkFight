-- InkFight 2.0: five stats (AGI and IQ join ATK/DEF/SPD), elements, the held item, and the
-- five classes. Old rows: atk+def+spd = 210, plus 70 + 70 = 350, the new budget.
ALTER TABLE "Character" ADD COLUMN "agi" INTEGER NOT NULL DEFAULT 70;
ALTER TABLE "Character" ADD COLUMN "iq" INTEGER NOT NULL DEFAULT 70;
ALTER TABLE "Character" ADD COLUMN "element" TEXT NOT NULL DEFAULT 'NONE';
ALTER TABLE "Character" ADD COLUMN "item" TEXT;

UPDATE "Character" SET "item" = CASE "class"
  WHEN 'Mage' THEN 'book' WHEN 'Caster' THEN 'staff' WHEN 'Ranger' THEN 'bow'
  WHEN 'Warrior' THEN 'sword' WHEN 'Tank' THEN 'shield' ELSE 'nothing' END;

UPDATE "Character" SET "class" = CASE "class"
  WHEN 'Warrior' THEN 'Sword' WHEN 'Brawler' THEN 'Fighter' WHEN 'Tank' THEN 'Tank'
  WHEN 'Mace' THEN 'Mace' ELSE 'Attacker' END;
