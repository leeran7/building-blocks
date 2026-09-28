-- The once-a-day bonus life for finishing a Daily Climb or a duel
-- (design/xp-and-levels.md §5b): the UTC day it was last paid, so each
-- player gets at most one per day. Written under the user's row lock in
-- src/db/levelExtras.ts. Additive and nullable: no table rewrite.
--
-- Down: ALTER TABLE "users" DROP COLUMN "bonus_life_day";

-- AlterTable
ALTER TABLE "users" ADD COLUMN "bonus_life_day" TEXT;
