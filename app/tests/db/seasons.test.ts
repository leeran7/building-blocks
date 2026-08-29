/**
 * Season readers must not write.
 *
 * The ghost-season bug was that public read paths called
 * getOrCreateActiveSeason, so an unauthenticated GET on a stack that had never
 * sold anything opened a 90-day season for it. The tests that were supposed to
 * catch this asserted `not.toContain("getOrCreateActiveSeason()")` — the
 * literal empty-paren form, which no real call site can produce because the
 * function requires a category argument. They could never fail.
 *
 * These count actual writes instead.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { getActiveSeason, getOrCreateActiveSeason } from "../../src/db/seasons";
import { store, resetStore } from "./fakePrisma";

vi.mock("../../src/db/client", async () => {
  const { fakePrisma } = await import("./fakePrisma");
  return { prisma: fakePrisma };
});

describe("getActiveSeason — read-only", () => {
  beforeEach(() => {
    resetStore();
  });

  it("returns null for a category with no season and writes nothing", async () => {
    const season = await getActiveSeason("bikes");

    expect(season).toBeNull();
    expect(store.seasonCreates).toBe(0);
    expect(store.seasons).toHaveLength(0);
  });

  it("stays at zero writes across many unknown categories", async () => {
    // The shape of the bug: one row per distinct slug anyone requests.
    for (const slug of ["bikes", "coffee", "chess", "synths", "knives"]) {
      await getActiveSeason(slug);
    }

    expect(store.seasonCreates).toBe(0);
  });

  it("returns the existing active season without writing", async () => {
    seedSeason("bikes", { views_k: 12 });

    const season = await getActiveSeason("bikes");

    expect(season?.views_k).toBe(12);
    expect(store.seasonCreates).toBe(0);
  });

  it("does not return another category's season", async () => {
    seedSeason("bikes");

    expect(await getActiveSeason("coffee")).toBeNull();
    expect(store.seasonCreates).toBe(0);
  });

  it("does not return an inactive season", async () => {
    seedSeason("bikes", { is_active: false });

    expect(await getActiveSeason("bikes")).toBeNull();
    expect(store.seasonCreates).toBe(0);
  });
});

describe("getOrCreateActiveSeason — write path", () => {
  beforeEach(() => {
    resetStore();
  });

  it("creates exactly one season when none exists", async () => {
    const season = await getOrCreateActiveSeason("bikes");

    expect(store.seasonCreates).toBe(1);
    expect(season.category).toBe("bikes");
    expect(season.views_k).toBe(0);
    expect(season.is_active).toBe(true);
  });

  it("is idempotent — a second call reuses the first season", async () => {
    const first = await getOrCreateActiveSeason("bikes");
    const second = await getOrCreateActiveSeason("bikes");

    expect(store.seasonCreates).toBe(1);
    expect(second.id).toBe(first.id);
  });

  it("opens the season for 90 days", async () => {
    const season = await getOrCreateActiveSeason("bikes");

    const days =
      (season.ends_at.getTime() - season.starts_at.getTime()) / 86_400_000;
    expect(Math.round(days)).toBe(90);
  });

  it("keeps categories separate", async () => {
    await getOrCreateActiveSeason("bikes");
    await getOrCreateActiveSeason("coffee");

    expect(store.seasonCreates).toBe(2);
    expect(store.seasons.map((s) => s.category)).toEqual(["bikes", "coffee"]);
  });
});

function seedSeason(
  category: string,
  overrides: Partial<{ views_k: number; is_active: boolean }> = {}
): void {
  store.seasons.push({
    id: `seeded_${category}`,
    category,
    is_active: overrides.is_active ?? true,
    views_k: overrides.views_k ?? 0,
    starts_at: new Date("2026-01-01"),
    ends_at: new Date("2026-04-01"),
  });
}
