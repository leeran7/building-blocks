-- Consolidate per-category climb records into the single free stack leaderboard.
-- Each user keeps their best peak_y across all prior category records.

-- Raise existing free-stack records to each user's all-time best.
UPDATE climb_records AS cr
SET
  peak_y = sub.max_peak,
  wins = sub.total_wins,
  updated_at = sub.latest
FROM (
  SELECT
    "userId",
    MAX(peak_y) AS max_peak,
    COALESCE(SUM(wins), 0)::int AS total_wins,
    MAX(updated_at) AS latest
  FROM climb_records
  GROUP BY "userId"
) AS sub
WHERE cr."userId" = sub."userId"
  AND cr.category_slug = 'free';

-- Create free-stack records for users who only had per-category rows.
INSERT INTO climb_records ("id", "userId", "category_slug", "peak_y", "wins", "updated_at")
SELECT
  'mig_' || "userId",
  "userId",
  'free',
  MAX(peak_y),
  COALESCE(SUM(wins), 0)::int,
  MAX("updated_at")
FROM climb_records
WHERE category_slug <> 'free'
  AND "userId" NOT IN (
    SELECT "userId" FROM climb_records WHERE category_slug = 'free'
  )
GROUP BY "userId";

DELETE FROM climb_records WHERE category_slug <> 'free';

UPDATE climb_runs SET category_slug = 'free' WHERE category_slug <> 'free';
