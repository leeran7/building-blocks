/**
 * Tower v3 "The Climb" — climb-record persistence.
 *
 * Records a run and updates the player's PERMANENT peak-height record on the
 * single free stack leaderboard. The record is MONOTONIC: peak_y is only ever
 * raised, never lowered (spec-next.md AC-30/AC-31), mirroring the leaderboard's
 * "altitude is permanent" invariant.
 */

import { cache } from "react";
import { unstable_cache } from "next/cache";

import { nanoid } from "nanoid";

import { prisma } from "./client";
import { climberDisplay } from "../lib/handle";
import { FREE_STACK_SLUG } from "../game/freeStack";

export interface ClimbResultInput {
  userId: string;
  /** Ignored for leaderboard placement — all records go to the free stack. */
  categorySlug?: string;
  peakY: number;
  finished: boolean;
  finishedTick: number | null;
  seed: string;
  /** Encoded deterministic replay for /play?r=… */
  replayToken?: string | null;
}

export interface PeakDecision {
  /** The player's peak height after this run (>= their prior best). */
  peakY: number;
  /** True if this run set a new personal best for the category. */
  improved: boolean;
}

export interface ClimbRecordResult extends PeakDecision {
  /** The player's 1-based rank on the free leaderboard after this run. */
  rank: number;
  /** Total ranked climbers on the free stack. */
  totalClimbers: number;
  /** The name to show for this climber (profile name, else pseudonym). */
  handle: string;
}

/**
 * Pure monotonic-peak decision (AC-30/AC-31): a record is only ever raised.
 * Extracted so the invariant is unit-testable without a database.
 */
export function nextPeak(priorBest: number, runPeak: number): PeakDecision {
  const clamped = Math.max(0, runPeak);
  const prior = Math.max(0, priorBest);
  const peakY = Math.max(prior, clamped);
  return { peakY, improved: peakY > prior };
}

/**
 * Persist a run and upsert the monotonic peak-height record on the free stack.
 *
 * @returns the record after applying the run (peak never decreases).
 */
export async function recordClimb(
  input: ClimbResultInput
): Promise<ClimbRecordResult> {
  const peakY = Math.max(0, input.peakY);
  const stackSlug = FREE_STACK_SLUG;
  const recordId = nanoid();
  const winsIncrement = input.finished ? 1 : 0;

  // Store the raw run and upsert the monotonic peak record in parallel.
  // The upsert uses GREATEST in a single round-trip, eliminating a prior
  // findUnique + separate upsert. A CTE captures the old peak_y so we can
  // derive the `improved` flag without an extra read.
  const [, upsertRows] = await Promise.all([
    prisma.climbRun.create({
      data: {
        userId: input.userId,
        category_slug: stackSlug,
        peak_y: peakY,
        finished: input.finished,
        finished_tick: input.finishedTick,
        seed: input.seed,
        replay_token: input.replayToken ?? null,
      },
    }),
    prisma.$queryRaw<{ peak_y: number; improved: boolean }[]>`
      WITH old AS (
        SELECT peak_y FROM climb_records
        WHERE "userId" = ${input.userId} AND category_slug = ${stackSlug}
      )
      INSERT INTO climb_records (id, "userId", category_slug, peak_y, wins, updated_at)
      VALUES (${recordId}, ${input.userId}, ${stackSlug}, ${peakY}, ${winsIncrement}, now())
      ON CONFLICT ("userId", category_slug)
      DO UPDATE SET
        peak_y = GREATEST(climb_records.peak_y, EXCLUDED.peak_y),
        wins = climb_records.wins + ${winsIncrement},
        updated_at = now()
      RETURNING peak_y, (peak_y > COALESCE((SELECT peak_y FROM old), 0)) as improved
    `,
  ]);

  const { peak_y: newBest, improved } = upsertRows[0];

  const [above, totalClimbers, player] = await Promise.all([
    prisma.climbRecord.count({
      where: { category_slug: stackSlug, peak_y: { gt: newBest } },
    }),
    prisma.climbRecord.count({ where: { category_slug: stackSlug } }),
    prisma.user.findUnique({
      where: { id: input.userId },
      select: { display_name: true },
    }),
  ]);

  return {
    peakY: newBest,
    improved,
    rank: above + 1,
    totalClimbers,
    handle: climberDisplay(input.userId, player?.display_name),
  };
}

