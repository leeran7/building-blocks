-- Daily Climb replay claims (SEC-DC-2): one row per distinct verified daily
-- run, keyed by (UTC day, canonical input-log hash), holding the first
-- account that submitted it. POST /api/climb/daily/result claims the hash
-- with INSERT ... ON CONFLICT (day, input_hash) and refuses a run already
-- claimed by another account (409 REPLAY_REUSED). New, empty table, so no
-- lock on existing data and no backfill. Both indexes are declared in
-- schema.prisma so db push keeps them.
--
-- daily_climb_replays_day_hash_key is the uniqueness the claim depends on.
-- daily_climb_replays_user_idx serves the ON DELETE CASCADE from users.
--
-- Down: DROP TABLE "daily_climb_replays";

-- CreateTable
CREATE TABLE "daily_climb_replays" (
    "id" TEXT NOT NULL,
    "day" TEXT NOT NULL,
    "input_hash" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "daily_climb_replays_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "daily_climb_replays_user_idx" ON "daily_climb_replays"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "daily_climb_replays_day_hash_key" ON "daily_climb_replays"("day", "input_hash");

-- AddForeignKey
ALTER TABLE "daily_climb_replays" ADD CONSTRAINT "daily_climb_replays_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

