/**
 * User settings — profile display name + saved social handles.
 *
 * Social handles prefill at submit time and render as chips on the creator page.
 */

import { prisma } from "./client";
import type { CreatorPlatform } from "@prisma/client";
import { parseAvatarId } from "../lib/avatars";

/** Saved social handles keyed by platform (only platforms the user has set). */
export type SocialHandleMap = Partial<Record<CreatorPlatform, string>>;

export interface UserSettings {
  displayName: string | null;
  username: string | null;
  social: SocialHandleMap;
  leaderboardConsent: boolean;
  /** Catalogue avatar id; null = initials badge (also for a retired id). */
  avatarId: string | null;
}

export async function getUserSettings(userId: string): Promise<UserSettings> {
  const [user, social] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: { display_name: true, username: true, leaderboard_consent_at: true, avatar_id: true },
    }),
    prisma.savedSocialHandle.findMany({
      where: { userId },
      select: { platform: true, handle: true },
    }),
  ]);
  return {
    displayName: user?.display_name ?? null,
    username: user?.username ?? null,
    social: Object.fromEntries(social.map((s) => [s.platform, s.handle])),
    leaderboardConsent: Boolean(user?.leaderboard_consent_at),
    avatarId: parseAvatarId(user?.avatar_id),
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
 * be a catalogue id or null (clears); the settings route rejects anything else
 * with a 400 before this runs, so the throw here is only a backstop.
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
