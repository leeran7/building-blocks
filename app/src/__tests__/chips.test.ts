import { describe, it, expect } from "vitest";
import { isValidChipTier, CHIP_TIERS } from "../db/chips";

describe("isValidChipTier", () => {
  it("accepts exactly the configured chip tiers", () => {
    for (const tier of CHIP_TIERS) {
      expect(isValidChipTier(tier)).toBe(true);
    }
  });

  it("rejects anything off the list", () => {
    expect(isValidChipTier(0)).toBe(false);
    expect(isValidChipTier(50)).toBe(false);
    expect(isValidChipTier(200)).toBe(false);
    expect(isValidChipTier(300)).toBe(false);
    expect(isValidChipTier(999)).toBe(false);
    expect(isValidChipTier(-100)).toBe(false);
  });
});

describe("CHIP_TIERS", () => {
  it("contains the expected set of non-cashable chip amounts", () => {
    expect(CHIP_TIERS).toEqual([100, 250, 500, 1000, 2500]);
  });
});
