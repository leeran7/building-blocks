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
  it("does not open a season", () => {
    const src = readFileSync(resolve(__dirname, "../../app/b/[slug]/page.tsx"), "utf-8");
    expect(src).toContain("parseSeasonSlug");
    // Was not.toContain("getOrCreateActiveSeason()") — the literal empty-paren
    // form, which no call site can produce since the function requires a
    // category. It passed while the page called getOrCreateActiveSeason(slug).
    expect(src).not.toContain("getOrCreateActiveSeason");
  });
});

describe("no public read path opens a season", () => {
  // getActiveSeason vs getOrCreateActiveSeason is covered behaviourally in
  // tests/db/seasons.test.ts. This pins which paths are allowed to use the
  // creating variant at all, since a read path reaching for it is the bug.
  const CREATE_ALLOWED = [
    "app/api/checkout/route.ts", // authenticated, opens the season being paid into
    "app/api/webhook/stripe/route.ts", // signature-verified, money already captured
  ];

  const READ_PATHS = [
    "app/b/[slug]/page.tsx",
    "app/api/tower/route.ts",
    "app/api/tower/[category]/route.ts",
    "app/api/internal/credit-view/route.ts",
    "app/stack/[category]/page.tsx",
  ];

  it.each(READ_PATHS)("%s does not call getOrCreateActiveSeason", (path) => {
    const src = readFileSync(resolve(__dirname, "../../", path), "utf-8");
    expect(src).not.toContain("getOrCreateActiveSeason");
  });

  it.each(CREATE_ALLOWED)("%s still opens a season deliberately", (path) => {
    const src = readFileSync(resolve(__dirname, "../../", path), "utf-8");
    expect(src).toContain("getOrCreateActiveSeason");
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
    expect(src).toContain("getRankedBlocks(category)");
    // The dropped assertion here was not.toContain("incrementSeasonViews()").
    // incrementSeasonViews(category: string) has a required parameter, so the
    // no-arg form is a compile error and the grep could never fire. tsc is the
    // real guard; what matters at this layer is that the category is threaded
    // through rather than defaulted, which the two assertions above cover.
  });

  it("middleware credits /stack and /b, not the homepage or /play", () => {
    const src = readFileSync(resolve(__dirname, "../../middleware.ts"), "utf-8");
    expect(src).toContain("/stack/:path*");
    expect(src).toContain("/b/:path*");
    expect(src).toContain("parsePaidStackSlug");
    expect(src).toContain("Next-Router-Prefetch");
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
    // An unparseable stack must still refuse to settle at V = 0. It used to
    // return 500, which Stripe retries — and since the condition is
    // deterministic in our own data, every retry failed identically until
    // Stripe gave up, losing a captured payment. Now dead-lettered.
    expect(src).toContain("unparseable stack");
    expect(src).toContain("deadLetter");
  });
});

describe("admin rollover is per stack", () => {
  it("requires a category in the body", () => {
    const src = readFileSync(
      resolve(__dirname, "../../app/api/admin/season-rollover/route.ts"),
      "utf-8"
    );
    expect(src).toContain("parsePaidStackSlug");
    expect(src).toContain("parseAdminRolloverSlug");
    expect(src).toContain("INVALID_CATEGORY");
    // not.toContain("rolloverSeason()") dropped for the same reason as the
    // credit-view case: rolloverSeason(category: string) makes the no-arg form
    // a compile error, so the assertion had no failing input.
    expect(src).toContain("rolloverSeason(");
  });
});
