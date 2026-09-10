-- Daily free chip grant: the ongoing no-purchase play path required so the
-- one-time signup grant isn't the only free alternative to buying chips.
ALTER TABLE "users" ADD COLUMN "last_daily_chips_claim_at" TIMESTAMP(3);

-- New ledger kind for the daily grant, so it's auditable like every other
-- wallet mutation.
ALTER TYPE "WalletLedgerKind" ADD VALUE 'DAILY_GRANT';
