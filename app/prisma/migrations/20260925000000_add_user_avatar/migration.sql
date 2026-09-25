-- Profile avatars: the player's chosen catalogue id (src/lib/avatars.ts).
-- Nullable with no default, so this is a metadata-only change on Postgres (no
-- table rewrite) and every existing player keeps the initials badge. No index:
-- the column is only ever read alongside the row, never queried by.
--
-- Down: ALTER TABLE "users" DROP COLUMN "avatar_id";

ALTER TABLE "users" ADD COLUMN "avatar_id" TEXT;
