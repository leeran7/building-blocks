/**
 * AC-20/21/23 recording + listing OG HTTP handlers.
 * ImageResponse is stubbed here so HTTP 404 vs 200 can run without Satori.
 * Live PNG render lives in satoriRender.test.tsx (unmocked ImageResponse).
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@vercel/og", () => ({
  ImageResponse: class MockImageResponse {
    headers: Headers;
    constructor(
      _el: unknown,
      options: { width: number; height: number }
    ) {
      this.headers = new Headers({
        "content-type": "image/png",
        "x-og-width": String(options.width),
        "x-og-height": String(options.height),
      });
    }
    async arrayBuffer(): Promise<ArrayBuffer> {
      return new ArrayBuffer(8);
    }
  },
}));

vi.mock("../../src/db/climb", () => ({
  getShareableClimbRun: vi.fn(),
}));

vi.mock("../../src/db/blocks", () => ({
  getBlockBySlug: vi.fn(),
}));

import { GET as listingOgGet } from "../../app/api/og/route";
import { GET as recordingOgGet } from "../../app/api/og/recording/[id]/route";
import { GET as recordingSquareOgGet } from "../../app/api/og/recording/[id]/square/route";
import { GET as recordOgGet } from "../../app/api/og/b/[slug]/route";
import { getShareableClimbRun } from "../../src/db/climb";
import { getBlockBySlug } from "../../src/db/blocks";
import { recordingOgImageOptions } from "../../src/og/sizes";
import type { Block } from "@prisma/client";

describe("listing GET /api/og (AC-23)", () => {
  it("returns 200 (never 500) for junk HTML query params", async () => {
    const chunk = "<script>alert(1)</script>";
    const name = chunk.repeat(Math.ceil(501 / chunk.length));
    const url = new URL("http://localhost/api/og");
    url.searchParams.set("name", name);
    url.searchParams.set("alt", "not-a-number");
    url.searchParams.set("rank", "<img>");
    const res = await listingOgGet(new NextRequest(url));
    expect(res.status).not.toBe(500);
    expect([200, 400]).toContain(res.status);
  });
});

describe("recording OG handlers (AC-20, AC-21, AC-23)", () => {
  beforeEach(() => {
    vi.mocked(getShareableClimbRun).mockReset();
  });

  it("returns 404 JSON for an unknown id, not a 200 listing card", async () => {
    vi.mocked(getShareableClimbRun).mockResolvedValue(null);
    const res = await recordingOgGet(
      new Request("http://localhost/api/og/recording/rec_missing"),
      { params: Promise.resolve({ id: "rec_missing" }) }
    );
    expect(res.status).toBe(404);
    const body = (await res.json()) as { code?: string };
    expect(body.code).toBe("NOT_FOUND");
  });

  it("returns 404 for an invalid id (AC-7 recording OG half)", async () => {
    vi.mocked(getShareableClimbRun).mockResolvedValue(null);
    const res = await recordingOgGet(
      new Request("http://localhost/api/og/recording/.."),
      { params: Promise.resolve({ id: ".." }) }
    );
    expect(res.status).toBe(404);
  });

  it("returns 200 landscape sized from recordingOgImageOptions for a valid id", async () => {
    vi.mocked(getShareableClimbRun).mockResolvedValue({
      id: "rec_test_1",
      peakY: 100,
      handle: "Maya",
    });
    const expected = recordingOgImageOptions("landscape");
    const res = await recordingOgGet(
      new Request("http://localhost/api/og/recording/rec_test_1"),
      { params: Promise.resolve({ id: "rec_test_1" }) }
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("x-og-width")).toBe(String(expected.width));
    expect(res.headers.get("x-og-height")).toBe(String(expected.height));
  });

  it("returns 200 square 1080×1080 for the square route (AC-21)", async () => {
    vi.mocked(getShareableClimbRun).mockResolvedValue({
      id: "rec_test_1",
      peakY: 100,
      handle: "Maya",
    });
    const expected = recordingOgImageOptions("square");
    const res = await recordingSquareOgGet(
      new Request("http://localhost/api/og/recording/rec_test_1/square"),
      { params: Promise.resolve({ id: "rec_test_1" }) }
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("x-og-width")).toBe(String(expected.width));
    expect(res.headers.get("x-og-height")).toBe(String(expected.height));
    expect(expected).toEqual({ width: 1080, height: 1080 });
  });
});

describe("record OG GET /api/og/b/[slug] (AC-33, AC-34 image half)", () => {
  beforeEach(() => {
    vi.mocked(getBlockBySlug).mockReset();
  });

  it("returns 404 for an unknown slug", async () => {
    vi.mocked(getBlockBySlug).mockResolvedValue(null);
    const res = await recordOgGet(
      new Request("http://localhost/api/og/b/no-such-stack"),
      { params: Promise.resolve({ slug: "no-such-stack" }) }
    );
    expect(res.status).toBe(404);
    const body = (await res.json()) as { code?: string };
    expect(body.code).toBe("NOT_FOUND");
  });

  it("returns 200 1200×630 for an existing slug", async () => {
    const block: Block = {
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
    };
    vi.mocked(getBlockBySlug).mockResolvedValue(block);
    const res = await recordOgGet(
      new Request("http://localhost/api/og/b/alpha-stack"),
      { params: Promise.resolve({ slug: "alpha-stack" }) }
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("x-og-width")).toBe("1200");
    expect(res.headers.get("x-og-height")).toBe("630");
  });
});
