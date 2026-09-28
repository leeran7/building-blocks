-- Level win streaks (design/xp-and-levels.md §6.3): first clears in a row at
-- the player's frontier level. Server-derived from ticket outcomes in
-- src/db/levels.ts. Additive: a constant default, so Postgres adds the column
-- without a table rewrite and every existing player starts at 0.
--
-- Down: ALTER TABLE "users" DROP COLUMN "level_streak";

-- AlterTable
ALTER TABLE "users" ADD COLUMN "level_streak" INTEGER NOT NULL DEFAULT 0;
