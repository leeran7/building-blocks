/**
 * GET /go/[slug] is the tracked outbound redirect — the path that makes a
 * listing's *clicks* measurable. It must: count real human clicks, skip bots,
 * 404 unknown slugs, and only ever redirect to the block's own stored url
 * (never a caller-supplied param → no open redirect).
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("../../src/db/blocks", () => ({
  getBlockBySlug: vi.fn(),
  incrementClicks: vi.fn(async () => {}),
}));

import { GET } from "../../app/go/[slug]/route";
import { getBlockBySlug, incrementClicks } from "../../src/db/blocks";

const HUMAN_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125 Safari/537.36";

function req(ua: string | null): NextRequest {
  return new NextRequest("http://localhost/go/acme", {
    headers: ua ? { "user-agent": ua } : {},
  });
}

const params = (slug: string) => Promise.resolve({ slug });

describe("GET /go/[slug]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("redirects (302) to the block's stored url and counts a human click", async () => {
    (getBlockBySlug as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "b1",
      url: "https://www.tiktok.com/@creator",
      hidden_at: null,
    });
    const res = await GET(req(HUMAN_UA), { params: params("acme") });
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("https://www.tiktok.com/@creator");
    expect(incrementClicks).toHaveBeenCalledWith("b1");
  });

  it("does NOT count a bot click, but still redirects", async () => {
    (getBlockBySlug as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "b1",
      url: "https://example.com",
      hidden_at: null,
    });
    const res = await GET(req("Googlebot/2.1"), { params: params("acme") });
    expect(res.status).toBe(302);
    expect(incrementClicks).not.toHaveBeenCalled();
  });

  it("404s an unknown slug and never redirects", async () => {
    (getBlockBySlug as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const res = await GET(req(HUMAN_UA), { params: params("nope") });
    expect(res.status).toBe(404);
    expect(incrementClicks).not.toHaveBeenCalled();
  });

  it("404s a hidden/unpaid block — never forwards to it (abuse-remediation)", async () => {
    (getBlockBySlug as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "b1",
      url: "https://scam.example",
      hidden_at: new Date(),
    });
    const res = await GET(req(HUMAN_UA), { params: params("hidden") });
    expect(res.status).toBe(404);
    expect(incrementClicks).not.toHaveBeenCalled();
  });
});
