-- Lives earned from rewarded ads (src/levels/rules.ts adLife): the UTC day
-- of the last one and how many were earned that day, capped at
-- AD_LIVES_PER_DAY. Written under the user's row lock in src/db/levels.ts.
-- Additive: a nullable column and a defaulted one, no table rewrite.
--
-- Down: ALTER TABLE "users" DROP COLUMN "ad_life_day", DROP COLUMN "ad_lives_today";

-- AlterTable
ALTER TABLE "users" ADD COLUMN "ad_life_day" TEXT,
ADD COLUMN "ad_lives_today" INTEGER NOT NULL DEFAULT 0;
