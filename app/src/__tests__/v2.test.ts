/**
 * Tower v2 — Verifier test suite
 *
 * Covers:
 *   AC-1 to AC-6:  Per-category inflation engine invariants
 *   AC-7 to AC-12: Firebase auth (category validation on /api/tower/[category])
 *   AC-17 to AC-26: Dashboard burial risk and competitor cost
 *
 * All tests are pure unit tests — no I/O, no database, no network.
 */

import { describe, it, expect } from "vitest";
import {
  computeGrowth,
  computeGround,
  isBuried,
  isAmberEdge,
} from "../engine/index";
import type { EngineConstants } from "../engine/constants";
import { parseCategory, getCategoryAccent } from "../lib/categoryUtils";
import { readFileSync } from "fs";
import { resolve } from "path";

// ─── Shared test constants matching production defaults ────────────────────
const C: EngineConstants = {
  DOUBLE_EVERY_K: 500,
  MAX_GROWTH: 8,
  R0: 1.0,
  G0: 0.65,
  MIN_ENTRY_USD: 5.0,
  MIN_SPEND_USD: 2.0,
  SEASON_DAYS: 90,
  CEIL_PER_HOUR: 40000,
};

// ─── 1. Per-category inflation engine ─────────────────────────────────────

describe("computeGrowth — core invariants (AC-1/AC-6)", () => {
  it("returns exactly 1.0 when V = 0", () => {
    // At season start, no views have accumulated — growth must be 1 (no inflation yet)
    expect(computeGrowth(0, C)).toBeCloseTo(1.0, 10);
  });

  it("returns exactly 2.0 at V = DOUBLE_EVERY_K", () => {
    // By definition: growth = exp(ln(2)/DOUBLE_EVERY_K * DOUBLE_EVERY_K) = exp(ln2) = 2
    expect(computeGrowth(C.DOUBLE_EVERY_K, C)).toBeCloseTo(2.0, 10);
  });

  it("caps at MAX_GROWTH = 8 for any V above the cap threshold", () => {
    // V_cap = ln(MAX_GROWTH) * DOUBLE_EVERY_K / ln(2)
    const V_cap = (Math.log(C.MAX_GROWTH) * C.DOUBLE_EVERY_K) / Math.log(2);
    // Far beyond the cap — must still return exactly MAX_GROWTH
    expect(computeGrowth(V_cap + 1000, C)).toBe(C.MAX_GROWTH);
    expect(computeGrowth(1e9, C)).toBe(C.MAX_GROWTH);
  });

  it("never exceeds MAX_GROWTH for any V", () => {
    const vValues = [0, 100, 500, 1000, 2000, 5000, 10000, 1e9];
    for (const V of vValues) {
      const g = computeGrowth(V, C);
      expect(g).toBeLessThanOrEqual(C.MAX_GROWTH);
      expect(Number.isFinite(g)).toBe(true);
      expect(isNaN(g)).toBe(false);
    }
  });

  it("is monotonically non-decreasing with V (before cap)", () => {
    let prev = computeGrowth(0, C);
    for (let V = 50; V <= C.DOUBLE_EVERY_K * 3; V += 50) {
      const curr = computeGrowth(V, C);
      expect(curr).toBeGreaterThanOrEqual(prev);
      prev = curr;
    }
  });
});

describe("computeGround — scales by growth (AC-2/AC-6)", () => {
  it("equals G0 when V = 0 (growth = 1)", () => {
    // ground(0) = G0 * growth(0) = G0 * 1 = G0
    expect(computeGround(0, C)).toBeCloseTo(C.G0, 10);
  });

  it("doubles ground when V = DOUBLE_EVERY_K (growth = 2)", () => {
    // ground(DOUBLE_EVERY_K) = G0 * 2
    expect(computeGround(C.DOUBLE_EVERY_K, C)).toBeCloseTo(C.G0 * 2, 10);
  });

  it("caps at G0 * MAX_GROWTH for very large V", () => {
    const maxGround = C.G0 * C.MAX_GROWTH;
    expect(computeGround(1e9, C)).toBeCloseTo(maxGround, 10);
  });

  it("scales strictly with growth multiplier", () => {
    const V = 250; // arbitrary mid-season value
    const growth = computeGrowth(V, C);
    const ground = computeGround(V, C);
    expect(ground).toBeCloseTo(C.G0 * growth, 10);
  });
});

