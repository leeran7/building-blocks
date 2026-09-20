-- Remove saved URLs.
--
-- Saved URLs were the reuse-at-submit list for Paid Stacks (paid listings that
-- carried a Block.url). Paid Stacks were dropped in 20260910060000; the creator
-- page and settings now keep only social handles. Drop the leftover table.
-- Data is intentionally NOT archived (product decision), matching drop_paid_stacks.
--
-- KEPT: saved_social_handles (still powers the creator-page social chips).

DROP TABLE IF EXISTS "saved_urls" CASCADE;
