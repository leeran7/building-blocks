-- Social handles on listings + public creator username.
-- Additive only; all new columns are nullable so existing rows are unaffected.

-- Buyer-facing platform set for creator listings. Kept separate from the
-- agent's "SocialPlatform" enum so the two evolve independently.
CREATE TYPE "CreatorPlatform" AS ENUM ('TIKTOK', 'X', 'YOUTUBE', 'INSTAGRAM', 'TWITCH');

-- Optional social account a paid listing points at. When platform is set, the
-- block renders as a native creator card and `url` holds the canonical profile URL.
ALTER TABLE "blocks" ADD COLUMN "platform" "CreatorPlatform";
ALTER TABLE "blocks" ADD COLUMN "handle" TEXT;

-- One social entry per (user, season, platform). Postgres treats NULLs as
-- distinct, so this only binds when all three are set (an owned social listing);
-- website blocks (platform NULL) are never constrained. Covers hidden + visible
-- rows so a tuple owns exactly one block — no create-then-reveal race.
CREATE UNIQUE INDEX "blocks_user_season_platform_key"
    ON "blocks"("userId", "season_id", "platform");

-- Public, user-chosen creator handle for /c/[username]. Unique, nullable.
ALTER TABLE "users" ADD COLUMN "username" TEXT;
CREATE UNIQUE INDEX "users_username_key" ON "users"("username");
