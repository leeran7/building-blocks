/**
 * Public creator profiles.
 *
 * A creator page (/c/[username]) ties together a person's paid listings and
 * their climbing record. It surfaces only already-public data (visible blocks +
 * the public climb leaderboard), keyed by the user-chosen `username`.
 */

import { prisma } from "./client";
import { Prisma, type CreatorPlatform } from "@prisma/client";
import { climberDisplay } from "../lib/handle";
import {
  getUserFreeClimbRecord,
  getUserClimbReplays,
  type UserFreeClimbRecord,
  type ClimbReplaySummary,
} from "./climb";

export interface CreatorBlock {
  slug: string;
  display_name: string;
  category: string | null;
  altitude: number;
  platform: CreatorPlatform | null;
  handle: string | null;
}

export interface CreatorProfile {
  username: string;
  /** Display name (profile name, else deterministic pseudonym). Never the email. */
  name: string;
  blocks: CreatorBlock[];
  freeClimb: UserFreeClimbRecord | null;
  replays: ClimbReplaySummary[];
}

/** Minimal public identity for a block owner — used to link to their creator page. */
export interface CreatorIdentity {
  username: string | null;
  name: string;
}

/**
 * Set (or change) a user's public username.
 * Returns `{ ok: false, reason: "taken" }` if the username is already in use.
 */
export async function setUsername(
  userId: string,
  username: string
): Promise<{ ok: true } | { ok: false; reason: "taken" }> {
  try {
    await prisma.user.update({ where: { id: userId }, data: { username } });
    return { ok: true };
  } catch (err) {
    // Unique-constraint violation on users.username → already taken.
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2002"
    ) {
      return { ok: false, reason: "taken" };
    }
    throw err;
  }
}

/** Clear a user's public username (removes their /c/[username] page). */
export async function clearUsername(userId: string): Promise<void> {
  await prisma.user.update({ where: { id: userId }, data: { username: null } });
}

/** Public identity for a block owner (or null when the block has no owner). */
export async function getCreatorIdentity(
  userId: string | null
): Promise<CreatorIdentity | null> {
  if (!userId) return null;
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { username: true, display_name: true },
  });
  if (!user) return null;
  return {
    username: user.username,
    name: climberDisplay(userId, user.display_name),
  };
}

/**
 * Full public profile for a username, or null if no such user.
 * Blocks are the user's visible (non-hidden) listings, altitude DESC.
 */
export async function getCreatorProfileByUsername(
  username: string
): Promise<CreatorProfile | null> {
  const user = await prisma.user.findUnique({
    where: { username },
    select: { id: true, display_name: true, username: true },
  });
  if (!user || !user.username) return null;

  const [blocks, freeClimb, replays] = await Promise.all([
    prisma.block.findMany({
      where: { userId: user.id, hidden_at: null },
      orderBy: { altitude: "desc" },
      select: {
        slug: true,
        display_name: true,
        category: true,
        altitude: true,
        platform: true,
        handle: true,
      },
    }),
    getUserFreeClimbRecord(user.id).catch(() => null),
    getUserClimbReplays(user.id).catch(() => []),
  ]);

  return {
    username: user.username,
    name: climberDisplay(user.id, user.display_name),
    blocks,
    freeClimb,
    replays,
  };
}
