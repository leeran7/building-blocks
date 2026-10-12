/**
 * Platform sign-in accounts (Telegram, Discord) and the `.invalid` addresses
 * they carry. A self-registered Firebase account must never claim one of those
 * addresses first: users.email is unique, so it would block the real player's
 * sign-in for good (security review SEC-PORT-1).
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const h = vi.hoisted(() => ({
  upsert: vi.fn(async (args: { create: { id: string; email: string } }) => ({
    id: args.create.id,
    email: args.create.email,
    emailVerified: false,
    createdAt: new Date(),
  })),
  getUser: vi.fn(),
  createUser: vi.fn(async () => ({})),
  updateUser: vi.fn(async () => ({})),
  createCustomToken: vi.fn(async (uid: string) => `token-for-${uid}`),
  token: { uid: "abc123", email: "x@platform.invalid", email_verified: false } as Record<string, unknown>,
}));

vi.mock("../../src/db/client", () => ({ prisma: { user: { upsert: h.upsert } } }));
vi.mock("../../src/lib/firebaseAdmin", () => ({
  adminAuth: {
    getUser: h.getUser,
    createUser: h.createUser,
    updateUser: h.updateUser,
    createCustomToken: h.createCustomToken,
  },
  verifyIdToken: vi.fn(async () => h.token),
}));
vi.mock("../../src/lib/redis", () => ({
  getRedis: () => ({ incr: vi.fn(async () => 1), expire: vi.fn(async () => 1) }),
}));

import { ensureUser, ensurePlatformUser, ReservedEmailError } from "../../src/db/user";
import { signInPlatformUser } from "../../src/lib/platformAuth";
import { POST as syncPOST } from "../../app/api/auth/sync/route";

const PLATFORM_EMAIL = /^discord-123456789-[0-9a-f]{24}@platform\.invalid$/;

beforeEach(() => {
  vi.clearAllMocks();
});

describe("ensureUser", () => {
  it("refuses a self-registered account claiming a platform address", async () => {
    await expect(ensureUser({ id: "abc123", email: "discord-123456789@platform.invalid" })).rejects.toBeInstanceOf(
      ReservedEmailError,
    );
    await expect(ensureUser({ id: "abc123", email: "guest:x@GUEST.INVALID " })).rejects.toBeInstanceOf(ReservedEmailError);
    expect(h.upsert).not.toHaveBeenCalled();
  });

  it("refuses a look-alike uid that only the server could mint", async () => {
    await expect(ensureUser({ id: "discord:12a", email: "a@platform.invalid" })).rejects.toBeInstanceOf(ReservedEmailError);
    await expect(ensureUser({ id: "slack:1", email: "a@platform.invalid" })).rejects.toBeInstanceOf(ReservedEmailError);
  });

  it("keeps working for platform accounts and ordinary addresses", async () => {
    await ensureUser({ id: "discord:123456789", email: "discord-123456789-ab@platform.invalid" });
    await ensureUser({ id: "abc123", email: "player@example.com" });
    expect(h.upsert).toHaveBeenCalledTimes(2);
  });
});

describe("ensurePlatformUser", () => {
  it("only provisions server-minted platform uids", async () => {
    await expect(ensurePlatformUser("abc123", "a@platform.invalid")).rejects.toThrow();
    await ensurePlatformUser("telegram:42", "telegram-42-ff@platform.invalid");
    expect(h.upsert).toHaveBeenCalledOnce();
    expect(h.upsert.mock.calls[0][0].create.email).toBe("telegram-42-ff@platform.invalid");
  });
});

describe("signInPlatformUser", () => {
  it("creates the Firebase user with an unguessable platform address on first sign-in", async () => {
    h.getUser.mockRejectedValue({ code: "auth/user-not-found" });
    const a = await signInPlatformUser("discord", "123456789");
    expect(a).toEqual({ uid: "discord:123456789", customToken: "token-for-discord:123456789" });
    const created = (h.createUser.mock.calls[0] as unknown[])[0] as { uid: string; email: string };
    expect(created.uid).toBe("discord:123456789");
    expect(created.email).toMatch(PLATFORM_EMAIL);
    expect(h.upsert.mock.calls[0][0].create.email).toBe(created.email);

    await signInPlatformUser("discord", "123456789");
    const second = (h.createUser.mock.calls[1] as unknown[])[0] as { email: string };
    expect(second.email).not.toBe(created.email);
  });

  it("reuses the address an existing account already has", async () => {
    h.getUser.mockResolvedValue({ uid: "discord:123456789", email: "discord-123456789-aa@platform.invalid" });
    await signInPlatformUser("discord", "123456789");
    expect(h.createUser).not.toHaveBeenCalled();
    expect(h.updateUser).not.toHaveBeenCalled();
    expect(h.upsert.mock.calls[0][0].create.email).toBe("discord-123456789-aa@platform.invalid");
  });

  it("gives an existing account with no address a fresh one", async () => {
    h.getUser.mockResolvedValue({ uid: "telegram:42" });
    await signInPlatformUser("telegram", "42");
    const [uid, patch] = h.updateUser.mock.calls[0] as unknown as [string, { email: string }];
    expect(uid).toBe("telegram:42");
    expect(patch.email).toMatch(/^telegram-42-[0-9a-f]{24}@platform\.invalid$/);
  });

  it("does not swallow other Firebase errors", async () => {
    h.getUser.mockRejectedValue({ code: "auth/internal-error" });
    await expect(signInPlatformUser("telegram", "42")).rejects.toEqual({ code: "auth/internal-error" });
    expect(h.createUser).not.toHaveBeenCalled();
  });
});

describe("POST /api/auth/sync", () => {
  it("refuses a token whose email is a reserved address", async () => {
    h.token = { uid: "abc123", email: "discord-123456789@platform.invalid", email_verified: false };
    const res = await syncPOST(
      new NextRequest("http://localhost/api/auth/sync", { method: "POST", headers: { authorization: "Bearer t" } }),
    );
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe("RESERVED_EMAIL");
    expect(h.upsert).not.toHaveBeenCalled();
  });
});
