-- Switch level season 1 on (Leeran approved, 2026-09-27). Levels are served
-- once a level_seasons row exists and its starts_at has passed. Same row as
-- `pnpm levels:season:open 1`; an existing row is left unchanged.
INSERT INTO "level_seasons" ("id", "name", "starts_at", "min_level_sim_version")
VALUES (1, 'Season 1', CURRENT_TIMESTAMP, 1)
ON CONFLICT ("id") DO NOTHING;