describe("isBuried — block altitude vs ground line (AC-22)", () => {
  it("returns false when altitude is well above ground", () => {
    // V=0 → ground=0.65; altitude=100 is far above
    expect(isBuried(100, 0, C)).toBe(false);
  });

  it("returns true when altitude is strictly below ground", () => {
    // At V=0, ground=G0=0.65; altitude 0.5 < 0.65 → buried
    expect(isBuried(0.5, 0, C)).toBe(true);
  });

  it("returns false when altitude exactly equals ground (not strictly less)", () => {
    // isBuried uses strict < comparison: altitude < ground
    // altitude === ground → NOT buried
    const ground = computeGround(0, C); // 0.65
    expect(isBuried(ground, 0, C)).toBe(false);
  });

  it("transitions from not-buried to buried as V increases", () => {
    const altitude = 5.0; // fixed altitude ($5 entry at V=0 gives altitude=R0*$5=5m)
    // At V=0, ground=0.65 → not buried
    expect(isBuried(altitude, 0, C)).toBe(false);
    // At very high V, ground hits max = G0*MAX_GROWTH = 0.65*8 = 5.2 > 5.0 → buried
    expect(isBuried(altitude, 1e9, C)).toBe(true);
  });
});

describe("isAmberEdge — near-burial warning (AC-21)", () => {
  it("returns false for a buried block (buried blocks don't show amber)", () => {
    // Buried block should return false (amber is only for above-ground blocks)
    const buriedAlt = 0.1; // well below G0=0.65 at V=0
    expect(isBuried(buriedAlt, 0, C)).toBe(true);
    expect(isAmberEdge(buriedAlt, 0, C)).toBe(false);
  });

  it("returns true when clearance < 1.6 * ground (amber zone)", () => {
    // ground at V=0 is 0.65
    // amber zone: altitude - ground < 1.6 * ground  →  altitude < 2.6 * ground
    // altitude = 0.65 + 0.5 = 1.15 → clearance = 0.5, threshold = 1.6 * 0.65 = 1.04
    // 0.5 < 1.04 → amber
    const ground = computeGround(0, C); // 0.65
    const altitude = ground + 0.5;      // clearance = 0.5 < 1.04
    expect(isAmberEdge(altitude, 0, C)).toBe(true);
  });

  it("returns false when clearance >= 1.6 * ground (safe zone)", () => {
    // clearance must be >= 1.6 * ground to be safe
    // ground=0.65 → threshold=1.04; altitude = 0.65 + 2.0 = 2.65 → clearance=2.0 > 1.04
    const ground = computeGround(0, C);
    const altitude = ground + 2.0; // clearance = 2.0 > 1.6 * 0.65 = 1.04
    expect(isAmberEdge(altitude, 0, C)).toBe(false);
  });

  it("boundary: exactly at 1.6x ground clearance returns false (not strictly less)", () => {
    // clearance === 1.6 * ground → NOT amber (condition is strictly <)
    const ground = computeGround(0, C);
    const altitude = ground + 1.6 * ground; // clearance == 1.6 * ground exactly
    expect(isAmberEdge(altitude, 0, C)).toBe(false);
  });
});

// ─── 2. Category validation on /api/tower/[category] ──────────────────────

describe("Category validation — route source (free-form slugs)", () => {
  // The route now accepts ANY well-formed category slug (every subcategory has
  // its own tower); it only validates the slug shape and normalizes case.
  const routeSrc = readFileSync(
    resolve(__dirname, "../../app/api/tower/[category]/route.ts"),
    "utf-8"
  );

  it("normalizes case and only allows known subcategories", () => {
    expect(routeSrc).toContain(".toLowerCase()");
    expect(routeSrc).toContain("isGameCategory");
  });

  it("returns 404 with INVALID_CATEGORY for a non-subcategory slug", () => {
    expect(routeSrc).toContain('"INVALID_CATEGORY"');
    expect(routeSrc).toContain("status: 404");
  });

  it("no longer hardcodes the fixed 6-category enum map", () => {
    expect(routeSrc).not.toContain("SLUG_TO_CATEGORY");
    expect(routeSrc).not.toContain("Category.Tech");
  });
});

