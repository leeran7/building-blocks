/**
 * The gem-pack table (src/lib/gemPacks.ts) is what both payment paths credit
 * from, so its lookups must be exact allow-lists.
 */

import { describe, expect, it } from "vitest";
import {
  APP_STORE_MARKUP,
  GEM_PACKS,
  appStoreCents,
  formatUsd,
  gemPackByAppleProduct,
  gemPackById,
} from "../../src/lib/gemPacks";
import { DEFAULT_APPLE_BUNDLE_ID } from "../../src/api/appleIap";
import { SKIN_GEMS } from "../../src/lib/avatars";

describe("gem packs", () => {
  it("has unique ids and App Store products under the app's bundle id, cheapest first", () => {
    expect(new Set(GEM_PACKS.map((p) => p.id)).size).toBe(GEM_PACKS.length);
    expect(new Set(GEM_PACKS.map((p) => p.appleProductId)).size).toBe(GEM_PACKS.length);
    for (const p of GEM_PACKS) expect(p.appleProductId.startsWith(`${DEFAULT_APPLE_BUNDLE_ID}.`)).toBe(true);
    for (let i = 1; i < GEM_PACKS.length; i++) {
      expect(GEM_PACKS[i].usdCents).toBeGreaterThan(GEM_PACKS[i - 1].usdCents);
      expect(GEM_PACKS[i].gems).toBeGreaterThan(GEM_PACKS[i - 1].gems);
    }
  });

  it("sells one skin's worth of gems in a single pack", () => {
    expect(GEM_PACKS.some((p) => p.gems === SKIN_GEMS)).toBe(true);
  });

  it("looks packs up by exact id or App Store product only", () => {
    const pack = GEM_PACKS[0];
    expect(gemPackById(pack.id)).toBe(pack);
    expect(gemPackByAppleProduct(pack.appleProductId)).toBe(pack);
    for (const bad of ["", "gems-1", ` ${pack.id}`, "__proto__", null, 500, {}]) {
      expect(gemPackById(bad)).toBeNull();
      expect(gemPackByAppleProduct(bad)).toBeNull();
    }
  });

  it("passes Apple's 30% on in App Store prices, rounded up to a price ending in 9", () => {
    expect(GEM_PACKS.map((p) => p.appleUsdCents)).toEqual([649, 1299, 2599, 6499]);
    for (const p of GEM_PACKS) {
      expect(p.appleUsdCents).toBeGreaterThanOrEqual(p.usdCents * APP_STORE_MARKUP);
      expect(p.appleUsdCents % 10).toBe(9);
    }
    expect(appStoreCents(1000)).toBe(1309);
  });

  it("formats web prices", () => {
    expect(formatUsd(999)).toBe("$9.99");
    expect(formatUsd(4999)).toBe("$49.99");
  });
});
