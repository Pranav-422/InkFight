-- Second special slot (the ultimate, S + L). ultKind NULL = the class default (src/game/moves.ts CLASS_ULT);
-- existing specialKind/specialMove stay slot 1.
ALTER TABLE "Character" ADD COLUMN "ultKind" TEXT;
ALTER TABLE "Character" ADD COLUMN "ultName" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Character" ADD COLUMN "ultDesc" TEXT NOT NULL DEFAULT '';
