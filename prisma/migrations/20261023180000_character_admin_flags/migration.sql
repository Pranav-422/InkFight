-- Admin controls: whether the computer may play this design, and whether it is hidden from public pages.
ALTER TABLE "Character" ADD COLUMN "cpu" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Character" ADD COLUMN "hidden" BOOLEAN NOT NULL DEFAULT false;
