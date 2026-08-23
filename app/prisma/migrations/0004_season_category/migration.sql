-- Tower migration 0004 — Per-category seasons + Block FK onDelete fix
--
-- Safety notes:
--   * category column is nullable with default 'Tech' — existing row is unaffected.
--   * Partial unique index allows many inactive seasons per category but
--     enforces at most one active season per category.
--   * onDelete change on blocks_user_fk: Restrict → SET NULL (ADR-3).
--     No data is changed, only the constraint behavior.

-- 1. Add category column to season_state (nullable, defaults to Tech)
ALTER TABLE "season_state"
    ADD COLUMN "category" "Category" NOT NULL DEFAULT 'Tech';

-- 2. Partial unique index: at most one active season per category
CREATE UNIQUE INDEX "season_one_active_per_category"
    ON "season_state" ("category")
    WHERE (is_active = true);

-- 3. Seed active seasons for the 5 non-Tech categories
--    Uses gen_random_uuid() for IDs — compatible with cuid shape (both are strings)
INSERT INTO "season_state" ("id", "category", "views_k", "starts_at", "ends_at", "is_active")
VALUES
    (gen_random_uuid()::text, 'Design',   0, NOW(), NOW() + INTERVAL '90 days', true),
    (gen_random_uuid()::text, 'Business', 0, NOW(), NOW() + INTERVAL '90 days', true),
    (gen_random_uuid()::text, 'Creative', 0, NOW(), NOW() + INTERVAL '90 days', true),
    (gen_random_uuid()::text, 'Gaming',   0, NOW(), NOW() + INTERVAL '90 days', true),
    (gen_random_uuid()::text, 'Science',  0, NOW(), NOW() + INTERVAL '90 days', true);

-- 4. Drop existing FK constraint (which had implicit RESTRICT) and re-add with SET NULL
ALTER TABLE "blocks"
    DROP CONSTRAINT IF EXISTS "blocks_user_fk";

ALTER TABLE "blocks"
    ADD CONSTRAINT "blocks_user_fk"
        FOREIGN KEY ("userId") REFERENCES "users"("id")
        ON DELETE SET NULL ON UPDATE CASCADE;
