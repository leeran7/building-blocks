-- Tournament scaffolding: bracket of 1v1 duels with paid entry and
-- company-guaranteed prizes. Ships dark behind TOURNAMENTS_ENABLED.

-- CreateEnum
CREATE TYPE "TournamentStatus" AS ENUM ('REGISTRATION', 'SEEDED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');

-- CreateTable
CREATE TABLE "tournaments" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category_slug" TEXT NOT NULL,
    "entry_fee_cents" INTEGER NOT NULL,
    "prize_structure" JSONB NOT NULL,
    "bracket_size" INTEGER NOT NULL,
    "status" "TournamentStatus" NOT NULL DEFAULT 'REGISTRATION',
    "current_round" INTEGER NOT NULL DEFAULT 0,
    "registration_opens_at" TIMESTAMP(3) NOT NULL,
    "registration_closes_at" TIMESTAMP(3) NOT NULL,
    "started_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "created_by_uid" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tournaments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tournament_entries" (
    "id" TEXT NOT NULL,
    "tournament_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "seed_position" INTEGER,
    "placement" INTEGER,
    "prize_cents" INTEGER,
    "eliminated_in_round" INTEGER,
    "stripe_connect_account_id" TEXT,
    "stripe_transfer_id" TEXT,
    "payout_status" TEXT,
    "registered_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tournament_entries_pkey" PRIMARY KEY ("id")
);

-- Add tournament columns to duels
ALTER TABLE "duels" ADD COLUMN "tournament_id" TEXT;
ALTER TABLE "duels" ADD COLUMN "tournament_round" INTEGER;
ALTER TABLE "duels" ADD COLUMN "bracket_position" INTEGER;
ALTER TABLE "duels" ADD COLUMN "is_bye" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "tournament_status_reg_close_idx" ON "tournaments"("status", "registration_closes_at");
CREATE INDEX "tournament_category_status_idx" ON "tournaments"("category_slug", "status");

-- CreateIndex
CREATE UNIQUE INDEX "tournament_entry_user" ON "tournament_entries"("tournament_id", "user_id");
CREATE INDEX "tournament_entry_tournament_idx" ON "tournament_entries"("tournament_id");
CREATE INDEX "tournament_entry_user_idx" ON "tournament_entries"("user_id");

-- CreateIndex
CREATE INDEX "duel_tournament_round_idx" ON "duels"("tournament_id", "tournament_round");

-- AddForeignKey
ALTER TABLE "tournament_entries" ADD CONSTRAINT "tournament_entries_tournament_id_fkey" FOREIGN KEY ("tournament_id") REFERENCES "tournaments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "tournament_entries" ADD CONSTRAINT "tournament_entries_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "duels" ADD CONSTRAINT "duels_tournament_id_fkey" FOREIGN KEY ("tournament_id") REFERENCES "tournaments"("id") ON DELETE SET NULL ON UPDATE CASCADE;
