/**
 * Level System extras outside the level routes (design/xp-and-levels.md §4,
 * §5a, §5b): the once-a-day bonus life for finishing a Daily Climb or a duel,
 * the Daily Climb's XP, and the friends-only per-level boards.
 *
 * Trust: every write is SERVER-DERIVED. The caller passes only a user id it
 * authenticated and values it computed itself (the Daily's re-simulated
 * height, a duel the server completed). Each write takes the user's row lock
 * first (SELECT ... FOR UPDATE, as src/db/levels.ts does), so the bonus life
 * is paid at most once per UTC day and a day's XP only ever rises by its
 * delta, even under concurrent submits. Nothing here creates a users row: an
 * id with no row (a guest, an anonymous session) is a no-op.
 */

import { nanoid } from "nanoid";
import { FriendshipStatus } from "@prisma/client";

import { prisma } from "./client";
import { utcDayKey } from "../lib/dailyDay";
import { climberDisplay } from "../lib/handle";
import { parseAvatarId } from "../lib/avatars";
import { bonusLife, playerLevelForXp, raiseDailyXp } from "../levels/rules";

type TxClient = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

/** XpGrant source for the Daily Climb (§7 key `daily:{day}`). */
export const DAILY_XP_SOURCE = "daily";

async function lockExistingUser(tx: TxClient, userId: string) {
  await tx.$executeRaw`SELECT id FROM users WHERE id = ${userId} FOR UPDATE`;
  return tx.user.findUnique({
    where: { id: userId },
    select: { lives: true, lives_updated_at: true, bonus_life_day: true, xp: true },
  });
}

async function payBonusLife(
  tx: TxClient,
  userId: string,
  user: { lives: number; lives_updated_at: Date | null; bonus_life_day: string | null },
  now: Date
): Promise<boolean> {
  const today = utcDayKey(now);
  const next = bonusLife({ lives: user.lives, updatedAt: user.lives_updated_at }, user.bonus_life_day, today, now);
  if (!next) return false;
  await tx.user.update({
    where: { id: userId },
    data: { lives: next.lives, lives_updated_at: next.updatedAt, bonus_life_day: today },
  });
  return true;
}

/** True when `id` can hold level state: not a duel guest slot. */
function isAccountId(id: string | null | undefined): id is string {
  return typeof id === "string" && id.length > 0 && !id.startsWith("guest:");
}

/**
 * +1 life for finishing a duel, once per UTC day (shared with the Daily).
 * No-op for guests, unknown ids, a player already paid today, or one at
 * full lives. Returns whether a life was added.
 */
export async function grantBonusLife(userId: string, now: Date): Promise<boolean> {
  if (!isAccountId(userId)) return false;
  return prisma.$transaction(async (tx) => {
    const user = await lockExistingUser(tx, userId);
    if (!user) return false;
    return payBonusLife(tx, userId, user, now);
  });
}

export interface DailyRewards {
  /** XP added to the player's total by this run (only the rise over the day's best). */
  xpGained: number;
  /** The day's Daily XP after this run. */
  dailyXp: number;
  lifeGranted: boolean;
}

/**
 * Pay a verified Daily Climb run: raise the day's XP grant (`daily:{day}`) to
 * its floor count, max 100, adding only the rise to users.xp, and the
 * once-a-day bonus life. One transaction under the user lock.
 *
 * @param day    the Daily's tower day (the verifier's, never the client's)
 * @param floors floors the SERVER re-simulation climbed
 */
export async function recordDailyRewards(input: {
  userId: string;
  day: string;
  floors: number;
  now: Date;
}): Promise<DailyRewards> {
  const { userId, day, floors, now } = input;
  if (!isAccountId(userId)) return { xpGained: 0, dailyXp: 0, lifeGranted: false };
  return prisma.$transaction(async (tx) => {
    const user = await lockExistingUser(tx, userId);
    if (!user) return { xpGained: 0, dailyXp: 0, lifeGranted: false };

    const key = `daily:${day}`;
    const grant = await tx.xpGrant.findUnique({
      where: { userId_source_key: { userId, source: DAILY_XP_SOURCE, key } },
      select: { id: true, amount: true },
    });
    const raised = raiseDailyXp(grant?.amount ?? null, floors);
    if (raised.delta > 0) {
      if (grant) {
        await tx.xpGrant.update({ where: { id: grant.id }, data: { amount: raised.amount } });
      } else {
        await tx.xpGrant.create({
          data: { id: nanoid(), userId, source: DAILY_XP_SOURCE, key, amount: raised.amount, created_at: now },
        });
      }
      const xp = user.xp + raised.delta;
      await tx.user.update({ where: { id: userId }, data: { xp, player_level: playerLevelForXp(xp) } });
    }

    const lifeGranted = await payBonusLife(tx, userId, user, now);
    return { xpGained: raised.delta, dailyXp: raised.amount, lifeGranted };
  });
}

// ── Friends-only level boards (§4, §6.1) ──────────────────────────────────────

/** Most accepted friends one board reads, with a total order so the cut is stable. */
export const LEVEL_BOARD_MAX_FRIENDS = 1000;

export interface LevelBoardEntry {
  rank: number;
  isMe: boolean;
  handle: string;
  username: string | null;
  avatarId: string | null;
  stars: number;
  bestTicks: number;
}

export interface LevelBoard {
  season: number;
  level: number;
  /** The caller and their accepted friends who have cleared the level, fastest first. */
  entries: LevelBoardEntry[];
  /** Accepted friends on the board's list (cleared or not). */
  friendCount: number;
}

/**
 * The caller's accepted friends' best clears of one level, plus their own.
 * Pending and declined requests are not friends, and anyone with a blocked
 * row in either direction is left out even if an accepted row also exists.
 * Read-only; creates nothing.
 */
export async function levelFriendsBoard(userId: string, season: number, level: number): Promise<LevelBoard> {
  const [accepted, blocked] = await Promise.all([
    prisma.friendship.findMany({
      where: { status: FriendshipStatus.accepted, OR: [{ sender_id: userId }, { receiver_id: userId }] },
      select: { sender_id: true, receiver_id: true },
      orderBy: [{ created_at: "asc" }, { id: "asc" }],
      take: LEVEL_BOARD_MAX_FRIENDS,
    }),
    prisma.friendship.findMany({
      where: { status: FriendshipStatus.blocked, OR: [{ sender_id: userId }, { receiver_id: userId }] },
      select: { sender_id: true, receiver_id: true },
    }),
  ]);
  const other = (f: { sender_id: string; receiver_id: string }) => (f.sender_id === userId ? f.receiver_id : f.sender_id);
  const blockedIds = new Set(blocked.map(other));
  const friendIds = new Set<string>();
  for (const f of accepted) {
    const id = other(f);
    if (id !== userId && !blockedIds.has(id)) friendIds.add(id);
  }

  const rows = await prisma.levelProgress.findMany({
    where: { season, level, userId: { in: [userId, ...friendIds] } },
    orderBy: [{ best_ticks: "asc" }, { updated_at: "asc" }],
    select: {
      userId: true,
      stars: true,
      best_ticks: true,
      user: { select: { display_name: true, username: true, avatar_id: true } },
    },
  });

  return {
    season,
    level,
    friendCount: friendIds.size,
    entries: rows.map((r, i) => ({
      rank: i + 1,
      isMe: r.userId === userId,
      handle: climberDisplay(r.userId, r.user.display_name, r.user.avatar_id),
      username: r.user.username,
      avatarId: parseAvatarId(r.user.avatar_id),
      stars: r.stars,
      bestTicks: r.best_ticks,
    })),
  };
}
