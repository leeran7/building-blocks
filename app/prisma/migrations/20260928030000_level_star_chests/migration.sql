-- Level star chests and boosters (design/xp-and-levels.md §6.4). Every 20
-- lifetime stars opens a chest of 1-2 boosters, rolled from
-- HMAC(STAR_CHEST_SECRET, "<userId>:<chestNumber>"); a ticket may equip one
-- owned booster, spent in the ticket's locked transaction and refunded only
-- on a bad start. Additive only: two new empty tables and one nullable
-- column. Every index the code depends on is declared in schema.prisma:
--
--   star_chests_user_number_key   each chest is opened (and paid) once
--   user_boosters_user_type_key   one inventory row per (user, type)
--
-- Down: DROP TABLE "star_chests", "user_boosters";
--       ALTER TABLE "level_run_tickets" DROP COLUMN "booster";

-- AlterTable
ALTER TABLE "level_run_tickets" ADD COLUMN "booster" TEXT;

-- CreateTable
CREATE TABLE "user_boosters" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_boosters_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "star_chests" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "chest_number" INTEGER NOT NULL,
    "boosters" TEXT[],
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "star_chests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "user_boosters_user_type_key" ON "user_boosters"("userId", "type");

-- CreateIndex
CREATE UNIQUE INDEX "star_chests_user_number_key" ON "star_chests"("userId", "chest_number");

-- AddForeignKey
ALTER TABLE "user_boosters" ADD CONSTRAINT "user_boosters_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "star_chests" ADD CONSTRAINT "star_chests_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
