-- Level stuck help (design/xp-and-levels.md §5c): fails at the player's
-- frontier level, one level at a time (season + level + count), reset by
-- clearing it. After 3 the next tickets start with a free booster; after 5
-- the route ghost is offered. Server-derived from ticket outcomes in
-- src/db/levels.ts. Additive: two nullable columns and one with a constant
-- default, so Postgres adds them without a table rewrite.
--
-- Down: ALTER TABLE "users" DROP COLUMN "level_fail_season",
--       DROP COLUMN "level_fail_level", DROP COLUMN "level_fail_count";

-- AlterTable
ALTER TABLE "users" ADD COLUMN "level_fail_season" INTEGER,
ADD COLUMN "level_fail_level" INTEGER,
ADD COLUMN "level_fail_count" INTEGER NOT NULL DEFAULT 0;
