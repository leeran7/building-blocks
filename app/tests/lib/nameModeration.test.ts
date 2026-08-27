/**
 * Hate-name filter tests. Public display names must not carry racist / hateful
 * content. Matching is evasion-resistant (case, leet-speak, spacing), so the
 * tests assert those bypass attempts are still caught.
 */

import { describe, it, expect } from "vitest";
import { isHatefulName } from "../../src/lib/nameModeration";

describe("isHatefulName", () => {
  it("allows ordinary names", () => {
    for (const ok of ["Acme Labs", "Swift Ibex 42", "Café Owner", "rocket_dev"]) {
      expect(isHatefulName(ok)).toBe(false);
    }
  });

  it("blocks a plain slur", () => {
    expect(isHatefulName("kike")).toBe(true);
  });

  it("blocks case variants", () => {
    expect(isHatefulName("ChInK")).toBe(true);
  });

  it("blocks leet-speak evasion", () => {
    expect(isHatefulName("n1gg3r")).toBe(true);
    expect(isHatefulName("n!gger")).toBe(true);
  });

  it("blocks spacing / separator evasion", () => {
    expect(isHatefulName("k i k e")).toBe(true);
    expect(isHatefulName("c.h.i.n.k")).toBe(true);
  });

  it("blocks a slur embedded in a longer name", () => {
    expect(isHatefulName("xX_kike_Xx")).toBe(true);
  });

  it("blocks nazi rallying terms", () => {
    expect(isHatefulName("SiegHeil")).toBe(true);
    expect(isHatefulName("white power")).toBe(true);
  });

  it("treats empty / whitespace as not hateful", () => {
    expect(isHatefulName("")).toBe(false);
    expect(isHatefulName("   ")).toBe(false);
  });
});
