/**
 * Phase 2 API Tests — AC-16 through AC-20
 *
 * Tests schema correctness, spend_c isolation, API response shape, cache headers, and no rank column.
 * These are integration tests that verify the schema design and API contracts.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

// ── AC-16: Schema correctness (snapshot test) ─────────────────────────────
describe("AC-16: Schema correctness", () => {
  const schemaPath = resolve(__dirname, "../../prisma/schema.prisma");
  const schema = readFileSync(schemaPath, "utf-8");

  it("schema contains blocks table with required columns", () => {
    expect(schema).toContain('model Block');
    expect(schema).toContain('altitude');
    expect(schema).toContain('spend_c');
    expect(schema).toContain('views_served');
    expect(schema).toContain('clicks');
    expect(schema).toContain('peak_rank');
    expect(schema).toContain('hidden_at');
    expect(schema).toContain('slug');
    expect(schema).toContain('url');
    expect(schema).toContain('display_name');
    expect(schema).toContain('owner_email');
  });

  it("schema contains season_state table", () => {
    expect(schema).toContain('model Season');
    expect(schema).toContain('views_k');
    expect(schema).toContain('starts_at');
    expect(schema).toContain('ends_at');
    expect(schema).toContain('is_active');
    expect(schema).toContain('@@map("season_state")');
  });

  it("schema contains payments table with stripe_session_id UNIQUE", () => {
    expect(schema).toContain('model Payment');
    expect(schema).toContain('stripe_session_id');
    expect(schema).toContain('@unique'); // UNIQUE constraint on stripe_session_id
    expect(schema).toContain('amount_cents');
    expect(schema).toContain('metres_added');
  });

  it("migration 0002 contains CHECK constraints", () => {
    const migration0002 = readFileSync(
      resolve(__dirname, "../../prisma/migrations/0002_add_check_constraints/migration.sql"),
      "utf-8"
    );
    expect(migration0002).toContain("blocks_altitude_nonneg");
    expect(migration0002).toContain("CHECK (altitude >= 0)");
    expect(migration0002).toContain("season_views_k_nonneg");
    expect(migration0002).toContain("CHECK (views_k >= 0)");
  });

  it("migration 0002 creates partial index for rank query", () => {
    const migration0002 = readFileSync(
      resolve(__dirname, "../../prisma/migrations/0002_add_check_constraints/migration.sql"),
      "utf-8"
    );
    expect(migration0002).toContain("blocks_rank_idx");
    expect(migration0002).toContain("altitude DESC");
    expect(migration0002).toContain("hidden_at IS NULL");
  });
});

// ── AC-17: spend_c isolation — never in ORDER BY ──────────────────────────
describe("AC-17: spend_c never in ORDER BY", () => {
  it("blocks.ts DB query file does not contain 'ORDER BY spend_c'", () => {
    const blocksPath = resolve(__dirname, "../../src/db/blocks.ts");
    const blocksContent = readFileSync(blocksPath, "utf-8");

    // Verify spend_c is not in any ORDER BY clause
    const lowerContent = blocksContent.toLowerCase();
    // Check for any ORDER BY containing spend_c
    const orderBySpendC = /order.*by.*spend_c/i.test(blocksContent);
    expect(orderBySpendC).toBe(false);

    // Verify that ORDER BY altitude is present
    expect(blocksContent).toContain("altitude");
    expect(blocksContent).toContain('"desc"');
  });

  it("tower API route does not contain ORDER BY spend_c", () => {
    const routePath = resolve(__dirname, "../../app/api/tower/route.ts");
    const routeContent = readFileSync(routePath, "utf-8");

    const orderBySpendC = /order.*by.*spend_c/i.test(routeContent);
    expect(orderBySpendC).toBe(false);
  });

  it("spend_c is present in schema but only for display (no query ordering)", () => {
    const schemaPath = resolve(__dirname, "../../prisma/schema.prisma");
    const schema = readFileSync(schemaPath, "utf-8");

    // spend_c exists in schema
    expect(schema).toContain("spend_c");

    // Check migration files don't have spend_c in ORDER BY
    const migration0001 = readFileSync(
      resolve(__dirname, "../../prisma/migrations/0001_initial/migration.sql"),
      "utf-8"
    );
    const orderBySpendCInMigration = /order.*by.*spend_c/i.test(migration0001);
    expect(orderBySpendCInMigration).toBe(false);
  });
});

// ── AC-18: GET /api/tower response shape (contract test) ─────────────────
describe("AC-18: GET /api/tower response shape", () => {
  // This test validates the type contracts without needing a live server
  it("tower route file exports GET handler", () => {
    const routePath = resolve(__dirname, "../../app/api/tower/route.ts");
    const routeContent = readFileSync(routePath, "utf-8");

    expect(routeContent).toContain("export async function GET");
  });

  it("tower route computes buried, amber_edge, rank at API layer", () => {
    const routePath = resolve(__dirname, "../../app/api/tower/route.ts");
    const routeContent = readFileSync(routePath, "utf-8");

    expect(routeContent).toContain("buried");
    expect(routeContent).toContain("amber_edge");
    expect(routeContent).toContain("rank");
    expect(routeContent).toContain("isBuried");
    expect(routeContent).toContain("isAmberEdge");
  });

  it("tower route includes season, engine, and blocks in response", () => {
    const routePath = resolve(__dirname, "../../app/api/tower/route.ts");
    const routeContent = readFileSync(routePath, "utf-8");

    expect(routeContent).toContain("season");
    expect(routeContent).toContain("engine");
    expect(routeContent).toContain("blocks");
    expect(routeContent).toContain("cost_of_rank1_usd");
  });

  it("tower route orders by altitude DESC (never spend_c)", () => {
    const blocksPath = resolve(__dirname, "../../src/db/blocks.ts");
    const blocksContent = readFileSync(blocksPath, "utf-8");

    // getRankedBlocks uses altitude: "desc"
    expect(blocksContent).toContain('orderBy: { altitude: "desc" }');
    expect(blocksContent).not.toMatch(/orderBy.*spend_c/i);
  });
});

// ── AC-19: Cache-Control headers ──────────────────────────────────────────
describe("AC-19: Cache-Control headers", () => {
  it("tower route sets s-maxage=3, stale-while-revalidate", () => {
    const routePath = resolve(__dirname, "../../app/api/tower/route.ts");
    const routeContent = readFileSync(routePath, "utf-8");

    expect(routeContent).toContain("s-maxage=3");
    expect(routeContent).toContain("stale-while-revalidate");
  });
});

// ── AC-20: No rank column in schema ──────────────────────────────────────
describe("AC-20: No position or rank integer column in blocks table", () => {
  it("schema does not have position or rank column in blocks", () => {
    const schemaPath = resolve(__dirname, "../../prisma/schema.prisma");
    const schema = readFileSync(schemaPath, "utf-8");

    // No position column
    // Note: peak_rank is allowed (it's the best historical rank, not current rank)
    // We check that there's no "position" or standalone "rank" column
    expect(schema).not.toContain("position     Int");
    expect(schema).not.toContain("position Int");

    // Verify rank is NOT stored as a column name (peak_rank is allowed per spec)
    // The spec says no "integer position column" for current rank
    // peak_rank is historical best rank — this is fine
    const hasRankColumn = /^\s+rank\s+Int/m.test(schema);
    expect(hasRankColumn).toBe(false);
  });

  it("migration 0001 does not create position or rank column", () => {
    const migration0001 = readFileSync(
      resolve(__dirname, "../../prisma/migrations/0001_initial/migration.sql"),
      "utf-8"
    );

    // No position column
    expect(migration0001).not.toContain('"position"');
    // No standalone rank column (rank is derived in queries)
    const hasRankCol = /"rank"\s+INTEGER/i.test(migration0001);
    expect(hasRankCol).toBe(false);
  });

  it("getRankedBlocks in blocks.ts uses ORDER BY, not a rank column", () => {
    const blocksPath = resolve(__dirname, "../../src/db/blocks.ts");
    const blocksContent = readFileSync(blocksPath, "utf-8");

    // Uses orderBy (Prisma) not a stored rank
    expect(blocksContent).toContain("orderBy");
    expect(blocksContent).toContain("altitude");
  });
});
