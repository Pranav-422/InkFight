-- AlterTable
ALTER TABLE "User" ADD COLUMN     "resetExpires" TIMESTAMP(3),
ADD COLUMN     "resetHash" TEXT,
ADD COLUMN     "resetTries" INTEGER NOT NULL DEFAULT 0;
