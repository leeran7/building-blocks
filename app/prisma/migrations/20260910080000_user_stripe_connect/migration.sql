-- Add Stripe Connect Express account id to users for tournament prize payouts.
ALTER TABLE "users" ADD COLUMN "stripe_connect_account_id" TEXT;
