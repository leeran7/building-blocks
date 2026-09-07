-- CreateEnum
CREATE TYPE "DuelStatus" AS ENUM ('pending', 'active', 'completed', 'voided');

-- DropIndex (only if it exists — older envs may not have it)
DROP INDEX IF EXISTS "blocks_user_id_idx";

-- CreateTable
CREATE TABLE "duels" (
    "id" TEXT NOT NULL,
    "seed" TEXT NOT NULL,
    "category_slug" TEXT NOT NULL,
    "status" "DuelStatus" NOT NULL DEFAULT 'pending',
    "player1_id" TEXT NOT NULL,
    "player2_id" TEXT,
    "winner_id" TEXT,
    "player1_peak" DOUBLE PRECISION,
    "player2_peak" DOUBLE PRECISION,
    "player1_replay" TEXT,
    "player2_replay" TEXT,
    "player1_submitted" BOOLEAN NOT NULL DEFAULT false,
    "player2_submitted" BOOLEAN NOT NULL DEFAULT false,
    "forfeit" BOOLEAN NOT NULL DEFAULT false,
    "tiebreak_rule" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "started_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),

    CONSTRAINT "duels_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "duel_stats" (
    "user_id" TEXT NOT NULL,
    "wins" INTEGER NOT NULL DEFAULT 0,
    "losses" INTEGER NOT NULL DEFAULT 0,
    "current_streak" INTEGER NOT NULL DEFAULT 0,
    "best_streak" INTEGER NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "duel_stats_pkey" PRIMARY KEY ("user_id")
);

-- CreateIndex
CREATE INDEX "duel_status_created_idx" ON "duels"("status", "created_at");

-- CreateIndex
CREATE INDEX "duel_player1_status_idx" ON "duels"("player1_id", "status");

-- CreateIndex
CREATE INDEX "duel_player2_status_idx" ON "duels"("player2_id", "status");

-- CreateIndex
CREATE INDEX "duel_stats_wins_desc_idx" ON "duel_stats"("wins" DESC);

-- CreateIndex (idempotent — already exists in the older migration path)
CREATE INDEX IF NOT EXISTS "blocks_rank_idx" ON "blocks"("altitude" DESC);

-- RenameForeignKey (idempotent guard: rename only if the old name exists)
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'blocks_season_fk'
  ) THEN
    ALTER TABLE "blocks" RENAME CONSTRAINT "blocks_season_fk" TO "blocks_season_id_fkey";
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'blocks_user_fk'
  ) THEN
    ALTER TABLE "blocks" RENAME CONSTRAINT "blocks_user_fk" TO "blocks_userId_fkey";
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'payments_block_fk'
  ) THEN
    ALTER TABLE "payments" RENAME CONSTRAINT "payments_block_fk" TO "payments_block_id_fkey";
  END IF;
END $$;

-- AddForeignKey
ALTER TABLE "duels" ADD CONSTRAINT "duels_player1_id_fkey" FOREIGN KEY ("player1_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "duels" ADD CONSTRAINT "duels_player2_id_fkey" FOREIGN KEY ("player2_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "duels" ADD CONSTRAINT "duels_winner_id_fkey" FOREIGN KEY ("winner_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "duel_stats" ADD CONSTRAINT "duel_stats_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- RenameIndex (idempotent guard)
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_indexes WHERE indexname = 'blocks_user_season_platform_key'
  ) THEN
    ALTER INDEX "blocks_user_season_platform_key" RENAME TO "blocks_userId_season_id_platform_key";
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_indexes WHERE indexname = 'climb_record_user_category'
  ) THEN
    ALTER INDEX "climb_record_user_category" RENAME TO "climb_records_userId_category_slug_key";
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_indexes WHERE indexname = 'payments_stripe_unique'
  ) THEN
    ALTER INDEX "payments_stripe_unique" RENAME TO "payments_stripe_session_id_key";
  END IF;
END $$;
