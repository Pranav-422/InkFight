-- Fairness model: everyone has 200 HP, and atk + def (durability) + spd share a
-- budget of 210 (src/lib/stats.ts clampStats). Rescale existing fighters into it;
-- the game re-normalizes exactly at fight time, so a point of rounding here is fine.
UPDATE "Character" SET
  "hp" = 200,
  "atk" = LEAST(100, GREATEST(40, ROUND("atk" * 210.0 / ("atk" + "def" + "spd")))),
  "def" = LEAST(100, GREATEST(40, ROUND("def" * 210.0 / ("atk" + "def" + "spd")))),
  "spd" = LEAST(100, GREATEST(40, ROUND("spd" * 210.0 / ("atk" + "def" + "spd"))));
