-- Tower migration 0002 — Check constraints and optimized index
-- Applied after initial migration.

-- Monotonicity constraint: altitude can never go negative (AC-1, NFR-D2)
ALTER TABLE "blocks"
    ADD CONSTRAINT "blocks_altitude_nonneg" CHECK (altitude >= 0);

-- Views counter can never go negative
ALTER TABLE "season_state"
    ADD CONSTRAINT "season_views_k_nonneg" CHECK (views_k >= 0);

-- Partial index for rank query performance (NFR-P1)
-- Ranks only visible blocks, orders by altitude DESC
-- The basic index from migration 0001 is replaced with a proper partial index:
DROP INDEX IF EXISTS "blocks_rank_idx";

CREATE INDEX "blocks_rank_idx"
    ON "blocks" (altitude DESC)
    WHERE hidden_at IS NULL;
