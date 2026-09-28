/**
 * Server-side avatar unlock state, derived only from stored rows: the level
 * stars in level_progress and the saved users.avatar_id. Nothing here reads
 * the request, so a client can never claim an unlock it has not recorded.
 *
 * Stars are summed over every season (best stars per level, as stored), so
 * an unlock earned by stars is permanent: a new season never locks it again.
 * The rows themselves are the device's report (src/db/levels.ts header),
 * which is fine for a cosmetic reward and never for money or ranking
 * (context/trust.md).
 */

import type { Prisma } from "@prisma/client";
import { prisma } from "./client";
import { avatarEntry, parseAvatarId } from "../lib/avatars";
import { avatarLockFor, type AvatarLock } from "../lib/avatarUnlocks";

type Db = Pick<Prisma.TransactionClient, "levelProgress">;

/**
 * The player's level stars across all seasons. One aggregate over the
 * (userId, season, level) unique index prefix. No row counts as 0. Pass a
 * transaction client to read inside that transaction.
 */
export async function levelStarsEarned(userId: string, db: Db = prisma): Promise<number> {
  const agg = await db.levelProgress.aggregate({ where: { userId }, _sum: { stars: true } });
  return agg._sum.stars ?? 0;
}

/**
 * The server's verdict on saving `avatarId` for `userId`. Only
 * checkAvatarForUser creates one (the WeakSet below), so a caller cannot hand
 * updateUserSettings a forged "unlocked" verdict.
 */
export interface AvatarCheck {
  readonly userId: string;
  readonly avatarId: string;
  /** Null when the player may save it. */
  readonly lock: AvatarLock | null;
  /** The star total read for the check; null when none was needed (a free avatar). */
  readonly stars: number | null;
}

const ISSUED = new WeakSet<AvatarCheck>();

/** True when `check` came from checkAvatarForUser for exactly this user and id. */
export function isCheckFor(check: AvatarCheck | undefined, userId: string, avatarId: string): check is AvatarCheck {
  return check !== undefined && ISSUED.has(check) && check.userId === userId && check.avatarId === avatarId;
}

/**
 * Whether the player may save `avatarId`. Free avatars answer without a
 * query. The caller must already have checked `avatarId` with parseAvatarId;
 * an unknown id throws rather than read as unlocked.
 */
export async function checkAvatarForUser(userId: string, avatarId: string): Promise<AvatarCheck> {
  const entry = avatarEntry(avatarId);
  if (entry === null) throw new Error("checkAvatarForUser: avatarId is not a catalogue id");
  let check: AvatarCheck;
  if (entry.unlock.kind === "free") {
    check = { userId, avatarId, lock: null, stars: null };
  } else {
    const [user, stars] = await Promise.all([
      prisma.user.findUnique({ where: { id: userId }, select: { avatar_id: true } }),
      levelStarsEarned(userId),
    ]);
    const lock = avatarLockFor(entry, { stars, savedAvatarId: parseAvatarId(user?.avatar_id), userId });
    check = { userId, avatarId, lock, stars };
  }
  ISSUED.add(check);
  return Object.freeze(check);
}

/** A refused avatar save: the player has not unlocked it. */
export class AvatarLockedError extends Error {
  constructor(public readonly lock: AvatarLock) {
    super(lock.message);
    this.name = "AvatarLockedError";
  }
}
