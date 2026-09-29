-- Shop: gems, gem packs and paid characters / skins (src/db/gems.ts).
-- Additive only: one column with a default and three new empty tables. Every
-- index the code depends on is declared in schema.prisma:
--
--   gem_ledger_idempotency_key_key       a spend or credit applies once
--   gem_purchases_provider_external_key  a payment credits gems once
--   owned_characters_user_avatar_key     a character or skin is bought once
--
-- Down: DROP TABLE "gem_ledger", "gem_purchases", "owned_characters";
--       ALTER TABLE "users" DROP COLUMN "gems"; DROP TYPE "GemLedgerKind";

-- CreateEnum
CREATE TYPE "GemLedgerKind" AS ENUM ('PURCHASE', 'SPEND', 'REFUND', 'ADJUSTMENT');

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "gems" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "gem_ledger" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "balance_after" INTEGER NOT NULL,
    "kind" "GemLedgerKind" NOT NULL,
    "reason" TEXT NOT NULL,
    "ref" TEXT,
    "idempotency_key" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "gem_ledger_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gem_purchases" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "external_id" TEXT NOT NULL,
    "pack_id" TEXT NOT NULL,
    "gems" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "gem_purchases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "owned_characters" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "avatar_id" TEXT NOT NULL,
    "gems_paid" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "owned_characters_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "gem_ledger_idempotency_key_key" ON "gem_ledger"("idempotency_key");

-- CreateIndex
CREATE INDEX "gem_ledger_user_idx" ON "gem_ledger"("user_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "gem_purchases_user_id_idx" ON "gem_purchases"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "gem_purchases_provider_external_key" ON "gem_purchases"("provider", "external_id");

-- CreateIndex
CREATE UNIQUE INDEX "owned_characters_user_avatar_key" ON "owned_characters"("user_id", "avatar_id");

-- AddForeignKey
ALTER TABLE "gem_ledger" ADD CONSTRAINT "gem_ledger_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gem_purchases" ADD CONSTRAINT "gem_purchases_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "owned_characters" ADD CONSTRAINT "owned_characters_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- A balance never goes negative, whatever write path a later change adds
-- (spendGems also only decrements where gems >= amount).
ALTER TABLE "users" ADD CONSTRAINT "users_gems_nonnegative" CHECK ("gems" >= 0);
