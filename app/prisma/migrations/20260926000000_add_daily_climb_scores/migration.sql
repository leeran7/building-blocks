-- Daily Climb leaderboard: one row per (user, UTC day) with that day's best
-- SERVER-VERIFIED run (POST /api/climb/daily/result re-simulates the replay
-- and stores the re-simulated peak). New, empty table, so no lock on existing
-- data and no backfill. Both indexes are declared in schema.prisma so db push
-- keeps them.
--
-- daily_climb_board_idx serves the board read (WHERE day = ? ORDER BY
-- peak_y DESC, updated_at ASC LIMIT 50) and the rank count.
--
-- Down: DROP TABLE "daily_climb_scores";

-- CreateTable
CREATE TABLE "daily_climb_scores" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "day" TEXT NOT NULL,
    "peak_y" DOUBLE PRECISION NOT NULL,
    "ticks" INTEGER NOT NULL,
    "replay_token" TEXT,
    "sim_version" INTEGER NOT NULL DEFAULT 1,
    "attempts" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "daily_climb_scores_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "daily_climb_board_idx" ON "daily_climb_scores"("day", "peak_y" DESC, "updated_at");

-- CreateIndex
CREATE UNIQUE INDEX "daily_climb_scores_userId_day_key" ON "daily_climb_scores"("userId", "day");

-- AddForeignKey
ALTER TABLE "daily_climb_scores" ADD CONSTRAINT "daily_climb_scores_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

