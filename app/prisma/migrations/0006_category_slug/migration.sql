-- Move category off the fixed 6-value Category enum to a free-form slug string,
-- so every subcategory gets its own paid tower + season. Existing enum values
-- map to their lowercase slug (Tech -> 'tech', etc.).

-- blocks.category (nullable)
ALTER TABLE "blocks" ALTER COLUMN "category" DROP DEFAULT;
ALTER TABLE "blocks" ALTER COLUMN "category" TYPE TEXT USING lower("category"::text);
ALTER TABLE "blocks" ALTER COLUMN "category" SET DEFAULT 'tech';

-- season_state.category (non-null)
ALTER TABLE "season_state" ALTER COLUMN "category" DROP DEFAULT;
ALTER TABLE "season_state" ALTER COLUMN "category" TYPE TEXT USING lower("category"::text);
ALTER TABLE "season_state" ALTER COLUMN "category" SET DEFAULT 'tech';

-- The enum type is no longer referenced.
DROP TYPE "Category";