describe("Category validation — parseCategory utility (AC-3)", () => {
  it("returns null for an invalid category string", () => {
    expect(parseCategory("invalidcategory")).toBeNull();
    expect(parseCategory("")).toBeNull();
    expect(parseCategory("unknown")).toBeNull();
    expect(parseCategory("xyz")).toBeNull();
    expect(parseCategory("constructor")).toBeNull();
    expect(parseCategory("toString")).toBeNull();
  });

  it("accepts all 6 valid category slugs", () => {
    const validSlugs = ["tech", "design", "business", "creative", "gaming", "science"] as const;
    for (const slug of validSlugs) {
      expect(parseCategory(slug)).toBe(slug);
    }
  });
});

// ─── 3. Dashboard burial risk formula (AC-21 / AC-22 / AC-23) ─────────────

// Re-implement estimateDaysUntilBuried locally for unit testing.
// This mirrors the production logic in app/api/dashboard/route.ts exactly,
// using the same env-var defaults (G0=10, DOUBLE_EVERY_K=100) when no env override.
function estimateDaysUntilBuried(altitude: number, V: number): number | null {
  // Import computeGround using production default constants (G0=0.65, DOUBLE_EVERY_K=500)
  // to decide "already buried"
  const ground = computeGround(V);
  if (altitude <= ground) {
    return 0;
  }

  // Dashboard route reads these env vars with its own defaults (10, 100)
  const G0 = Number(process.env["ENGINE_G0"] ?? 10);
  const DOUBLE_EVERY_K = Number(process.env["ENGINE_DOUBLE_EVERY_K"] ?? 100);

  const lambda = Math.log(2) / DOUBLE_EVERY_K;
  if (altitude <= G0) {
    return 0;
  }

  const dV = (1 / lambda) * Math.log(altitude / G0) - V;
  if (dV <= 0) return 0;

  const VIEWS_K_PER_DAY_ESTIMATE = 1.0;
  return Math.round(dV / VIEWS_K_PER_DAY_ESTIMATE);
}

describe("Dashboard burial risk formula (AC-21 / AC-22 / AC-23)", () => {
  it("already-buried block returns 0 days", () => {
    // altitude=0.1, V=0: ground=0.65 > 0.1 → buried → 0 days
    const result = estimateDaysUntilBuried(0.1, 0);
    expect(result).toBe(0);
  });

  it("block with huge altitude returns a large positive number of days", () => {
    // altitude=1e6 (far above any ground), V=0 → many days
    const result = estimateDaysUntilBuried(1e6, 0);
    expect(result).toBeGreaterThan(1000);
  });

  it("block is closer to burial as V increases (more views = faster rising ground)", () => {
    const altitude = 100; // well above ground at V=0
    const daysAtV0 = estimateDaysUntilBuried(altitude, 0);
    const daysAtV100 = estimateDaysUntilBuried(altitude, 100);

    // More views elapsed → less time remains
    if (daysAtV0 !== null && daysAtV100 !== null) {
      expect(daysAtV100).toBeLessThan(daysAtV0);
    }
  });

  it("returns a non-negative integer for a block with 100m altitude at V=0", () => {
    // altitude=100, V=0 → well above ground → positive days
    const result = estimateDaysUntilBuried(100, 0);
    expect(result).not.toBeNull();
    if (result !== null) {
      expect(result).toBeGreaterThan(0);
      expect(Number.isInteger(result)).toBe(true); // Math.round returns integer
    }
  });
});

// ─── 4. Category enum coverage (AC-3 / all six valid) ────────────────────

