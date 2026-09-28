/**
 * PUT /api/settings avatar unlocks, through the real route, src/db/settings
 * and src/db/avatarUnlocks over an in-memory Prisma fake. Unlock state must
 * come from stored level stars and the saved avatar, never the request: a
 * locked id is refused with the requirement before ANY write (username,
 * social, row provisioning), the saved avatar stays re-savable, and the
 * threshold is inclusive.
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
const { ensureUser, setUsername } = vi.hoisted(() => ({
  ensureUser: vi.fn(async () => {}),
  setUsername: vi.fn(async () => ({ ok: true })),
}));
vi.mock("../../src/db/user", () => ({ ensureUser }));
vi.mock("../../src/db/creator", () => ({ setUsername, clearUsername: vi.fn(async () => {}) }));
const { revalidateTag } = vi.hoisted(() => ({ revalidateTag: vi.fn() }));
vi.mock("next/cache", () => ({ revalidateTag, unstable_cache: (fn: unknown) => fn }));

const { store, update, aggregate, upsertHandle } = vi.hoisted(() => {
  const store = {
    user: { display_name: null, username: null, leaderboard_consent_at: null, avatar_id: null as string | null },
    stars: 0,
  };
  return {
    store,
    update: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
      if ("avatar_id" in data) store.user.avatar_id = data.avatar_id as string | null;
      return store.user;
    }),
    aggregate: vi.fn(async () => ({ _sum: { stars: store.stars === 0 ? null : store.stars } })),
    upsertHandle: vi.fn(async () => ({})),
  };
});
vi.mock("../../src/db/client", () => ({
  prisma: {
    user: {
      findUnique: vi.fn(async ({ select }: { select: Record<string, boolean> }) =>
        Object.fromEntries(Object.entries(store.user).filter(([k]) => select[k]))
      ),
      update,
    },
    levelProgress: { aggregate },
    savedSocialHandle: {
      findMany: vi.fn(async () => []),
      upsert: upsertHandle,
      deleteMany: vi.fn(async () => ({ count: 0 })),
    },
    $transaction: vi.fn(async (ops: Promise<unknown>[]) => Promise.all(ops)),
  },
}));

import { GET, PUT } from "../../app/api/settings/route";
import { AVATARS } from "../../src/lib/avatars";
import { defaultAvatarFor } from "../../src/lib/handle";

const STARTER = defaultAvatarFor("u1");
/** A star-locked avatar that is not u1's starter. */
const LOCKED = AVATARS.find((a) => a.unlock.kind === "stars" && a.id !== STARTER)!;
const NEED = LOCKED.unlock.kind === "stars" ? LOCKED.unlock.stars : NaN;

function put(body: unknown): Promise<Response> {
  return PUT(
    new NextRequest("http://localhost/api/settings", {
      method: "PUT",
      headers: { "content-type": "application/json", authorization: "Bearer t" },
      body: JSON.stringify(body),
    })
  );
}

beforeEach(() => {
  store.user.avatar_id = null;
  store.stars = 0;
  vi.clearAllMocks();
});

describe("PUT /api/settings locked avatar", () => {
  it("refuses a locked id one star short with 403 and the requirement, saving nothing", async () => {
    store.stars = NEED - 1;
    const res = await put({ avatarId: LOCKED.id, username: "aria", social: { TIKTOK: "aria" } });
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({
      error: `Earn ${NEED} stars to unlock ${LOCKED.name}`,
      code: "AVATAR_LOCKED",
      requiredStars: NEED,
      stars: NEED - 1,
    });
    expect(update).not.toHaveBeenCalled();
    expect(setUsername).not.toHaveBeenCalled();
    expect(upsertHandle).not.toHaveBeenCalled();
    expect(ensureUser).not.toHaveBeenCalled();
    expect(revalidateTag).not.toHaveBeenCalled();
    expect(store.user.avatar_id).toBeNull();
  });

  it("ignores any unlock claim in the body", async () => {
    const res = await put({ avatarId: LOCKED.id, stars: 900, avatarUnlocks: { stars: 900, unlockedIds: [LOCKED.id] } });
    expect(res.status).toBe(403);
    expect(update).not.toHaveBeenCalled();
  });

  it("saves it at exactly the threshold", async () => {
    store.stars = NEED;
    // Same body as the refusal above, so its "saved nothing" checks can fail.
    const res = await put({ avatarId: LOCKED.id, username: "aria", social: { TIKTOK: "aria" } });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ avatarId: LOCKED.id });
    expect(store.user.avatar_id).toBe(LOCKED.id);
    expect(setUsername).toHaveBeenCalled();
    expect(upsertHandle).toHaveBeenCalled();
    expect(ensureUser).toHaveBeenCalled();
  });

  it("re-saves a grandfathered avatar that is locked by stars but already saved", async () => {
    store.user.avatar_id = LOCKED.id;
    const res = await put({ avatarId: LOCKED.id });
    expect(res.status).toBe(200);
    expect(update).toHaveBeenCalledWith({ where: { id: "u1" }, data: { avatar_id: LOCKED.id } });
  });

  it("still refuses a different locked avatar while a grandfathered one is saved", async () => {
    store.user.avatar_id = LOCKED.id;
    const other = AVATARS.find((a) => a.unlock.kind === "stars" && a.id !== STARTER && a.id !== LOCKED.id)!;
    const res = await put({ avatarId: other.id });
    expect(res.status).toBe(403);
    expect(store.user.avatar_id).toBe(LOCKED.id);
  });

  it("saves the account's starter animal with no stars", async () => {
    const res = await put({ avatarId: STARTER });
    expect(res.status).toBe(200);
    expect(store.user.avatar_id).toBe(STARTER);
  });

  it("saves a free avatar and clears to initials with no stars", async () => {
    expect((await put({ avatarId: "wraith" })).status).toBe(200);
    expect((await put({ avatarId: null })).status).toBe(200);
    expect(store.user.avatar_id).toBeNull();
  });

  it.each(["__proto__", "constructor", "not-an-avatar"])("rejects unknown id %j with 400 before any unlock read", async (id) => {
    const res = await put({ avatarId: id });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Unknown avatar", code: "UNKNOWN_AVATAR" });
    expect(aggregate).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });
});

describe("GET /api/settings avatarUnlocks", () => {
  it("returns the stored star count and the ids the player may select", async () => {
    store.stars = NEED;
    const res = await GET(
      new NextRequest("http://localhost/api/settings", { headers: { authorization: "Bearer t" } })
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { avatarUnlocks: { stars: number; unlockedIds: string[] } };
    expect(body.avatarUnlocks.stars).toBe(NEED);
    expect(body.avatarUnlocks.unlockedIds).toEqual(expect.arrayContaining(["wraith", LOCKED.id, STARTER]));
    const last = AVATARS.filter((a) => a.id !== STARTER).at(-1)!;
    expect(body.avatarUnlocks.unlockedIds).not.toContain(last.id);
  });
});
