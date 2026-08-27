/**
 * Display-name sanitisation tests. The stored name is shown publicly on the
 * climb leaderboard, so invisible / bidi-spoofing characters must be stripped.
 * Invisible characters are built from code points so this source stays ASCII.
 */

import { describe, it, expect } from "vitest";
import { sanitizeDisplayName } from "../../src/lib/sanitizeName";

const ZWSP = String.fromCodePoint(0x200b);
const ZWJ = String.fromCodePoint(0x200d);
const BOM = String.fromCodePoint(0xfeff);
const RLO = String.fromCodePoint(0x202e); // right-to-left override
const NULL = String.fromCodePoint(0x00);

describe("sanitizeDisplayName", () => {
  it("keeps ordinary names unchanged", () => {
    expect(sanitizeDisplayName("Acme Labs")).toBe("Acme Labs");
  });

  it("trims and collapses internal whitespace", () => {
    expect(sanitizeDisplayName("  Acme   Labs  ")).toBe("Acme Labs");
  });

  it("strips zero-width and BOM characters", () => {
    expect(sanitizeDisplayName(`Ac${ZWSP}me${ZWJ}${BOM}`)).toBe("Acme");
  });

  it("strips bidi override characters used to spoof text", () => {
    expect(sanitizeDisplayName(`Acme${RLO}Labs`)).toBe("AcmeLabs");
  });

  it("strips C0 control characters", () => {
    expect(sanitizeDisplayName(`Ac${NULL}me`)).toBe("Acme");
  });

  it("reduces an all-invisible name to empty (caller maps to null)", () => {
    expect(sanitizeDisplayName(`${ZWSP}${BOM}${RLO}`)).toBe("");
  });

  it("preserves legitimate unicode letters/emoji", () => {
    expect(sanitizeDisplayName("Café Ürün 🚀")).toBe("Café Ürün 🚀");
  });
});
