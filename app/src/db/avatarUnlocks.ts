/**
 * Server-side avatar unlock state, derived only from stored rows: the level
 * stars in level_progress and the saved users.avatar_id. Nothing here reads
 * the request, so a client can never claim an unlock it has not recorded.
 *
 * Stars are summed over every season (best stars per level, as stored), so
 * an unlock is permanent: a new season never locks an avatar again. The rows
 * themselves are the device's report (src/db/levels.ts header), which is fine
 * for a cosmetic reward and never for money or ranking (context/trust.md).
 */

import { prisma } from "./client";
import { avatarEntry, parseAvatarId } from "../lib/avatars";
import { avatarLockFor, avatarUnlockState, type AvatarLock, type AvatarUnlockState } from "../lib/avatarUnlocks";

/**
 * The player's level stars across all seasons. One aggregate over the
 * (userId, season, level) unique index prefix. No row counts as 0.
 */
export async function levelStarsEarned(userId: string): Promise<number> {
  const agg = await prisma.levelProgress.aggregate({ where: { userId }, _sum: { stars: true } });
  return agg._sum.stars ?? 0;
}

/** Every avatar the player may select, from their stars and saved avatar. */
export async function avatarUnlocksFor(userId: string, savedAvatarId: string | null): Promise<AvatarUnlockState> {
  return avatarUnlockState({ stars: await levelStarsEarned(userId), savedAvatarId, userId });
}

/**
 * The lock on `avatarId` for this player, or null when they may save it.
 * Free avatars answer without a query. The caller must already have checked
 * `avatarId` with parseAvatarId; an unknown id throws rather than read as
 * unlocked.
 */
export async function avatarLockForUser(userId: string, avatarId: string): Promise<AvatarLock | null> {
  const entry = avatarEntry(avatarId);
  if (entry === null) throw new Error("avatarLockForUser: avatarId is not a catalogue id");
  if (entry.unlock.kind === "free") return null;
  const [user, stars] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { avatar_id: true } }),
    levelStarsEarned(userId),
  ]);
  return avatarLockFor(entry, { stars, savedAvatarId: parseAvatarId(user?.avatar_id), userId });
}

/** A refused avatar save: the player has not unlocked it. */
export class AvatarLockedError extends Error {
  constructor(public readonly lock: AvatarLock) {
    super(lock.message);
    this.name = "AvatarLockedError";
  }
}
