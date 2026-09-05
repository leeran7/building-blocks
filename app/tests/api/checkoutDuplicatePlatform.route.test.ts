/**
 * "One entry per stack, per user, per platform": a creator may list all their
 * platforms in a stack, but a second checkout for a platform they already have
 * a visible entry for must be rejected (409) — and must NOT create a duplicate
 * block or reach Stripe.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("../../src/lib/rateLimit", () => ({
  checkRateLimit: vi.fn(async () => ({ allowed: true, degraded: false })),
  clientIp: vi.fn(() => "127.0.0.1"),
}));

vi.mock("../../src/lib/firebaseAdmin", () => ({
  verifyIdToken: vi.fn(async () => ({
    uid: "user-1",
    email: "creator@example.com",
    email_verified: true,
  })),
}));

vi.mock("../../src/db/seasons", () => ({
  getOrCreateActiveSeason: vi.fn(async () => ({
    id: "season-1",
    is_active: true,
    views_k: 0,
  })),
}));

vi.mock("../../src/db/user", () => ({ ensureUser: vi.fn(async () => {}) }));
vi.mock("../../src/db/settings", () => ({ addSavedUrl: vi.fn(async () => {}) }));

vi.mock("../../src/db/blocks", () => ({
  createBlock: vi.fn(async () => ({ id: "new", slug: "new" })),
  getBlockById: vi.fn(),
  findUserSeasonPlatformBlock: vi.fn(),
  retargetSocialBlock: vi.fn(async () => ({ id: "reused", slug: "creator-abcd" })),
}));

const createSession = vi.fn(async () => ({ url: "https://stripe.test/session" }));
vi.mock("../../src/api/stripe", () => ({
  getStripe: () => ({ checkout: { sessions: { create: createSession } } }),
}));

vi.mock("../../src/config/public", () => ({
  resolveBaseUrl: () => "https://app.test",
  PUBLIC_CONFIG: { pollIntervalMs: 10000 },
}));

// Use a real, valid paid-stack slug so category parsing passes.
vi.mock("../../src/game/categories", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../src/game/categories")>();
  return { ...actual, parsePaidStackSlug: () => "ai-ml-tools" };
});

import { POST } from "../../app/api/checkout/route";
import {
  createBlock,
  findUserSeasonPlatformBlock,
  retargetSocialBlock,
} from "../../src/db/blocks";

function post(body: unknown): Promise<Response> {
  return POST(
    new NextRequest("http://localhost/api/checkout", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: "Bearer test-token",
      },
      body: JSON.stringify(body),
    })
  );
}

const socialListing = {
  type: "new",
  platform: "TIKTOK",
  handle: "creator",
  display_name: "Creator",
  owner_email: "creator@example.com",
  category: "ai-ml-tools",
  amount_usd: 5,
};

describe("checkout — one entry per (stack, user, platform)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("409s a PAID (visible) duplicate and never creates a block or Stripe session", async () => {
    (findUserSeasonPlatformBlock as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "existing",
      slug: "creator-abcd",
      hidden_at: null, // visible = already paid
    });
    const res = await post(socialListing);
    expect(res.status).toBe(409);
    const json = await res.json();
    expect(json.code).toBe("DUPLICATE_PLATFORM_ENTRY");
    expect(json.block_slug).toBe("creator-abcd");
    expect(createBlock).not.toHaveBeenCalled();
    expect(createSession).not.toHaveBeenCalled();
  });

  it("reuses an UNPAID (hidden) entry instead of creating a duplicate", async () => {
    (findUserSeasonPlatformBlock as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "existing",
      slug: "creator-abcd",
      hidden_at: new Date(), // hidden = unpaid, from an earlier/abandoned checkout
    });
    const res = await post(socialListing);
    expect(res.status).toBe(200);
    expect(retargetSocialBlock).toHaveBeenCalledOnce();
    expect(createBlock).not.toHaveBeenCalled();
    expect(createSession).toHaveBeenCalledOnce();
  });

  it("allows a platform the user does not yet have an entry for", async () => {
    (findUserSeasonPlatformBlock as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const res = await post(socialListing);
    expect(res.status).toBe(200);
    expect(createBlock).toHaveBeenCalledOnce();
    expect(createSession).toHaveBeenCalledOnce();
  });
});
