/**
 * Paid stacks must never settle, bury, or inflate against the leftover "tech"
 * season unless a row actually lives there.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

describe("season helpers require a category", () => {
  it("does not default missing category to tech", () => {
    const src = readFileSync(resolve(__dirname, "../../src/db/seasons.ts"), "utf-8");
    expect(src).not.toMatch(/category:\s*string\s*=\s*"tech"/);
  });
});

describe("record page uses the block's own stack", () => {
  it("does not open the unscoped tech season", () => {
    const src = readFileSync(resolve(__dirname, "../../app/b/[slug]/page.tsx"), "utf-8");
    expect(src).toContain("parseSeasonSlug");
    expect(src).not.toContain("getOrCreateActiveSeason()");
  });
});

describe("GET /api/tower does not mint a tech season", () => {
  it("reads existing seasons and computes burial per block", () => {
    const src = readFileSync(resolve(__dirname, "../../app/api/tower/route.ts"), "utf-8");
    expect(src).toContain("getAllActiveSeasons");
    expect(src).toContain("isBuried");
    expect(src).not.toContain("getOrCreateActiveSeason");
  });
});

describe("view counting is per paid stack", () => {
  it("credit-view requires a stack and never calls incrementSeasonViews()", () => {
    const src = readFileSync(
      resolve(__dirname, "../../app/api/internal/credit-view/route.ts"),
      "utf-8"
    );
    expect(src).toContain("parsePaidStackSlug");
    expect(src).toContain("incrementSeasonViews(category)");
    expect(src).not.toContain("incrementSeasonViews()");
    expect(src).toContain("getRankedBlocks(category)");
  });

  it("middleware credits /stack and /b, not the homepage or /play", () => {
    const src = readFileSync(resolve(__dirname, "../../middleware.ts"), "utf-8");
    expect(src).toContain("/stack/:path*");
    expect(src).toContain("/b/:path*");
    expect(src).toContain("parsePaidStackSlug");
    expect(src).not.toContain("/play");
  });
});

describe("webhook prices metres from the block's stack", () => {
  it("reads the block row and does not fall back to tech", () => {
    const src = readFileSync(
      resolve(__dirname, "../../app/api/webhook/stripe/route.ts"),
      "utf-8"
    );
    expect(src).toContain("getBlockById");
    expect(src).toContain("parseSeasonSlug");
    expect(src).not.toMatch(/:\s*"tech"/);
    expect(src).toContain("getRankedBlocks(category");
  });
});

describe("admin rollover is per stack", () => {
  it("requires a category in the body", () => {
    const src = readFileSync(
      resolve(__dirname, "../../app/api/admin/season-rollover/route.ts"),
      "utf-8"
    );
    expect(src).toContain("parseSeasonSlug");
    expect(src).toContain("INVALID_CATEGORY");
    expect(src).not.toContain("rolloverSeason()");
  });
});
