-- Deprecate & remove Paid Stacks.
--
-- The original monetization layer (paid listings buying permanent "altitude" on
-- per-category towers) is superseded by Paid 1v1 Battles (duel staking + credits
-- wallet). Drop its three tables. Data is intentionally NOT archived (product
-- decision). Order respects FKs: payments -> blocks -> season_state.
--
-- KEPT: payment_dead_letters (still used by the credits top-up webhook) and the
-- "CreatorPlatform" enum (still used by saved_social_handles).

DROP TABLE IF EXISTS "payments" CASCADE;
DROP TABLE IF EXISTS "blocks" CASCADE;
DROP TABLE IF EXISTS "season_state" CASCADE;