export interface ClimberRank {
  rank: number;
  userId: string;
  /** Privacy-safe pseudonym (never the email). */
  handle: string;
  /** Public creator username, when set — links the row to /c/[username]. */
  username: string | null;
  peakY: number;
  wins: number;
}

/**
 * Tag for topFreeClimbers' unstable_cache entry. Time-based revalidation
 * alone (60s) means a consent change wouldn't visibly take effect for up to
 * a minute; revalidateTag(LEADERBOARD_CACHE_TAG) after a consent change
 * (see PUT /api/settings) clears it immediately instead.
 */
export const LEADERBOARD_CACHE_TAG = "leaderboard";

/**
 * The free-stack skill leaderboard: highest peak-height record per player,
 * ranked descending. Ties broken by who reached it first (earliest updated_at).
 *
 * Wrapped with `unstable_cache` (60 s revalidation) so concurrent API/RSC
 * callers share one DB round-trip per minute rather than one per request.
 */
export const topFreeClimbers = unstable_cache(
  async (limit: number = 50): Promise<ClimberRank[]> => {
    const rows = await prisma.climbRecord.findMany({
      // Guideline 5.1.2: only players who've explicitly opted in appear on
      // the public leaderboard. Filtered at read time (not just at write
      // time) so revoking consent removes an existing record too.
      where: { category_slug: FREE_STACK_SLUG, user: { leaderboard_consent_at: { not: null } } },
      orderBy: [{ peak_y: "desc" }, { updated_at: "asc" }],
      take: limit,
      select: {
        userId: true,
        peak_y: true,
        wins: true,
        user: { select: { display_name: true, username: true } },
      },
    });
    return rows.map((r, i) => ({
      rank: i + 1,
      userId: r.userId,
      handle: climberDisplay(r.userId, r.user.display_name),
      username: r.user.username,
      peakY: r.peak_y,
      wins: r.wins,
    }));
  },
  ["topFreeClimbers"],
  { revalidate: 60, tags: [LEADERBOARD_CACHE_TAG] }
);


/** Aggregate free-climb stats for the landing: distinct climbers + best peak.
 *
 * Wrapped with React `cache()` so multiple RSC callers in the same render pass
 * (SocialProofStrip + HomePage) share a single DB round-trip per ISR
 * regeneration.
 */
export const getGlobalClimbStats = cache(async (): Promise<{
  climberCount: number;
  topPeak: number | null;
}> => {
  const rows = await prisma.$queryRaw<{ climbers: number; top: number | null }[]>`
    SELECT COUNT(*)::int AS climbers, MAX(peak_y) AS top
    FROM climb_records
    WHERE category_slug = ${FREE_STACK_SLUG}
  `;
  const row = rows[0] ?? { climbers: 0, top: null };
  return { climberCount: Number(row.climbers ?? 0), topPeak: row.top };
});

export interface UserFreeClimbRecord {
  peakY: number;
  rank: number;
  totalClimbers: number;
  wins: number;
  handle: string;
}

/** A signed-in user's standing on the free stack, or null if they haven't played. */
export async function getUserFreeClimbRecord(
  userId: string
): Promise<UserFreeClimbRecord | null> {
  const record = await prisma.climbRecord.findUnique({
    where: {
      climb_record_user_category: {
        userId,
        category_slug: FREE_STACK_SLUG,
      },
    },
    select: {
      peak_y: true,
      wins: true,
      user: { select: { display_name: true } },
    },
  });
  if (!record) return null;

  const [above, totalClimbers] = await Promise.all([
    prisma.climbRecord.count({
      where: {
        category_slug: FREE_STACK_SLUG,
        peak_y: { gt: record.peak_y },
      },
    }),
    prisma.climbRecord.count({ where: { category_slug: FREE_STACK_SLUG } }),
  ]);

  return {
    peakY: record.peak_y,
    rank: above + 1,
    totalClimbers,
    wins: record.wins,
    handle: climberDisplay(userId, record.user.display_name),
  };
}


export interface ClimbReplaySummary {
  id: string;
  peakY: number;
  createdAt: string;
  replayToken: string | null;
}