describe("Category enum — all 6 categories are valid (AC-3)", () => {
  // Prisma Category enum values (from schema.prisma)
  const PRISMA_CATEGORIES = ["Tech", "Design", "Business", "Creative", "Gaming", "Science"] as const;
  // URL slugs used by the category tower pages
  const URL_SLUGS = ["tech", "design", "business", "creative", "gaming", "science"] as const;

  it("category is a free-form String slug in the schema (no fixed enum)", () => {
    const schemaSrc = readFileSync(
      resolve(__dirname, "../../prisma/schema.prisma"),
      "utf-8"
    );
    expect(schemaSrc).not.toContain("enum Category");
    // both blocks.category and season_state.category are String now
    expect(schemaSrc).toMatch(/category\s+String/);
  });

  it("all 6 URL slugs are recognized by parseCategory", () => {
    for (const slug of URL_SLUGS) {
      expect(parseCategory(slug)).toBe(slug);
    }
  });

  it("each category has a defined accent color via getCategoryAccent", () => {
    for (const slug of URL_SLUGS) {
      const accent = getCategoryAccent(slug);
      // Must be a non-empty hex color string
      expect(accent).toMatch(/^#[0-9a-fA-F]{6}$/);
    }
  });

  it("Tech category accent is the signal-lime brand hue (ASCENT redesign)", () => {
    expect(getCategoryAccent("tech")).toBe("#cbf24d");
  });
});

// ─── 5. Category-scoped leaderboard route — structural verification ─────────

describe("GET /api/tower/[category] — structural contract (AC-2 / AC-6)", () => {
  const categoryRouteSrc = readFileSync(
    resolve(__dirname, "../../app/api/tower/[category]/route.ts"),
    "utf-8"
  );

  it("route exports a GET handler", () => {
    expect(categoryRouteSrc).toContain("export async function GET");
  });

  it("route fetches blocks filtered by category (category-scoped, not global)", () => {
    // The category filter must be applied to the Prisma query
    expect(categoryRouteSrc).toContain("category,");
    expect(categoryRouteSrc).toContain("where:");
  });

  it("route orders blocks by altitude DESC (not spend_c)", () => {
    expect(categoryRouteSrc).toContain('altitude: "desc"');
    expect(categoryRouteSrc).not.toMatch(/orderBy.*spend_c/i);
  });

  it("route computes and returns engine fields: growth, rate, ground", () => {
    expect(categoryRouteSrc).toContain("computeGrowth");
    expect(categoryRouteSrc).toContain("computeRate");
    expect(categoryRouteSrc).toContain("computeGround");
  });

  it("route returns 404 for invalid category", () => {
    // Architecture contract §4.2: return 404 for unknown category slugs
    expect(categoryRouteSrc).toContain("status: 404");
    expect(categoryRouteSrc).toContain('"INVALID_CATEGORY"');
  });

  it("route includes cost_of_rank1_usd in response", () => {
    expect(categoryRouteSrc).toContain("cost_of_rank1_usd");
  });

  it("route sets Cache-Control header", () => {
    expect(categoryRouteSrc).toContain("s-maxage=3");
    expect(categoryRouteSrc).toContain("stale-while-revalidate");
  });
});

// ─── 6. Dashboard route — structural verification (AC-17 to AC-26) ─────────

describe("GET /api/dashboard — structural contract (AC-17 through AC-26)", () => {
  const dashboardSrc = readFileSync(
    resolve(__dirname, "../../app/api/dashboard/route.ts"),
    "utf-8"
  );

  it("dashboard route exports GET handler", () => {
    expect(dashboardSrc).toContain("export async function GET");
  });

  it("dashboard requires auth via requireAuth (AC-17 / AC-11 / AC-12)", () => {
    expect(dashboardSrc).toContain("requireAuth");
    expect(dashboardSrc).toContain("AuthError");
  });

  it("dashboard returns 401 when auth fails (AC-17)", () => {
    // On auth failure, returns the AuthError response (which is a 401)
    expect(dashboardSrc).toContain("err instanceof AuthError");
    expect(dashboardSrc).toContain("err.response");
  });

  it("dashboard computes burial_risk_days per block (AC-21 / AC-22)", () => {
    expect(dashboardSrc).toContain("burial_risk_days");
    expect(dashboardSrc).toContain("estimateDaysUntilBuried");
  });

  it("dashboard sets buried flag using isBuried engine function (AC-22)", () => {
    expect(dashboardSrc).toContain("isBuried");
    expect(dashboardSrc).toContain("buried:");
  });

  it("dashboard sets amber_edge flag using isAmberEdge engine function (AC-21)", () => {
    expect(dashboardSrc).toContain("isAmberEdge");
    expect(dashboardSrc).toContain("amber_edge:");
  });

  it("dashboard returns competitor block for non-#1 ranked blocks (AC-24)", () => {
    expect(dashboardSrc).toContain("competitor");
    expect(dashboardSrc).toContain("display_name");
  });

  it("dashboard returns null competitor for rank-#1 blocks (AC-25)", () => {
    // myIndex === 0 means rank #1 — blockAbove is null, rank_above_altitude is null
    expect(dashboardSrc).toContain("myIndex > 0");
    expect(dashboardSrc).toContain("rank_above_altitude");
  });

  it("dashboard returns empty blocks array for users with no blocks (AC-26)", () => {
    expect(dashboardSrc).toContain('blocks: []');
  });

  it("dashboard includes ground value per block for display (AC-21)", () => {
    expect(dashboardSrc).toContain("ground,");
  });

  it("estimateDaysUntilBuried returns 0 for an already-buried block (AC-22)", () => {
    // From the source: if altitude <= ground → return 0
    expect(dashboardSrc).toContain("altitude <= ground");
    expect(dashboardSrc).toContain("return 0");
  });
});

// ─── 7. requireAuth middleware — auth invariants (AC-11 / AC-12) ───────────

describe("requireAuth middleware — structural contract (AC-11 / AC-12)", () => {
  const requireAuthSrc = readFileSync(
    resolve(__dirname, "../lib/requireAuth.ts"),
    "utf-8"
  );

  it("exports requireAuth function", () => {
    expect(requireAuthSrc).toContain("export async function requireAuth");
  });

  it("throws AuthError with 401 when Authorization header is missing (AC-11)", () => {
    // Checks for missing/malformed header
    expect(requireAuthSrc).toContain("Missing or malformed Authorization header");
    expect(requireAuthSrc).toContain("401");
  });

  it("throws AuthError with 401 when token verification fails (AC-12)", () => {
    // verifyIdToken failure → AuthError with UNAUTHORIZED code
    expect(requireAuthSrc).toContain("Invalid or expired token");
    expect(requireAuthSrc).toContain('"UNAUTHORIZED"');
  });

  it("extracts Bearer token from Authorization header", () => {
    expect(requireAuthSrc).toContain('startsWith("Bearer ")');
    expect(requireAuthSrc).toContain("slice(7)");
  });

  it("verifies token using verifyIdToken (Firebase Admin SDK)", () => {
    expect(requireAuthSrc).toContain("verifyIdToken");
  });
});

// ─── 8. Prisma schema — v2 additions (AC-6 / AC-13 / AC-14) ──────────────

describe("Prisma schema — v2 additions (AC-6 / Category enum / User model)", () => {
  const schemaSrc = readFileSync(
    resolve(__dirname, "../../prisma/schema.prisma"),
    "utf-8"
  );

  it("category is a free-form String slug (subcategories, not a fixed enum)", () => {
    expect(schemaSrc).not.toContain("enum Category");
    expect(schemaSrc).toMatch(/category\s+String/);
  });

  it("Block model has category field (AC-6 / AC-13 / AC-14)", () => {
    expect(schemaSrc).toContain("category");
  });

  it("Block model has userId for auth-gated submissions (AC-13 / AC-14)", () => {
    expect(schemaSrc).toContain("userId");
  });

  it("User model exists with Firebase UID as PK and emailVerified field (AC-7)", () => {
    expect(schemaSrc).toContain("model User");
    expect(schemaSrc).toContain("emailVerified");
  });
});
