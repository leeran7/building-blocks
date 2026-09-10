-- Ranked chip duels: zero-sum, non-cashable matches using play_credits_cents.
ALTER TABLE "duels" ADD COLUMN "is_chip_duel" BOOLEAN NOT NULL DEFAULT false;
