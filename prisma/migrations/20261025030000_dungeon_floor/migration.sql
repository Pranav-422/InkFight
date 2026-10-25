-- The Dungeon (Sprint 5): highest floor each player has cleared.
ALTER TABLE "User" ADD COLUMN "dungeonFloor" INTEGER NOT NULL DEFAULT 0;
