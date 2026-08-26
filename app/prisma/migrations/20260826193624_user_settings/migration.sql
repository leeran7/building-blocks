-- User settings: profile display name + saved URLs.
-- (Additive only — the drift-correction statements Prisma auto-generated for
-- pre-existing raw-SQL indexes were stripped; they conflict with the live DB.)

ALTER TABLE "users" ADD COLUMN "display_name" TEXT;

CREATE TABLE "saved_urls" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "saved_urls_pkey" PRIMARY KEY ("id")
);

-- One saved URL row per (user, url); fast lookup by user.
CREATE INDEX "saved_urls_userId_idx" ON "saved_urls"("userId");
CREATE UNIQUE INDEX "saved_urls_userId_url_key" ON "saved_urls"("userId", "url");

ALTER TABLE "saved_urls"
    ADD CONSTRAINT "saved_urls_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
