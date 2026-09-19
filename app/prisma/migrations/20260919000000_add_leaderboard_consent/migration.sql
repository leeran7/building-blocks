-- Leaderboard consent: nullable timestamp; null = not yet asked/declined.
-- Guideline 5.1.2: scores are only persisted when this is non-null.
ALTER TABLE "users" ADD COLUMN "leaderboard_consent_at" TIMESTAMP(3);
