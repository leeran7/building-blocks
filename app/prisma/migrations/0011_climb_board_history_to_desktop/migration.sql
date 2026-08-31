-- Repair preview/local DBs that applied an earlier 0010 which backfilled
-- board='mobile'. Re-home only rows whose timestamps predate 0010's
-- finished_at so legitimate post-split omit-POST Mobile writes stay Mobile.
-- After a correct 0010 (existing rows already desktop) this is a no-op.
--
-- Do not blanket UPDATE board='desktop' WHERE board='mobile'.

DO $$
DECLARE
  cutover_at TIMESTAMP(3);
BEGIN
  SELECT "finished_at" INTO cutover_at
  FROM "_prisma_migrations"
  WHERE "migration_name" = '0010_climb_board_split'
    AND "finished_at" IS NOT NULL
    AND "rolled_back_at" IS NULL
  LIMIT 1;

  IF cutover_at IS NULL THEN
    RETURN;
  END IF;

  -- Unique-key merge: a preview user may already have an explicit desktop row
  -- plus a historical mobile row. Fold peak/wins into desktop, then delete
  -- the historical mobile row so the later UPDATE cannot P2002.
  UPDATE "climb_records" AS d
  SET
    "peak_y" = GREATEST(d."peak_y", m."peak_y"),
    "wins" = d."wins" + m."wins"
  FROM "climb_records" AS m
  WHERE m."board" = 'mobile'
    AND m."updated_at" < cutover_at
    AND d."board" = 'desktop'
    AND d."userId" = m."userId"
    AND d."category_slug" = m."category_slug";

  DELETE FROM "climb_records" AS m
  WHERE m."board" = 'mobile'
    AND m."updated_at" < cutover_at
    AND EXISTS (
      SELECT 1
      FROM "climb_records" AS d
      WHERE d."board" = 'desktop'
        AND d."userId" = m."userId"
        AND d."category_slug" = m."category_slug"
    );

  UPDATE "climb_records"
  SET "board" = 'desktop'
  WHERE "board" = 'mobile'
    AND "updated_at" < cutover_at;

  UPDATE "climb_runs"
  SET "board" = 'desktop'
  WHERE "board" = 'mobile'
    AND "created_at" < cutover_at;
END $$;

ALTER TABLE "climb_records" ALTER COLUMN "board" SET DEFAULT 'mobile';
ALTER TABLE "climb_runs" ALTER COLUMN "board" SET DEFAULT 'mobile';

-- Preview DBs that applied the draft 0010 may lack updated_at on this index.
DROP INDEX IF EXISTS "climb_record_leaderboard_idx";
CREATE INDEX "climb_record_leaderboard_idx"
  ON "climb_records"("category_slug", "board", "peak_y" DESC, "updated_at" ASC);
