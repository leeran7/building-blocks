-- Global newest-first replay listing across all users (admin list_climb_replays
-- tool). Neither climb_run_category_idx nor climb_run_user_idx covers an
-- all-rows ORDER BY created_at DESC scan.
CREATE INDEX "climb_run_created_idx" ON "climb_runs"("created_at" DESC);
