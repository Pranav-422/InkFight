-- Which special-move building block and fighting style a fighter uses (null = class default).
ALTER TABLE "Character" ADD COLUMN "specialKind" TEXT;
ALTER TABLE "Character" ADD COLUMN "style" TEXT;
