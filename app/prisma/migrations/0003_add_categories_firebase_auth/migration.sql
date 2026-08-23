-- Tower migration 0003 — Category enum, User table, Block FK + index
--
-- Safety notes:
--   * Category column is nullable (no NOT NULL) so existing rows are unaffected.
--   * userId column is nullable for the same reason.
--   * CREATE INDEX CONCURRENTLY is used for the new composite index so the
--     migration does not lock the blocks table on a live database.
--     NOTE: CONCURRENTLY cannot run inside a transaction block; if your
--     migration runner wraps everything in BEGIN/COMMIT, remove CONCURRENTLY
--     and schedule the index creation in a separate maintenance window.

-- 1. Category enum type
CREATE TYPE "Category" AS ENUM (
    'Tech',
    'Design',
    'Business',
    'Creative',
    'Gaming',
    'Science'
);

-- 2. Users table (Firebase UID as primary key)
CREATE TABLE "users" (
    "id"            TEXT    NOT NULL,
    "email"         TEXT    NOT NULL,
    "emailVerified" BOOLEAN NOT NULL DEFAULT false,
    "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey"       PRIMARY KEY ("id"),
    CONSTRAINT "users_email_key"  UNIQUE ("email")
);

-- 3. Add category column to blocks — nullable, default Tech
ALTER TABLE "blocks"
    ADD COLUMN "category" "Category" DEFAULT 'Tech';

-- 4. Add userId FK column to blocks — nullable
ALTER TABLE "blocks"
    ADD COLUMN "userId" TEXT;

-- 5. FK constraint: blocks.userId → users.id
--    RESTRICT on delete: prevents orphaning blocks when a user is removed.
ALTER TABLE "blocks"
    ADD CONSTRAINT "blocks_user_fk"
        FOREIGN KEY ("userId") REFERENCES "users"("id")
        ON DELETE SET NULL ON UPDATE CASCADE;

-- 6. Index: FK column (DB does not add FK indexes automatically)
CREATE INDEX "blocks_user_id_idx"
    ON "blocks" ("userId");

-- 7. Composite index for category + altitude leaderboard queries
--    CONCURRENTLY: no table lock on live databases (see note above).
CREATE INDEX "blocks_category_altitude_idx"
    ON "blocks" ("category", altitude DESC);
