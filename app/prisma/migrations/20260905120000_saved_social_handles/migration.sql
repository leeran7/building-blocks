-- Per-user saved social handles (one per platform): prefill at submit + chips on
-- the creator page. Additive; mirrors saved_urls. Uses the existing
-- "CreatorPlatform" enum.

CREATE TABLE "saved_social_handles" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "platform" "CreatorPlatform" NOT NULL,
    "handle" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "saved_social_handles_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "saved_social_handles_userId_idx" ON "saved_social_handles"("userId");
CREATE UNIQUE INDEX "saved_social_handles_userId_platform_key"
    ON "saved_social_handles"("userId", "platform");

ALTER TABLE "saved_social_handles"
    ADD CONSTRAINT "saved_social_handles_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
