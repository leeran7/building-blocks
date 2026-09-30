/**
 * src/db/settings avatar handling: reads pass the stored id through the
 * catalogue allow-list (a retired id reads as null, never as a broken image
 * id), and the write path refuses a non-catalogue id even if a future caller
 * skips the route's validation. Unlocks come from stored rows only: level
 * stars, a level 1 row (the tutorial, for the stick figures), a level 300 row
 * (the season, for the Gecko) and the saved
 * avatar. Premium characters are never unlockable, only kept while saved.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

type ProgressRow = { id: number; userId: string; level: number };

const { user, findUnique, update, progress, aggregate, findFirst } = vi.hoisted(() => {
  const user = { display_name: null, username: null, leaderboard_consent_at: null, avatar_id: null as string | null };
  const progress = { stars: 0, rows: [] as ProgressRow[] };
  return {
    user,
    progress,
    aggregate: vi.fn(async () => ({ _sum: { stars: progress.stars === 0 ? null : progress.stars } })),
    /** Applies the where clause, so a query on the wrong level or user finds nothing. */
    findFirst: vi.fn(async ({ where }: { where: { userId: string; level: number } }) => {
      const row = progress.rows.find((r) => r.userId === where.userId && r.level === where.level);
      return row ? { id: row.id } : null;
    }),
    findUnique: vi.fn(async ({ select }: { select: Record<string, boolean> }) =>
      Object.fromEntries(Object.entries(user).filter(([k]) => select[k]))
    ),
    update: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
      if ("avatar_id" in data) user.avatar_id = data.avatar_id as string | null;
      return user;
    }),
  };
});

const { ownedFindMany } = vi.hoisted(() => ({ ownedFindMany: vi.fn(async () => [] as { avatar_id: string }[]) }));

vi.mock("../../src/db/client", () => ({
  prisma: {
    user: { findUnique, update },
    savedSocialHandle: { findMany: vi.fn(async () => []) },
    levelProgress: { aggregate, findFirst },
    ownedCharacter: { findMany: ownedFindMany },
  },
}));

import { getUserSettings, updateUserSettings } from "../../src/db/settings";
import { AvatarLockedError, checkAvatarForUser, seasonCleared, tutorialCleared } from "../../src/db/avatarUnlocks";
import { AVATARS, avatarEntry } from "../../src/lib/avatars";

/** A star-locked avatar and its threshold. */
const LOCKED = avatarEntry("lynx")!;
const LOCKED_STARS = 30;
const STICK_IDS = AVATARS.filter((a) => a.unlock.kind === "tutorial").map((a) => a.id);

/** u1 has cleared level 1 (the tutorial). */
function finishTutorial(userId = "u1"): void {
  progress.rows.push({ id: progress.rows.length + 1, userId, level: 1 });
}

beforeEach(() => {
  user.avatar_id = null;
  progress.stars = 0;
  progress.rows.length = 0;
  vi.clearAllMocks();
});

describe("tutorialCleared", () => {
  it("is true once the player has a level 1 row, and asks for exactly that row", async () => {
    finishTutorial("u1");
    expect(await tutorialCleared("u1")).toBe(true);
    expect(findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { userId: "u1", level: 1 } }));
  });

  it("is false with no rows, only other levels, or only another player's level 1", async () => {
    expect(await tutorialCleared("u1")).toBe(false);
    progress.rows.push({ id: 1, userId: "u1", level: 2 }, { id: 2, userId: "u2", level: 1 });
    expect(await tutorialCleared("u1")).toBe(false);
    expect(await tutorialCleared("u2")).toBe(true);
  });

  it("reads through the db it is given (a transaction)", async () => {
    const txFindFirst = vi.fn(async () => ({ id: 9 }));
    const tx = { levelProgress: { findFirst: txFindFirst } } as unknown as Parameters<typeof tutorialCleared>[1];
    expect(await tutorialCleared("u1", tx)).toBe(true);
    expect(txFindFirst).toHaveBeenCalledTimes(1);
    expect(findFirst).not.toHaveBeenCalled();
  });
});

/** u1 has cleared a season's last level. */
function finishSeason(userId = "u1"): void {
  progress.rows.push({ id: progress.rows.length + 1, userId, level: 300 });
}

describe("seasonCleared", () => {
  it("is true once the player has a level 300 row, and asks for exactly that row", async () => {
    finishSeason("u1");
    expect(await seasonCleared("u1")).toBe(true);
    expect(findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { userId: "u1", level: 300 } }));
  });

  it("is false with only level 299, only level 1, or only another player's level 300", async () => {
    expect(await seasonCleared("u1")).toBe(false);
    progress.rows.push({ id: 1, userId: "u1", level: 299 }, { id: 2, userId: "u1", level: 1 }, { id: 3, userId: "u2", level: 300 });
    expect(await seasonCleared("u1")).toBe(false);
    expect(await seasonCleared("u2")).toBe(true);
  });
});

