-- Drop the old two-bucket wager wallet's dead columns, superseded by the
-- single non-cashable play_credits_cents bucket (tournaments + ranked-chips
-- pivot). Zero-sum chip settlement never wrote to any of these — verified by
-- code search before this migration was written.
ALTER TABLE "users" DROP COLUMN "winnings_credits_cents";
ALTER TABLE "duels" DROP COLUMN "player1_stake_winnings_cents";
ALTER TABLE "duels" DROP COLUMN "player2_stake_winnings_cents";

-- Drop dead cash-out ledger kinds — chips have no cash-out path, so no code
-- ever wrote these. Postgres can't DROP VALUE directly; rebuild the enum.
BEGIN;
CREATE TYPE "WalletLedgerKind_new" AS ENUM ('PURCHASE', 'DAILY_GRANT', 'STAKE', 'WIN', 'REFUND', 'ADJUSTMENT');
ALTER TABLE "wallet_ledger" ALTER COLUMN "kind" TYPE "WalletLedgerKind_new" USING ("kind"::text::"WalletLedgerKind_new");
ALTER TYPE "WalletLedgerKind" RENAME TO "WalletLedgerKind_old";
ALTER TYPE "WalletLedgerKind_new" RENAME TO "WalletLedgerKind";
DROP TYPE "WalletLedgerKind_old";
COMMIT;

-- Collapse WalletBucket to its one live value — every ledger write has always
-- used PLAY; WINNINGS was only ever written by the removed cash-out flow.
BEGIN;
CREATE TYPE "WalletBucket_new" AS ENUM ('PLAY');
ALTER TABLE "wallet_ledger" ALTER COLUMN "bucket" TYPE "WalletBucket_new" USING ("bucket"::text::"WalletBucket_new");
ALTER TYPE "WalletBucket" RENAME TO "WalletBucket_old";
ALTER TYPE "WalletBucket_new" RENAME TO "WalletBucket";
DROP TYPE "WalletBucket_old";
COMMIT;
