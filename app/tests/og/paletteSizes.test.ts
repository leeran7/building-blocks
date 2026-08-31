/**
 * AC-20–23, AC-33 — palette, sizes, listing model, sanitizer.
 * Do not grep route.tsx for hexes.
 */

import { describe, expect, it } from "vitest";
import { OG_PALETTE } from "../../src/og/palette";
import { sanitizeOgText } from "../../src/og/sanitize";
import { buildListingOgModel } from "../../src/og/listingModel";
import {
  listingOgImageOptions,
  recordOgImageOptions,
  recordingOgImageOptions,
} from "../../src/og/sizes";

describe("OG_PALETTE and size helpers (AC-20, AC-21, AC-22, AC-33)", () => {
  it("matches DESIGN void/signal/ember/text-primary hexes (AC-22)", () => {
    expect(OG_PALETTE.void).toBe("#0a0a0c");
    expect(OG_PALETTE.signal).toBe("#cbf24d");
    expect(OG_PALETTE.ember).toBe("#ff5a2c");
    expect(OG_PALETTE.textPrimary).toBe("#f4f2ec");
  });

  it("listing OG options are 1200×630 and carry OG_PALETTE (AC-22)", () => {
    expect(listingOgImageOptions()).toEqual({ width: 1200, height: 630 });
    const model = buildListingOgModel({ name: null, alt: null, rank: null });
    expect(model.palette).toEqual(OG_PALETTE);
    expect(model.palette.void).toBe("#0a0a0c");
    expect(model.name).toBe("Stack");
    expect(model.alt).toBe("0");
    expect(model.rank).toBe("1");
  });

  it("recording landscape is 1200×630 and square is 1080×1080 (AC-20, AC-21)", () => {
    expect(recordingOgImageOptions("landscape")).toEqual({
      width: 1200,
      height: 630,
    });
    expect(recordingOgImageOptions("square")).toEqual({
      width: 1080,
      height: 1080,
    });
  });

  it("record OG options are 1200×630 with the same palette (AC-33)", () => {
    expect(recordOgImageOptions()).toEqual({ width: 1200, height: 630 });
    expect(OG_PALETTE).toEqual({
      void: "#0a0a0c",
      signal: "#cbf24d",
      ember: "#ff5a2c",
      textPrimary: "#f4f2ec",
    });
  });
});

describe("sanitizeOgText and listing model junk params (AC-23)", () => {
  it("strips markup and does not throw on overlong HTML", () => {
    const chunk = "<script>alert(1)</script>";
    const raw = chunk.repeat(Math.ceil(501 / chunk.length));
    expect(raw.length).toBeGreaterThan(500);
    const cleaned = sanitizeOgText(raw, 80);
    expect(cleaned.toLowerCase()).not.toContain("<script");
    expect(cleaned.toLowerCase()).not.toContain("<img");
    expect(cleaned.length).toBeLessThanOrEqual(80);
  });

  it("sanitizes listing name/rank and defaults non-numeric alt", () => {
    const chunk = "<script>alert(1)</script>";
    const name = chunk.repeat(Math.ceil(501 / chunk.length));
    const model = buildListingOgModel({
      name,
      alt: "not-a-number",
      rank: "<img>",
    });
    expect(model.name.toLowerCase()).not.toContain("<script");
    expect(model.name.toLowerCase()).not.toContain("<img");
    expect(model.rank.toLowerCase()).not.toContain("<img");
    expect(model.alt).toBe("0");
    expect(model.palette).toEqual(OG_PALETTE);
  });
});
