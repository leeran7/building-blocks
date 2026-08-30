-- Store deterministic replay tokens on saved climb runs for dashboard playback.

ALTER TABLE "climb_runs" ADD COLUMN "replay_token" TEXT;

CREATE INDEX "climb_run_user_idx" ON "climb_runs"("userId", "created_at" DESC);
