/**
 * POST /api/auth/sync — web users are auto-consented onto the public
 * leaderboard; iOS (and any unmarked client) is not.
 *
 * The consent gate is an App Store requirement the web doesn't share, so the
 * browser app marks its sync call with the web-client header and the server
 * grants consent for it. This proves the grant fires only for the marked
 * request — so an iOS build (which never sends the header) keeps its
 * modal-driven consent, the safe default. Both cases still provision the user.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const { ensureUser, grantWebLeaderboardConsent } = vi.hoisted(() => ({
  ensureUser: vi.fn(async () => ({
    id: "u1",
    email: "u@e.com",
    emailVerified: true,
    createdAt: new Date(),
  })),
  grantWebLeaderboardConsent: vi.fn(async () => {}),
}));

vi.mock("../../src/db/user", () => ({ ensureUser, grantWebLeaderboardConsent }));
vi.mock("../../src/lib/firebaseAdmin", () => ({
  verifyIdToken: vi.fn(async () => ({ uid: "u1", email: "u@e.com", email_verified: true })),
}));
// requireAuth wraps verifyIdToken; keep the real module so it exercises the
// same decode path the route depends on. Redis rate-limit is the only external
// dependency to stub — allow every request.
vi.mock("../../src/lib/redis", () => ({
  getRedis: () => ({
    incr: vi.fn(async () => 1),
    expire: vi.fn(async () => 1),
  }),
}));

import { POST } from "../../app/api/auth/sync/route";
import { WEB_CLIENT_HEADER, WEB_CLIENT_VALUE } from "../../src/lib/webClient";

function post(headers: Record<string, string>): Promise<Response> {
  return POST(
    new NextRequest("http://localhost/api/auth/sync", {
      method: "POST",
      headers: { authorization: "Bearer t", ...headers },
    })
  );
}

describe("POST /api/auth/sync leaderboard consent", () => {
  beforeEach(() => {
    ensureUser.mockClear();
    grantWebLeaderboardConsent.mockClear();
  });

  it("grants leaderboard consent for a web-marked sign-in", async () => {
    const res = await post({ [WEB_CLIENT_HEADER]: WEB_CLIENT_VALUE });
    expect(res.status).toBe(200);
    expect(ensureUser).toHaveBeenCalledOnce();
    expect(grantWebLeaderboardConsent).toHaveBeenCalledWith("u1");
  });

  it("does not grant consent for an unmarked (iOS) sign-in", async () => {
    const res = await post({});
    expect(res.status).toBe(200);
    expect(ensureUser).toHaveBeenCalledOnce();
    expect(grantWebLeaderboardConsent).not.toHaveBeenCalled();
  });

  it("does not grant consent when the marker value is wrong", async () => {
    const res = await post({ [WEB_CLIENT_HEADER]: "ios" });
    expect(res.status).toBe(200);
    expect(grantWebLeaderboardConsent).not.toHaveBeenCalled();
  });
});
