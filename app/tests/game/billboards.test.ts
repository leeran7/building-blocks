/**
 * Paid-stack billboards — placement is cosmetic and deterministic.
 */

import { describe, it, expect } from "vitest";
import { signX, visibleBillboards, type Billboard } from "../../src/game/billboards";
import {
  DEFAULT_STACK_SLUG,
  isGameCategory,
  parsePaidStackSlug,
  GAME_CATEGORIES,
} from "../../src/game/categories";

describe("signX", () => {
  it("is deterministic per slug", () => {
    expect(signX(100, "acme")).toBe(signX(100, "acme"));
  });

  it("varies across brands and stays inside the playable width", () => {
    const a = signX(100, "acme");
    const b = signX(100, "linear");
    expect(a).not.toBe(b);
    expect(a).toBeGreaterThan(8);
    expect(a).toBeLessThan(92);
    expect(b).toBeGreaterThan(8);
    expect(b).toBeLessThan(92);
  });
});

describe("visibleBillboards", () => {
  it("drops unpaid (altitude 0) and empty slugs", () => {
    const signs: Billboard[] = [
      {
        slug: "paid",
        display_name: "Paid",
        url: "https://example.com",
        altitude: 12,
        category: "indie-games",
      },
      {
        slug: "unpaid",
        display_name: "Unpaid",
        url: "https://example.com",
        altitude: 0,
        category: "indie-games",
      },
      {
        slug: "",
        display_name: "Nope",
        url: "https://example.com",
        altitude: 20,
        category: "indie-games",
      },
    ];
    expect(visibleBillboards(signs).map((s) => s.slug)).toEqual(["paid"]);
  });
});

describe("paid stack slugs", () => {
  it("DEFAULT_STACK_SLUG is a curated 74-stack, never a legacy broad slug", () => {
    expect(isGameCategory(DEFAULT_STACK_SLUG)).toBe(true);
    expect(["tech", "design", "business", "creative", "gaming", "science"]).not.toContain(
      DEFAULT_STACK_SLUG
    );
    expect(GAME_CATEGORIES[0].slug).toBe(DEFAULT_STACK_SLUG);
  });

  it("parsePaidStackSlug rejects ghost and empty values", () => {
    expect(parsePaidStackSlug("tech")).toBeNull();
    expect(parsePaidStackSlug("")).toBeNull();
    expect(parsePaidStackSlug(undefined)).toBeNull();
    expect(parsePaidStackSlug("indie-games")).toBe("indie-games");
    expect(parsePaidStackSlug("AI-AND-ML-TOOLS")).toBe("ai-and-ml-tools");
    expect(parsePaidStackSlug("constructor")).toBeNull();
    expect(parsePaidStackSlug("toString")).toBeNull();
    expect(parsePaidStackSlug("__proto__")).toBeNull();
    expect(parsePaidStackSlug("hasOwnProperty")).toBeNull();
  });
});
