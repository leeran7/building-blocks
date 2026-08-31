/**
 * AC-32, AC-34 — record page (`/b/[slug]`) metadata helper.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Block } from "@prisma/client";

vi.mock("../../src/db/blocks", () => ({
  getBlockBySlug: vi.fn(),
}));

import { getRecordPageMetadata } from "../../src/seo/recordMetadata";
import { getBlockBySlug } from "../../src/db/blocks";
import { buildRecordCanonicalUrl } from "../../src/share/urls";
import { HOMEPAGE_OG_TITLE, PROD_ORIGIN, twitterCard } from "../share/fixtures";

function fakeBlock(overrides: Partial<Block> = {}): Block {
  return {
    id: "blk_1",
    slug: "alpha-stack",
    url: "https://example.com",
    display_name: "Alpha Stack",
    owner_email: "owner@example.com",
    altitude: 42,
    spend_c: 0,
    views_served: 10,
    clicks: 0,
    peak_rank: 3,
    hidden_at: null,
    created_at: new Date("2026-01-01T00:00:00.000Z"),
    season_id: "season_1",
    category: "tech",
    userId: null,
    ...overrides,
  };
}

describe("getRecordPageMetadata (AC-32, AC-34)", () => {
  beforeEach(() => {
    vi.mocked(getBlockBySlug).mockReset();
  });

  it("sets OG/Twitter unique to the listing (AC-32)", async () => {
    vi.mocked(getBlockBySlug).mockResolvedValue(fakeBlock());
    const result = await getRecordPageMetadata("alpha-stack", PROD_ORIGIN);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected metadata");
    const { metadata } = result;
    expect(metadata.openGraph?.title).toBeDefined();
    expect(String(metadata.openGraph?.description)).toContain("Alpha Stack");
    expect(String(metadata.openGraph?.url)).toBe(
      buildRecordCanonicalUrl(PROD_ORIGIN, "alpha-stack")
    );
    expect(String(metadata.openGraph?.url)).toBe(
      "https://www.doomstack.lol/b/alpha-stack"
    );
    const images = metadata.openGraph?.images;
    const first = Array.isArray(images) ? images[0] : images;
    expect(first).toMatchObject({ width: 1200, height: 630 });
    expect(twitterCard(metadata.twitter)).toBe("summary_large_image");
    expect(String(metadata.openGraph?.title)).not.toBe(HOMEPAGE_OG_TITLE);
  });

  it("returns NOT_FOUND for an unknown slug (AC-34)", async () => {
    vi.mocked(getBlockBySlug).mockResolvedValue(null);
    const result = await getRecordPageMetadata("no-such-stack", PROD_ORIGIN);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected NOT_FOUND");
    expect(result.reason).toBe("NOT_FOUND");
    expect(JSON.stringify(result)).not.toContain(HOMEPAGE_OG_TITLE);
  });

  it("returns NOT_FOUND for a parser-rejected slug without substituting homepage", async () => {
    const result = await getRecordPageMetadata("..", PROD_ORIGIN);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("NOT_FOUND");
    expect(getBlockBySlug).not.toHaveBeenCalled();
  });
});
