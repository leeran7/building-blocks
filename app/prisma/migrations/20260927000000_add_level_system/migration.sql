-- Level System server (design/xp-and-levels.md §5, §7, §9): lives, XP and
-- player level on users; seasons, run tickets, per-level progress, replay
-- claims and XP grants in new tables. Additive only: new tables are empty,
-- and the four users columns have constant defaults, so Postgres adds them
-- without a table rewrite. Every index the code depends on is declared in
-- schema.prisma, so db push keeps them:
--
--   level_progress_user_level_key    one progress row per (user, season, level)
--   level_replay_claims_run_key      the replay claim (REPLAY_REUSED)
--   xp_grants_user_key               each XP key pays once
--   level_run_tickets_user_open_idx  open-ticket lookup per user
--
-- Down: DROP TABLE "xp_grants", "level_replay_claims", "level_progress",
--       "level_run_tickets", "level_seasons";
--       ALTER TABLE "users" DROP COLUMN "xp", DROP COLUMN "player_level",
--       DROP COLUMN "lives", DROP COLUMN "lives_updated_at";

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "lives" INTEGER NOT NULL DEFAULT 5,
ADD COLUMN     "lives_updated_at" TIMESTAMP(3),
ADD COLUMN     "player_level" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "xp" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "level_seasons" (
    "id" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "manifest_hash" TEXT NOT NULL,
    "starts_at" TIMESTAMP(3) NOT NULL,
    "min_level_sim_version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "level_seasons_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "level_run_tickets" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "season" INTEGER NOT NULL,
    "level" INTEGER NOT NULL,
    "sim_version" INTEGER NOT NULL,
    "spec_version" INTEGER NOT NULL,
    "start_power_up" TEXT,
    "life_spent" BOOLEAN NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "used_at" TIMESTAMP(3),
    "outcome" TEXT,

    CONSTRAINT "level_run_tickets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "level_progress" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "season" INTEGER NOT NULL,
    "level" INTEGER NOT NULL,
    "stars" INTEGER NOT NULL,
    "best_ticks" INTEGER NOT NULL,
    "sim_version" INTEGER NOT NULL,
    "spec_version" INTEGER NOT NULL,
    "start_power_up" TEXT,
    "replay_token" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "level_progress_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "level_replay_claims" (
    "id" TEXT NOT NULL,
    "season" INTEGER NOT NULL,
    "level" INTEGER NOT NULL,
    "spec_version" INTEGER NOT NULL,
    "input_hash" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "level_replay_claims_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "xp_grants" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "xp_grants_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "level_run_tickets_user_open_idx" ON "level_run_tickets"("userId", "used_at");

-- CreateIndex
CREATE INDEX "level_progress_board_idx" ON "level_progress"("season", "level", "best_ticks", "updated_at");

-- CreateIndex
CREATE UNIQUE INDEX "level_progress_user_level_key" ON "level_progress"("userId", "season", "level");

-- CreateIndex
CREATE INDEX "level_replay_claims_user_idx" ON "level_replay_claims"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "level_replay_claims_run_key" ON "level_replay_claims"("season", "level", "spec_version", "input_hash");

-- CreateIndex
CREATE UNIQUE INDEX "xp_grants_user_key" ON "xp_grants"("userId", "source", "key");

-- AddForeignKey
ALTER TABLE "level_run_tickets" ADD CONSTRAINT "level_run_tickets_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "level_progress" ADD CONSTRAINT "level_progress_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "level_replay_claims" ADD CONSTRAINT "level_replay_claims_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "xp_grants" ADD CONSTRAINT "xp_grants_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

