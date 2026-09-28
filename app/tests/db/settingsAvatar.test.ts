/**
 * src/db/settings avatar handling: reads pass the stored id through the
 * catalogue allow-list (a retired id reads as null, never as a broken image
 * id), and the write path refuses a non-catalogue id even if a future caller
 * skips the route's validation.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const { user, findUnique, update, progress, aggregate } = vi.hoisted(() => {
  const user = { display_name: null, username: null, leaderboard_consent_at: null, avatar_id: null as string | null };
  const progress = { stars: 0 };
  return {
    user,
    progress,
    aggregate: vi.fn(async () => ({ _sum: { stars: progress.stars === 0 ? null : progress.stars } })),
    findUnique: vi.fn(async ({ select }: { select: Record<string, boolean> }) =>
      Object.fromEntries(Object.entries(user).filter(([k]) => select[k]))
    ),
    update: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
      if ("avatar_id" in data) user.avatar_id = data.avatar_id as string | null;
      return user;
    }),
  };
});

vi.mock("../../src/db/client", () => ({
  prisma: {
    user: { findUnique, update },
    savedSocialHandle: { findMany: vi.fn(async () => []) },
    levelProgress: { aggregate },
  },
}));

import { getUserSettings, updateUserSettings } from "../../src/db/settings";
import { AvatarLockedError, checkAvatarForUser } from "../../src/db/avatarUnlocks";
import { AVATARS } from "../../src/lib/avatars";
import { defaultAvatarFor } from "../../src/lib/handle";

/** A star-locked avatar that is not u1's starter, and its threshold. */
const LOCKED = AVATARS.find((a) => a.unlock.kind === "stars" && a.id !== defaultAvatarFor("u1"))!;
const LOCKED_STARS = LOCKED.unlock.kind === "stars" ? LOCKED.unlock.stars : NaN;

beforeEach(() => {
  user.avatar_id = null;
  progress.stars = 0;
  vi.clearAllMocks();
});

describe("getUserSettings avatarId", () => {
  it("returns a stored catalogue id", async () => {
    user.avatar_id = AVATARS[1].id;
    expect((await getUserSettings("u1")).avatarId).toBe(AVATARS[1].id);
  });

  it("reads a retired or unknown stored id as null", async () => {
    user.avatar_id = "retired-avatar";
    expect((await getUserSettings("u1")).avatarId).toBeNull();
  });
});

describe("updateUserSettings avatarId", () => {
  it("writes a catalogue id and clears on null", async () => {
    expect((await updateUserSettings("u1", { avatarId: AVATARS[0].id })).avatarId).toBe(AVATARS[0].id);
    expect(update).toHaveBeenLastCalledWith({ where: { id: "u1" }, data: { avatar_id: AVATARS[0].id } });
    expect((await updateUserSettings("u1", { avatarId: null })).avatarId).toBeNull();
    expect(update).toHaveBeenLastCalledWith({ where: { id: "u1" }, data: { avatar_id: null } });
  });

  it("throws on a non-catalogue id without writing", async () => {
    await expect(updateUserSettings("u1", { avatarId: "toString" })).rejects.toThrow(/catalogue/);
    expect(update).not.toHaveBeenCalled();
  });

  it("leaves the avatar alone when avatarId is absent", async () => {
    user.avatar_id = AVATARS[0].id;
    await updateUserSettings("u1", { leaderboardConsent: false });
    expect(update).toHaveBeenCalledWith({ where: { id: "u1" }, data: { leaderboard_consent_at: null } });
    expect(user.avatar_id).toBe(AVATARS[0].id);
  });
});

describe("updateUserSettings avatar unlocks (backstop behind the route)", () => {
  it("refuses a star-locked avatar one star short, without writing", async () => {
    progress.stars = LOCKED_STARS - 1;
    const err = await updateUserSettings("u1", { avatarId: LOCKED.id }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(AvatarLockedError);
    expect((err as AvatarLockedError).lock).toMatchObject({
      avatarId: LOCKED.id,
      requiredStars: LOCKED_STARS,
      stars: LOCKED_STARS - 1,
      message: `Earn ${LOCKED_STARS} stars to unlock ${LOCKED.name}`,
    });
    expect(update).not.toHaveBeenCalled();
    expect(user.avatar_id).toBeNull();
  });

  it("saves it at exactly the threshold", async () => {
    progress.stars = LOCKED_STARS;
    expect((await updateUserSettings("u1", { avatarId: LOCKED.id })).avatarId).toBe(LOCKED.id);
  });

  it("re-saves a grandfathered locked avatar that is already the saved one", async () => {
    user.avatar_id = LOCKED.id;
    expect((await updateUserSettings("u1", { avatarId: LOCKED.id })).avatarId).toBe(LOCKED.id);
    expect(update).toHaveBeenCalledWith({ where: { id: "u1" }, data: { avatar_id: LOCKED.id } });
  });

  it("saves the player's starter animal with no stars", async () => {
    const starter = defaultAvatarFor("u1");
    expect((await updateUserSettings("u1", { avatarId: starter })).avatarId).toBe(starter);
  });

  it("ignores a forged verdict and checks for itself", async () => {
    progress.stars = 0;
    const forged = { userId: "u1", avatarId: LOCKED.id, lock: null, stars: 900 };
    const err = await updateUserSettings("u1", { avatarId: LOCKED.id }, forged).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(AvatarLockedError);
    expect(update).not.toHaveBeenCalled();
  });

  it("reuses a genuine verdict for this user and id without counting stars again", async () => {
    progress.stars = LOCKED_STARS;
    const check = await checkAvatarForUser("u1", LOCKED.id);
    expect(check.lock).toBeNull();
    aggregate.mockClear();
    expect((await updateUserSettings("u1", { avatarId: LOCKED.id }, check)).avatarUnlocks.stars).toBe(LOCKED_STARS);
    expect(aggregate).not.toHaveBeenCalled();
  });

  it("does not reuse a genuine verdict issued for a different avatar", async () => {
    const freeCheck = await checkAvatarForUser("u1", "wraith");
    const err = await updateUserSettings("u1", { avatarId: LOCKED.id }, freeCheck).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(AvatarLockedError);
    expect(update).not.toHaveBeenCalled();
  });

  it("saves a free avatar with no stars", async () => {
    expect((await updateUserSettings("u1", { avatarId: "wraith" })).avatarId).toBe("wraith");
  });
});

describe("getUserSettings avatarUnlocks", () => {
  it("lists free avatars, the starter, the saved avatar, and star unlocks at the threshold", async () => {
    const starter = defaultAvatarFor("u1");
    // Saved (grandfathered) and still locked by stars: neither ibex nor the starter.
    const saved = AVATARS.find((a) => a.unlock.kind === "stars" && a.unlock.stars > 15 && a.id !== starter)!;
    const stillLocked = AVATARS.filter(
      (a) => a.unlock.kind === "stars" && a.unlock.stars > 15 && a.id !== starter && a.id !== saved.id
    );
    user.avatar_id = saved.id;
    progress.stars = 15; // exactly Ibex's threshold

    const { avatarUnlocks } = await getUserSettings("u1");
    expect(avatarUnlocks.stars).toBe(15);
    expect(avatarUnlocks.unlockedIds).toEqual(
      expect.arrayContaining(["wraith", "viking", "sentinel", "ibex", starter, saved.id])
    );
    expect(stillLocked.length).toBeGreaterThan(0);
    for (const a of stillLocked) expect(avatarUnlocks.unlockedIds).not.toContain(a.id);
  });
});
