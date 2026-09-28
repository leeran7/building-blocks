/**
 * Server-side avatar unlock state, derived only from stored rows: the level
 * stars in level_progress (and whether a level 1 row exists, the tutorial
 * unlock) and the saved users.avatar_id. Nothing here reads
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
 * Whether the player has cleared level 1 in any season: the tutorial unlock
 * for the stick figures. A row exists only for a cleared level (stars 1..3).
 */
export async function tutorialCleared(userId: string, db: Db = prisma): Promise<boolean> {
  const row = await db.levelProgress.findFirst({ where: { userId, level: 1 }, select: { id: true } });
  return row !== null;
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
  /** The star total read for the check. */
  readonly stars: number;
  /** Whether level 1 was cleared, read for the check. */
  readonly tutorialDone: boolean;
}

const ISSUED = new WeakSet<AvatarCheck>();

/** True when `check` came from checkAvatarForUser for exactly this user and id. */
export function isCheckFor(check: AvatarCheck | undefined, userId: string, avatarId: string): check is AvatarCheck {
  return check !== undefined && ISSUED.has(check) && check.userId === userId && check.avatarId === avatarId;
}

/**
 * Whether the player may save `avatarId`. The caller must already have
 * checked `avatarId` with parseAvatarId; an unknown id throws rather than
 * read as unlocked.
 */
export async function checkAvatarForUser(userId: string, avatarId: string): Promise<AvatarCheck> {
  const entry = avatarEntry(avatarId);
  if (entry === null) throw new Error("checkAvatarForUser: avatarId is not a catalogue id");
  const [user, stars, tutorialDone] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { avatar_id: true } }),
    levelStarsEarned(userId),
    tutorialCleared(userId),
  ]);
  const lock = avatarLockFor(entry, { stars, tutorialDone, savedAvatarId: parseAvatarId(user?.avatar_id) });
  const check: AvatarCheck = { userId, avatarId, lock, stars, tutorialDone };
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
