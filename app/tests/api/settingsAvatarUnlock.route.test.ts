/**
 * PUT /api/settings avatar unlocks, through the real route, src/db/settings
 * and src/db/avatarUnlocks over an in-memory Prisma fake. Unlock state must
 * come from stored level stars, a stored level 1 row (the tutorial, for the
 * stick figures) and the saved avatar, never the request: a locked id is
 * refused with the requirement before ANY write (username, social, row
 * provisioning), the saved avatar stays re-savable, the threshold is
 * inclusive, and a premium character is refused at any star count.
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

const { store, update, aggregate, findFirst, upsertHandle } = vi.hoisted(() => {
  const store = {
    user: { display_name: null, username: null, leaderboard_consent_at: null, avatar_id: null as string | null },
    stars: 0,
    /** Whether u1 has a level 1 row (the tutorial cleared). */
    tutorialDone: false,
  };
  return {
    store,
    update: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
      if ("avatar_id" in data) store.user.avatar_id = data.avatar_id as string | null;
      return store.user;
    }),
    aggregate: vi.fn(async () => ({ _sum: { stars: store.stars === 0 ? null : store.stars } })),
    findFirst: vi.fn(async ({ where }: { where: { userId: string; level: number } }) =>
      store.tutorialDone && where.userId === "u1" && where.level === 1 ? { id: 1 } : null
    ),
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
    levelProgress: { aggregate, findFirst },
    savedSocialHandle: {
      findMany: vi.fn(async () => []),
      upsert: upsertHandle,
      deleteMany: vi.fn(async () => ({ count: 0 })),
    },
    $transaction: vi.fn(async (ops: Promise<unknown>[]) => Promise.all(ops)),
  },
}));

import { GET, PUT } from "../../app/api/settings/route";
import { AVATARS, avatarEntry } from "../../src/lib/avatars";

/** A star-locked avatar and its threshold. */
const LOCKED = avatarEntry("lynx")!;
const NEED = 30;
const STICK_IDS = AVATARS.filter((a) => a.unlock.kind === "tutorial").map((a) => a.id);

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
  store.tutorialDone = false;
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
      kind: "stars",
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
    // One star sum per request: the route's verdict is reused for the write
    // and for the avatarUnlocks in the response.
    expect(aggregate).toHaveBeenCalledTimes(1);
  });

  it("re-saves a grandfathered avatar that is locked by stars but already saved", async () => {
    store.user.avatar_id = LOCKED.id;
    const res = await put({ avatarId: LOCKED.id });
    expect(res.status).toBe(200);
    expect(update).toHaveBeenCalledWith({ where: { id: "u1" }, data: { avatar_id: LOCKED.id } });
  });

  it("still refuses a different locked avatar while a grandfathered one is saved", async () => {
    store.user.avatar_id = LOCKED.id;
    const other = avatarEntry("raven")!;
    const res = await put({ avatarId: other.id });
    expect(res.status).toBe(403);
    expect(store.user.avatar_id).toBe(LOCKED.id);
  });

  it.each(["wraith", "gecko"])("refuses the premium %s at any star count, saving nothing", async (id) => {
    store.stars = 100_000;
    store.tutorialDone = true;
    const res = await put({ avatarId: id, username: "aria" });
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({
      error: `${avatarEntry(id)!.name} is a premium character. It is not on sale yet`,
      code: "AVATAR_LOCKED",
      kind: "premium",
      requiredStars: null,
      stars: 100_000,
    });
    expect(update).not.toHaveBeenCalled();
    expect(setUsername).not.toHaveBeenCalled();
    expect(ensureUser).not.toHaveBeenCalled();
  });

  it("re-saves a premium character that is already saved (grandfathered)", async () => {
    store.user.avatar_id = "wraith";
    const res = await put({ avatarId: "wraith" });
    expect(res.status).toBe(200);
    expect(update).toHaveBeenCalledWith({ where: { id: "u1" }, data: { avatar_id: "wraith" } });
  });

  it("refuses a stick figure before the tutorial, then saves it once level 1 is cleared", async () => {
    store.stars = 900;
    const refused = await put({ avatarId: "stick-green" });
    expect(refused.status).toBe(403);
    expect(await refused.json()).toEqual({
      error: "Finish the tutorial on level 1 to unlock Green Stick",
      code: "AVATAR_LOCKED",
      kind: "tutorial",
      requiredStars: null,
      stars: 900,
    });
    expect(update).not.toHaveBeenCalled();

    store.tutorialDone = true;
    const saved = await put({ avatarId: "stick-green" });
    expect(saved.status).toBe(200);
    expect(store.user.avatar_id).toBe("stick-green");
  });

  it("ignores a tutorial claim in the body", async () => {
    const res = await put({ avatarId: "stick-sky", tutorialDone: true, avatarUnlocks: { tutorialDone: true } });
    expect(res.status).toBe(403);
    expect(update).not.toHaveBeenCalled();
  });

  it("clears to initials with no stars", async () => {
    store.user.avatar_id = "wraith";
    expect((await put({ avatarId: null })).status).toBe(200);
    expect(store.user.avatar_id).toBeNull();
    expect(aggregate).toHaveBeenCalledTimes(1); // the response's unlock state only
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
    store.tutorialDone = true;
    const res = await GET(
      new NextRequest("http://localhost/api/settings", { headers: { authorization: "Bearer t" } })
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      avatarUnlocks: { stars: number; tutorialDone: boolean; unlockedIds: string[] };
    };
    expect(body.avatarUnlocks.stars).toBe(NEED);
    expect(body.avatarUnlocks.tutorialDone).toBe(true);
    expect(body.avatarUnlocks.unlockedIds).toEqual([...STICK_IDS, "kestrel", LOCKED.id]);
  });

  it("returns nothing selectable for a new account before the tutorial", async () => {
    const res = await GET(
      new NextRequest("http://localhost/api/settings", { headers: { authorization: "Bearer t" } })
    );
    const body = (await res.json()) as { avatarUnlocks: { tutorialDone: boolean; unlockedIds: string[] } };
    expect(body.avatarUnlocks.tutorialDone).toBe(false);
    expect(body.avatarUnlocks.unlockedIds).toEqual([]);
  });
});