describe("Gecko, the season unlock", () => {
  it("refuses Gecko after the tutorial at any star count, and saves it once the season is cleared", async () => {
    finishTutorial();
    progress.stars = 900;
    const err = await updateUserSettings("u1", { avatarId: "gecko" }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(AvatarLockedError);
    expect(update).not.toHaveBeenCalled();
    finishSeason();
    const saved = await updateUserSettings("u1", { avatarId: "gecko" });
    expect(saved.avatarId).toBe("gecko");
    expect(saved.avatarUnlocks.seasonDone).toBe(true);
    expect(saved.avatarUnlocks.unlockedIds.at(-1)).toBe("gecko");
  });
});

describe("getUserSettings avatarId", () => {
  it("returns a stored catalogue id", async () => {
    user.avatar_id = "gecko";
    expect((await getUserSettings("u1")).avatarId).toBe("gecko");
  });

  it("reads a retired or unknown stored id as null", async () => {
    user.avatar_id = "retired-avatar";
    expect((await getUserSettings("u1")).avatarId).toBeNull();
  });
});

describe("updateUserSettings avatarId", () => {
  it("writes a catalogue id and clears on null", async () => {
    finishTutorial();
    expect((await updateUserSettings("u1", { avatarId: "stick-green" })).avatarId).toBe("stick-green");
    expect(update).toHaveBeenLastCalledWith({ where: { id: "u1" }, data: { avatar_id: "stick-green" } });
    expect((await updateUserSettings("u1", { avatarId: null })).avatarId).toBeNull();
    expect(update).toHaveBeenLastCalledWith({ where: { id: "u1" }, data: { avatar_id: null } });
  });

  it("throws on a non-catalogue id without writing", async () => {
    await expect(updateUserSettings("u1", { avatarId: "toString" })).rejects.toThrow(/catalogue/);
    expect(update).not.toHaveBeenCalled();
  });

  it("leaves the avatar alone when avatarId is absent", async () => {
    user.avatar_id = "wraith";
    await updateUserSettings("u1", { leaderboardConsent: false });
    expect(update).toHaveBeenCalledWith({ where: { id: "u1" }, data: { leaderboard_consent_at: null } });
    expect(user.avatar_id).toBe("wraith");
  });
});

describe("updateUserSettings avatar unlocks (backstop behind the route)", () => {
  it("refuses a star-locked avatar one star short, without writing", async () => {
    progress.stars = LOCKED_STARS - 1;
    const err = await updateUserSettings("u1", { avatarId: LOCKED.id }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(AvatarLockedError);
    expect((err as AvatarLockedError).lock).toMatchObject({
      avatarId: LOCKED.id,
      kind: "stars",
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

  it.each(["wraith", "gecko-void"])("refuses the unbought Shop entry %s at any star count after the tutorial, without writing", async (id) => {
    progress.stars = 100_000;
    finishTutorial();
    const err = await updateUserSettings("u1", { avatarId: id }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(AvatarLockedError);
    expect((err as AvatarLockedError).lock).toMatchObject({ avatarId: id, kind: "purchase", requiredStars: null });
    expect(update).not.toHaveBeenCalled();
  });

  it("re-saves a Shop character that is already the saved one (grandfathered)", async () => {
    user.avatar_id = "wraith";
    expect((await updateUserSettings("u1", { avatarId: "wraith" })).avatarId).toBe("wraith");
    expect(update).toHaveBeenCalledWith({ where: { id: "u1" }, data: { avatar_id: "wraith" } });
  });

  it("refuses a stick figure before the tutorial, even with stars, and saves it after", async () => {
    progress.stars = 900;
    const err = await updateUserSettings("u1", { avatarId: "stick-sky" }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(AvatarLockedError);
    expect((err as AvatarLockedError).lock).toMatchObject({
      avatarId: "stick-sky",
      kind: "tutorial",
      requiredStars: null,
      message: "Finish the tutorial on level 1 to unlock Sky Stick",
    });
    expect(update).not.toHaveBeenCalled();

    finishTutorial();
    expect((await updateUserSettings("u1", { avatarId: "stick-sky" })).avatarId).toBe("stick-sky");
  });

  it("ignores a forged verdict and checks for itself", async () => {
    progress.stars = 0;
    const forged = {
      userId: "u1",
      avatarId: LOCKED.id,
      lock: null,
      stars: 900,
      tutorialDone: true,
      seasonDone: true,
      ownedIds: [],
    };
    const err = await updateUserSettings("u1", { avatarId: LOCKED.id }, forged).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(AvatarLockedError);
    expect(update).not.toHaveBeenCalled();
  });

  it("reuses a genuine verdict for this user and id without counting stars or reading the tutorial again", async () => {
    progress.stars = LOCKED_STARS;
    finishTutorial();
    const check = await checkAvatarForUser("u1", LOCKED.id);
    expect(check.lock).toBeNull();
    expect(check.tutorialDone).toBe(true);
    aggregate.mockClear();
    findFirst.mockClear();
    const { avatarUnlocks } = await updateUserSettings("u1", { avatarId: LOCKED.id }, check);
    expect(avatarUnlocks.stars).toBe(LOCKED_STARS);
    expect(avatarUnlocks.tutorialDone).toBe(true);
    expect(avatarUnlocks.unlockedIds).toEqual(expect.arrayContaining(STICK_IDS));
    expect(aggregate).not.toHaveBeenCalled();
    expect(findFirst).not.toHaveBeenCalled();
  });

  it("does not reuse a genuine verdict issued for a different avatar", async () => {
    finishTutorial();
    const freeCheck = await checkAvatarForUser("u1", "stick-green");
    expect(freeCheck.lock).toBeNull();
    const err = await updateUserSettings("u1", { avatarId: LOCKED.id }, freeCheck).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(AvatarLockedError);
    expect(update).not.toHaveBeenCalled();
  });

  it("saves a stick figure with no stars once the tutorial is done", async () => {
    finishTutorial();
    expect((await updateUserSettings("u1", { avatarId: "stick-pink" })).avatarId).toBe("stick-pink");
  });
});

describe("checkAvatarForUser", () => {
  it("refuses an unbought Shop id at any star count, reading stars, tutorial, owned rows and the saved avatar", async () => {
    progress.stars = 100_000;
    finishTutorial();
    const check = await checkAvatarForUser("u1", "wraith");
    expect(check).toMatchObject({ userId: "u1", avatarId: "wraith", stars: 100_000, tutorialDone: true, ownedIds: [] });
    expect(check.lock).toMatchObject({ kind: "purchase", requiredStars: null });
    expect(ownedFindMany).toHaveBeenCalled();
    expect(findUnique).toHaveBeenCalled();
    expect(aggregate).toHaveBeenCalled();
    expect(findFirst).toHaveBeenCalled();
  });

  it("refuses a stick id before the tutorial and allows it after", async () => {
    const before = await checkAvatarForUser("u1", "stick-green");
    expect(before.tutorialDone).toBe(false);
    expect(before.lock).toMatchObject({ avatarId: "stick-green", kind: "tutorial", requiredStars: null });
    finishTutorial();
    const after = await checkAvatarForUser("u1", "stick-green");
    expect(after.tutorialDone).toBe(true);
    expect(after.lock).toBeNull();
  });

  it("throws on a non-catalogue id rather than reading it as unlocked", async () => {
    await expect(checkAvatarForUser("u1", "__proto__")).rejects.toThrow(/catalogue/);
  });
});

describe("getUserSettings avatarUnlocks", () => {
  it("lists the saved avatar and star unlocks at the threshold, but no stick before the tutorial", async () => {
    // Saved (grandfathered) and still locked by stars.
    const saved = avatarEntry("heron")!;
    const stillLocked = AVATARS.filter(
      (a) => (a.unlock.kind === "stars" && a.unlock.stars > 15 && a.id !== saved.id) || a.unlock.kind !== "stars"
    );
    user.avatar_id = saved.id;
    progress.stars = 15; // exactly Kestrel's threshold

    const { avatarUnlocks } = await getUserSettings("u1");
    expect(avatarUnlocks).toEqual({
      stars: 15,
      tutorialDone: false,
      seasonDone: false,
      unlockedIds: ["kestrel", "heron"],
      ownedIds: [],
      grandfatheredId: "heron",
    });
    expect(stillLocked.length).toBeGreaterThan(0);
    for (const a of stillLocked) expect(avatarUnlocks.unlockedIds).not.toContain(a.id);
  });

  it("adds the six stick figures after the tutorial, never Gecko before the season, and never an unbought Shop entry", async () => {
    finishTutorial();
    progress.stars = 100_000;
    const { avatarUnlocks } = await getUserSettings("u1");
    expect(avatarUnlocks.tutorialDone).toBe(true);
    expect(avatarUnlocks.seasonDone).toBe(false);
    expect(STICK_IDS).toHaveLength(6);
    expect(avatarUnlocks.unlockedIds).toEqual(expect.arrayContaining(STICK_IDS));
    expect(avatarUnlocks.unlockedIds).not.toContain("gecko");
    expect(avatarUnlocks.unlockedIds).not.toContain("wraith");
    expect(avatarUnlocks.unlockedIds).not.toContain("gecko-void");
  });

  it("uses the unlock inputs a request already read instead of querying again", async () => {
    const { avatarUnlocks } = await getUserSettings("u1", { stars: 30, tutorialDone: true, seasonDone: false, ownedIds: [] });
    expect(avatarUnlocks.stars).toBe(30);
    expect(avatarUnlocks.unlockedIds).toEqual([...STICK_IDS, "kestrel", "lynx"]);
    expect(aggregate).not.toHaveBeenCalled();
    expect(findFirst).not.toHaveBeenCalled();
  });
});
