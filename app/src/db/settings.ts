/**
 * User settings — profile display name + saved social handles.
 *
 * Social handles prefill at submit time and render as chips on the creator page.
 */

import { prisma } from "./client";
import type { CreatorPlatform } from "@prisma/client";
import { parseAvatarId } from "../lib/avatars";
import { avatarUnlockState, type AvatarUnlockState } from "../lib/avatarUnlocks";
import { AvatarLockedError, avatarLockForUser, levelStarsEarned } from "./avatarUnlocks";

/** Saved social handles keyed by platform (only platforms the user has set). */
export type SocialHandleMap = Partial<Record<CreatorPlatform, string>>;

export interface UserSettings {
  displayName: string | null;
  username: string | null;
  social: SocialHandleMap;
  leaderboardConsent: boolean;
  /** Catalogue avatar id; null = initials badge (also for a retired id). */
  avatarId: string | null;
  /** Which avatars the player may select, derived from stored level stars. */
  avatarUnlocks: AvatarUnlockState;
}

export async function getUserSettings(userId: string): Promise<UserSettings> {
  const [user, social, stars] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: { display_name: true, username: true, leaderboard_consent_at: true, avatar_id: true },
    }),
    prisma.savedSocialHandle.findMany({
      where: { userId },
      select: { platform: true, handle: true },
    }),
    levelStarsEarned(userId),
  ]);
  const avatarId = parseAvatarId(user?.avatar_id);
  return {
    displayName: user?.display_name ?? null,
    username: user?.username ?? null,
    social: Object.fromEntries(social.map((s) => [s.platform, s.handle])),
    leaderboardConsent: Boolean(user?.leaderboard_consent_at),
    avatarId,
    avatarUnlocks: avatarUnlockState({ stars, savedAvatarId: avatarId, userId }),
  };
}

/** A user's saved social handles as a platform→handle map. */
export async function getUserSocialHandles(
  userId: string
): Promise<SocialHandleMap> {
  const rows = await prisma.savedSocialHandle.findMany({
    where: { userId },
    select: { platform: true, handle: true },
  });
  return Object.fromEntries(rows.map((r) => [r.platform, r.handle]));
}

/**
 * Upsert one saved social handle (idempotent) — used at checkout so a listed
 * platform's handle prefills next time. Empty handle is a no-op.
 */
export async function saveSocialHandle(
  userId: string,
  platform: CreatorPlatform,
  handle: string
): Promise<void> {
  const clean = handle.trim();
  if (!clean) return;
  await prisma.savedSocialHandle.upsert({
    where: { saved_social_user_platform: { userId, platform } },
    create: { userId, platform, handle: clean },
    update: { handle: clean },
  });
}

/**
 * Replace the user's social handles from a validated map: upsert non-empty
 * entries, delete platforms mapped to empty/undefined. Values must already be
 * normalized by the caller (the settings route).
 */
export async function updateUserSocialHandles(
  userId: string,
  map: SocialHandleMap
): Promise<void> {
  const ops = Object.entries(map).map(([platform, handle]) => {
    const p = platform as CreatorPlatform;
    const clean = (handle ?? "").trim();
    return clean
      ? prisma.savedSocialHandle.upsert({
          where: { saved_social_user_platform: { userId, platform: p } },
          create: { userId, platform: p, handle: clean },
          update: { handle: clean },
        })
      : prisma.savedSocialHandle.deleteMany({ where: { userId, platform: p } });
  });
  if (ops.length) await prisma.$transaction(ops);
}

/**
 * Update display name, leaderboard consent, and/or avatar. `avatarId` must
 * be a catalogue id the player has unlocked, or null (clears). The settings
 * route rejects an unknown id (400) and a locked one (403) before any write,
 * so these throws are only a backstop for a future caller that skips it.
 *
 * @throws AvatarLockedError when the player has not unlocked `avatarId`
 */
export async function updateUserSettings(
  userId: string,
  input: { displayName?: string | null; leaderboardConsent?: boolean; avatarId?: string | null }
): Promise<UserSettings> {
  const userPatch: Record<string, unknown> = {};
  if (input.displayName !== undefined) {
    userPatch.display_name = input.displayName?.trim() || null;
  }
  if (input.leaderboardConsent !== undefined) {
    userPatch.leaderboard_consent_at = input.leaderboardConsent ? new Date() : null;
  }
  if (input.avatarId !== undefined) {
    if (input.avatarId !== null && parseAvatarId(input.avatarId) === null) {
      throw new Error("updateUserSettings: avatarId is not a catalogue id");
    }
    const lock = input.avatarId === null ? null : await avatarLockForUser(userId, input.avatarId);
    if (lock) throw new AvatarLockedError(lock);
    userPatch.avatar_id = input.avatarId;
  }
  if (Object.keys(userPatch).length) {
    await prisma.user.update({
      where: { id: userId },
      data: userPatch,
    });
  }

  return getUserSettings(userId);
}
