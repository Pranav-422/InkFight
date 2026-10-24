-- Old Mage/Caster/Ranger rows became Attackers in stats_v2 with their old ATK as STR and the default
-- IQ 70, so their blasts and ranged specials (which use IQ) were weak. Swap the two: the budget stays 350.
-- Rows still on both defaults (IQ 70, AGI 70) are exactly the migrated ones.
UPDATE "Character" SET "atk" = "iq", "iq" = "atk"
WHERE "class" = 'Attacker' AND "iq" = 70 AND "agi" = 70 AND "atk" > "iq";
