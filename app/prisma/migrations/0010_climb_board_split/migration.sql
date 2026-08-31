-- Split the free-climb leaderboard by play surface.
-- Mobile (touch, full-bleed canvas) and desktop (keyboard, 9:16) are not
-- comparable, so they no longer share a ranking. Mobile is the default board:
-- existing rows and omitted writes land there.

ALTER TABLE "climb_records" ADD COLUMN "board" TEXT NOT NULL DEFAULT 'mobile';
ALTER TABLE "climb_runs" ADD COLUMN "board" TEXT NOT NULL DEFAULT 'mobile';

ALTER TABLE "climb_records" ADD CONSTRAINT "climb_records_board_valid" CHECK ("board" IN ('mobile', 'desktop'));
ALTER TABLE "climb_runs" ADD CONSTRAINT "climb_runs_board_valid" CHECK ("board" IN ('mobile', 'desktop'));

DROP INDEX "climb_record_user_category";
CREATE UNIQUE INDEX "climb_record_user_category_board" ON "climb_records"("userId", "category_slug", "board");

DROP INDEX "climb_record_leaderboard_idx";
CREATE INDEX "climb_record_leaderboard_idx" ON "climb_records"("category_slug", "board", "peak_y" DESC);
