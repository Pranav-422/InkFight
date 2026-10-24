-- Admin buff (User.buff) and the owner's "item upside down" fix (Character.flipItem).
ALTER TABLE "User" ADD COLUMN "buff" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Character" ADD COLUMN "flipItem" BOOLEAN NOT NULL DEFAULT false;
