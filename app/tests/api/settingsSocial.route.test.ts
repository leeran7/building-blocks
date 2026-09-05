/**
 * PUT /api/settings — the social-handle round-trip. Valid handles are
 * normalized and persisted; an invalid or unknown-platform entry is a 400 and
 * nothing is written.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("../../src/lib/rateLimit", () => ({
  checkRateLimit: vi.fn(async () => ({ allowed: true, degraded: false })),
  clientIp: vi.fn(() => "127.0.0.1"),
}));
vi.mock("../../src/lib/firebaseAdmin", () => ({
  verifyIdToken: vi.fn(async () => ({ uid: "u1", email: "u@e.com", email_verified: true })),
}));
vi.mock("../../src/db/user", () => ({ ensureUser: vi.fn(async () => {}) }));
vi.mock("../../src/db/creator", () => ({
  setUsername: vi.fn(async () => ({ ok: true })),
  clearUsername: vi.fn(async () => {}),
}));
vi.mock("../../src/db/settings", () => ({
  getUserSettings: vi.fn(async () => ({
    displayName: null,
    username: null,
    urls: [],
    social: {},
  })),
  updateUserSettings: vi.fn(async () => ({
    displayName: null,
    username: null,
    urls: [],
    social: {},
  })),
  updateUserSocialHandles: vi.fn(async () => {}),
}));

import { PUT } from "../../app/api/settings/route";
import { updateUserSocialHandles } from "../../src/db/settings";

function put(body: unknown): Promise<Response> {
  return PUT(
    new NextRequest("http://localhost/api/settings", {
      method: "PUT",
      headers: { "content-type": "application/json", authorization: "Bearer t" },
      body: JSON.stringify(body),
    })
  );
}

describe("PUT /api/settings — social handles", () => {
  beforeEach(() => vi.clearAllMocks());

  it("normalizes and persists a valid social map", async () => {
    const res = await put({ social: { TIKTOK: "@ElenaCooks", YOUTUBE: "elenavoss" } });
    expect(res.status).toBe(200);
    expect(updateUserSocialHandles).toHaveBeenCalledWith("u1", {
      TIKTOK: "ElenaCooks",
      YOUTUBE: "elenavoss",
    });
  });

  it("clears a platform mapped to an empty string", async () => {
    const res = await put({ social: { TIKTOK: "" } });
    expect(res.status).toBe(200);
    expect(updateUserSocialHandles).toHaveBeenCalledWith("u1", { TIKTOK: "" });
  });

  it("400s an invalid handle and writes nothing", async () => {
    const res = await put({ social: { X: "way too long a handle for x" } });
    expect(res.status).toBe(400);
    expect(updateUserSocialHandles).not.toHaveBeenCalled();
  });

  it("400s an unknown platform", async () => {
    const res = await put({ social: { MYSPACE: "tom" } });
    expect(res.status).toBe(400);
    expect(updateUserSocialHandles).not.toHaveBeenCalled();
  });
});
