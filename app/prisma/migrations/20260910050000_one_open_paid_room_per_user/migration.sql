-- Enforce "one open paid room per user" at the database level.
--
-- The application checked this with a read-then-write (findFirst, then
-- create) with no lock in between, so two concurrent requests from the same
-- user could both pass the check and each open + stake a separate pending
-- paid room. Prisma's schema DSL cannot express a partial (WHERE-qualified)
-- unique index, so this is a hand-written migration; see prisma/schema.prisma
-- for the doc-only @@index the Duel model carries alongside it.
CREATE UNIQUE INDEX "duel_one_open_paid_room_per_user"
ON "duels" ("player1_id")
WHERE "status" = 'pending' AND "stake_cents" IS NOT NULL AND "player2_id" IS NULL;
