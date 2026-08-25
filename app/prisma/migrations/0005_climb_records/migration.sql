-- Tower v3 "The Climb" — climb records + runs
--
-- ClimbRecord: one permanent peak-height + win-count row per (user, category)
--   (spec-next.md AC-30/AC-31 — peak height is permanent, never decreases).
-- ClimbRun: append-only log of individual climb attempts (finished or not).

-- CreateTable
CREATE TABLE "climb_records" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "category_slug" TEXT NOT NULL,
    "peak_y" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "wins" INTEGER NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "climb_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "climb_runs" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "category_slug" TEXT NOT NULL,
    "peak_y" DOUBLE PRECISION NOT NULL,
    "finished" BOOLEAN NOT NULL DEFAULT false,
    "finished_tick" INTEGER,
    "seed" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "climb_runs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex — at most one record per (user, category)
CREATE UNIQUE INDEX "climb_record_user_category" ON "climb_records"("userId", "category_slug");

-- CreateIndex — per-category leaderboard by peak height descending
CREATE INDEX "climb_record_leaderboard_idx" ON "climb_records"("category_slug", "peak_y" DESC);

-- CreateIndex — recent runs per category
CREATE INDEX "climb_run_category_idx" ON "climb_runs"("category_slug", "created_at");

-- AddForeignKey — records cascade on user delete; runs are disowned (SET NULL)
ALTER TABLE "climb_records"
    ADD CONSTRAINT "climb_records_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "climb_runs"
    ADD CONSTRAINT "climb_runs_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Guard: peak height is non-negative (mirrors the altitude >= 0 invariant)
ALTER TABLE "climb_records" ADD CONSTRAINT "climb_records_peak_y_nonneg" CHECK ("peak_y" >= 0);
ALTER TABLE "climb_runs" ADD CONSTRAINT "climb_runs_peak_y_nonneg" CHECK ("peak_y" >= 0);
