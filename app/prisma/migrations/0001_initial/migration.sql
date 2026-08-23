-- Tower initial migration
-- Creates: season_state, blocks, payments

-- Season (must come before blocks for FK)
CREATE TABLE "season_state" (
    "id"        TEXT        NOT NULL,
    "views_k"   DOUBLE PRECISION NOT NULL DEFAULT 0,
    "starts_at" TIMESTAMP(3) NOT NULL,
    "ends_at"   TIMESTAMP(3) NOT NULL,
    "is_active" BOOLEAN     NOT NULL DEFAULT false,

    CONSTRAINT "season_state_pkey" PRIMARY KEY ("id")
);

-- Blocks
-- CRITICAL: No position/rank column (AC-20) — rank = ORDER BY altitude DESC
-- spend_c is display-only — NEVER in ORDER BY (AC-17)
CREATE TABLE "blocks" (
    "id"           TEXT             NOT NULL,
    "slug"         TEXT             NOT NULL,
    "url"          TEXT             NOT NULL,
    "display_name" TEXT             NOT NULL,
    "owner_email"  TEXT             NOT NULL,
    "altitude"     DOUBLE PRECISION NOT NULL DEFAULT 0,
    "spend_c"      INTEGER          NOT NULL DEFAULT 0,
    "views_served" INTEGER          NOT NULL DEFAULT 0,
    "clicks"       INTEGER          NOT NULL DEFAULT 0,
    "peak_rank"    INTEGER,
    "hidden_at"    TIMESTAMP(3),
    "created_at"   TIMESTAMP(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "season_id"    TEXT             NOT NULL,

    CONSTRAINT "blocks_pkey"      PRIMARY KEY ("id"),
    CONSTRAINT "blocks_slug_key"  UNIQUE ("slug"),
    CONSTRAINT "blocks_season_fk" FOREIGN KEY ("season_id") REFERENCES "season_state"("id")
        ON DELETE RESTRICT ON UPDATE CASCADE
);

-- Payments
-- stripe_session_id UNIQUE = idempotency mechanism (NFR-D1, AC-32)
CREATE TABLE "payments" (
    "id"                TEXT             NOT NULL,
    "block_id"          TEXT             NOT NULL,
    "stripe_session_id" TEXT             NOT NULL,
    "amount_cents"      INTEGER          NOT NULL,
    "metres_added"      DOUBLE PRECISION NOT NULL,
    "created_at"        TIMESTAMP(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payments_pkey"              PRIMARY KEY ("id"),
    CONSTRAINT "payments_stripe_unique"     UNIQUE ("stripe_session_id"),
    CONSTRAINT "payments_block_fk"          FOREIGN KEY ("block_id") REFERENCES "blocks"("id")
        ON DELETE RESTRICT ON UPDATE CASCADE
);
