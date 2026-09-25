/**
 * src/db/settings avatar handling: reads pass the stored id through the
 * catalogue allow-list (a retired id reads as null, never as a broken image
 * id), and the write path refuses a non-catalogue id even if a future caller
 * skips the route's validation.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const { user, findUnique, update } = vi.hoisted(() => {
  const user = { display_name: null, username: null, leaderboard_consent_at: null, avatar_id: null as string | null };
  return {
    user,
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
  },
}));

import { getUserSettings, updateUserSettings } from "../../src/db/settings";
import { AVATARS } from "../../src/lib/avatars";

beforeEach(() => {
  user.avatar_id = null;
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
