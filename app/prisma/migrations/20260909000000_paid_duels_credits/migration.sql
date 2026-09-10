-- Paid 1v1 Battles: prepaid credits wallet + duel staking/escrow.
-- All additions are nullable or defaulted, so this is safe on existing rows.

-- CreateEnum
CREATE TYPE "WalletBucket" AS ENUM ('PLAY', 'WINNINGS');

-- CreateEnum
CREATE TYPE "WalletLedgerKind" AS ENUM ('PURCHASE', 'STAKE', 'WIN', 'REFUND', 'CASHOUT_REQUEST', 'CASHOUT_REVERSAL', 'ADJUSTMENT');

-- AlterTable: two-bucket credit wallet + 18+ attestation on users
ALTER TABLE "users" ADD COLUMN "play_credits_cents" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "winnings_credits_cents" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "age_confirmed_at" TIMESTAMP(3);

-- AlterTable: duel escrow columns (stake_cents IS NULL == free duel)
ALTER TABLE "duels" ADD COLUMN "stake_cents" INTEGER,
ADD COLUMN "player1_staked" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "player2_staked" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "player1_stake_play_cents" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "player1_stake_winnings_cents" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "player2_stake_play_cents" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "player2_stake_winnings_cents" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "payout_settled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "payout_cents" INTEGER,
ADD COLUMN "refunded" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "credit_purchases" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "stripe_session_id" TEXT NOT NULL,
    "amount_cents" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "credit_purchases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wallet_ledger" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "bucket" "WalletBucket" NOT NULL,
    "amount_cents" INTEGER NOT NULL,
    "balance_after" INTEGER NOT NULL,
    "kind" "WalletLedgerKind" NOT NULL,
    "duel_id" TEXT,
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "wallet_ledger_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "credit_purchases_stripe_session_id_key" ON "credit_purchases"("stripe_session_id");

-- CreateIndex
CREATE INDEX "credit_purchases_user_id_idx" ON "credit_purchases"("user_id");

-- CreateIndex
CREATE INDEX "wallet_ledger_user_idx" ON "wallet_ledger"("user_id", "created_at" DESC);

-- AddForeignKey
ALTER TABLE "credit_purchases" ADD CONSTRAINT "credit_purchases_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wallet_ledger" ADD CONSTRAINT "wallet_ledger_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wallet_ledger" ADD CONSTRAINT "wallet_ledger_duel_id_fkey" FOREIGN KEY ("duel_id") REFERENCES "duels"("id") ON DELETE SET NULL ON UPDATE CASCADE;