/** Recent climb runs for the dashboard, newest first. */
export async function getUserClimbReplays(
  userId: string,
  limit = 30
): Promise<ClimbReplaySummary[]> {
  const rows = await prisma.climbRun.findMany({
    where: { userId },
    orderBy: { created_at: "desc" },
    take: limit,
    select: {
      id: true,
      peak_y: true,
      created_at: true,
      replay_token: true,
    },
  });
  return rows.map((r) => ({
    id: r.id,
    peakY: r.peak_y,
    createdAt: r.created_at.toISOString(),
    replayToken: r.replay_token,
  }));
}

/** Default page size for admin replay listing (mirrors getUserClimbReplays). */
export const ADMIN_REPLAY_DEFAULT_LIMIT = 30;
/** Hard cap so the admin tool can never request an unbounded scan. */
export const ADMIN_REPLAY_MAX_LIMIT = 100;

/**
 * Single source of truth for the replay-listing page size. Clamps to
 * [1, ADMIN_REPLAY_MAX_LIMIT] and floors fractional input. Shared by the db
 * query (defense-in-depth) and the tool handler so the two never diverge; the
 * zod schema also enforces the same bounds at the dispatch boundary.
 */
export function clampReplayLimit(requested: number = ADMIN_REPLAY_DEFAULT_LIMIT): number {
  return Math.min(Math.max(1, Math.floor(requested)), ADMIN_REPLAY_MAX_LIMIT);
}

export interface AdminClimbReplay {
  id: string;
  /** Privacy-safe display name (profile name, else pseudonym). Never the email/uid. */
  displayName: string;
  peakY: number;
  categorySlug: string;
  createdAt: string;
  /** Always non-null here — the query only returns runs that have a replay. */
  replayToken: string;
}

/**
 * Composite keyset cursor. created_at is NOT unique, so paging on it alone with
 * a strict `<` silently skips replays that share the exact same millisecond
 * across a page boundary. Tie-breaking on the unique `id` makes paging stable.
 */
export interface ReplayCursor {
  createdAt: Date;
  id: string;
}

export interface ListAllClimbReplaysInput {
  limit?: number;
  /** Keyset cursor: return only replays strictly older than this (createdAt, id). */
  before?: ReplayCursor;
}

/**
 * Admin-scoped listing of climb replays across ALL users, newest first.
 *
 * Only rows that actually HAVE a replay_token are returned — a "replay" implies
 * a decodable token the agent can feed into analyze_climb_replay. The limit is
 * clamped to [1, ADMIN_REPLAY_MAX_LIMIT] so a caller can never trigger an
 * unbounded scan. Backed by climb_run_created_idx (created_at DESC).
 *
 * Ordering and paging are stable via a composite (created_at, id) keyset: the
 * `before` cursor selects rows strictly older than (createdAt, id), so two
 * replays sharing the same created_at are never skipped or duplicated.
 *
 * NOT user-scoped: only reachable via dispatchTool after requireSocialAdmin at
 * the route boundary (AC-21). Prisma only, no raw SQL (AC-20).
 */
export async function listAllClimbReplays(
  input: ListAllClimbReplaysInput = {}
): Promise<AdminClimbReplay[]> {
  const limit = clampReplayLimit(input.limit);
  const cursor = input.before;

  const rows = await prisma.climbRun.findMany({
    where: {
      // replay_token != null must apply to EVERY cursor branch, so it is
      // AND-ed with the whole keyset OR (implicit AND at the object root).
      replay_token: { not: null },
      ...(cursor
        ? {
            OR: [
              { created_at: { lt: cursor.createdAt } },
              { created_at: cursor.createdAt, id: { lt: cursor.id } },
            ],
          }
        : {}),
    },
    orderBy: [{ created_at: "desc" }, { id: "desc" }],
    take: limit,
    select: {
      id: true,
      userId: true,
      peak_y: true,
      category_slug: true,
      created_at: true,
      replay_token: true,
      user: { select: { display_name: true } },
    },
  });

  return rows.map((r) => ({
    id: r.id,
    // Data minimization: the raw internal uid is never egressed to the LLM
    // transcript — only the privacy-safe pseudonym/display name is.
    displayName: climberDisplay(r.userId ?? r.id, r.user?.display_name ?? null),
    peakY: r.peak_y,
    categorySlug: r.category_slug,
    createdAt: r.created_at.toISOString(),
    // Non-null by the `replay_token: { not: null }` filter above; the `?? ""`
    // only satisfies the nullable Prisma type and is never actually reached.
    replayToken: r.replay_token ?? "",
  }));
}
