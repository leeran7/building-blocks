-- Add drop-safe rematch pointer to duels
-- Set on a completed duel when a rematch is created so the opponent can
-- discover the new room even if the realtime "rematch" event is dropped.
ALTER TABLE "duels" ADD COLUMN "rematch_duel_id" TEXT;
