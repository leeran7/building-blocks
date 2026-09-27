-- Levels drop replay verification (Leeran, 2026-09-27): the device reports
-- each level result. Removes what only the replay check used:
--   level_replay_claims            copied-replay claims (REPLAY_REUSED)
--   level_seasons.manifest_hash    pinned the server's manifest copy
--   level_run_tickets.spec_version / level_progress.spec_version
-- All were added in 20260927000000_add_level_system on feat/level-system and
-- hold no production data.
--
-- Down: re-create them as in 20260927000000_add_level_system.

-- DropForeignKey
ALTER TABLE "level_replay_claims" DROP CONSTRAINT "level_replay_claims_userId_fkey";

-- AlterTable
ALTER TABLE "level_seasons" DROP COLUMN "manifest_hash";

-- AlterTable
ALTER TABLE "level_run_tickets" DROP COLUMN "spec_version";

-- AlterTable
ALTER TABLE "level_progress" DROP COLUMN "spec_version";

-- DropTable
DROP TABLE "level_replay_claims";

