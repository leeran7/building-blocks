/**
 * Tower v3 "The Climb" — climb-record persistence.
 *
 * Records a run and updates the player's PERMANENT peak-height record on the
 * matching free-stack board (mobile or desktop). The record is MONOTONIC:
 * peak_y is only ever raised, never lowered (spec-next.md AC-30/AC-31),
 * mirroring the leaderboard's "altitude is permanent" invariant. Boards do not
 * share a peak — a mobile PB cannot rank on desktop and vice versa.
 */

import { cache } from "react";
import { prisma } from "./client";
import { climberDisplay } from "../lib/handle";
import { FREE_STACK_SLUG } from "../game/freeStack";
import {
  CLIMB_BOARD_ORDER,
  DEFAULT_CLIMB_BOARD,
  type ClimbBoard,
} from "../game/climbBoard";
import { shareHandle } from "../share/handle";
import { parseRecordingId } from "../share/parseRecordingId";
import type { ShareableRecording } from "../share/types";

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
  /** Play surface this run was earned on. Required — the route allow-lists it. */
  board: ClimbBoard;
}

export interface PeakDecision {
  /** The player's peak height after this run (>= their prior best). */
  peakY: number;
  /** True if this run set a new personal best for the category. */
  improved: boolean;
}

export interface ClimbRecordResult extends PeakDecision {
  /** The player's 1-based rank on this board after this run. */
  rank: number;
  /** Total ranked climbers on this board. */
  totalClimbers: number;
  /** The name to show for this climber (profile name, else pseudonym). */
  handle: string;
  /** Board this rank belongs to. */
  board: ClimbBoard;
  /** Additive ClimbRun.id when create succeeds — used to build `/r/{id}`. */
  runId?: string;
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
 * Persist a run and upsert the monotonic peak-height record on one board.
 *
 * @returns the record after applying the run (peak never decreases).
 */
export async function recordClimb(
  input: ClimbResultInput
): Promise<ClimbRecordResult> {
  const peakY = Math.max(0, input.peakY);
  const stackSlug = FREE_STACK_SLUG;
  const board = input.board;
  const key = recordKey(input.userId, board);

  // Always store the raw run (history / future audit). Capture id for `/r/{id}`.
  const created = await prisma.climbRun.create({
    data: {
      userId: input.userId,
      category_slug: stackSlug,
      board,
      peak_y: peakY,
      finished: input.finished,
      finished_tick: input.finishedTick,
      seed: input.seed,
      replay_token: input.replayToken ?? null,
    },
  });

  const existing = await prisma.climbRecord.findUnique({
    where: { climb_record_user_category_board: key },
  });

  const { peakY: newBest, improved } = nextPeak(existing?.peak_y ?? 0, peakY);

  await prisma.climbRecord.upsert({
    where: { climb_record_user_category_board: key },
    create: {
      userId: input.userId,
      category_slug: stackSlug,
      board,
      peak_y: newBest,
      wins: input.finished ? 1 : 0,
    },
    update: {
      peak_y: newBest,
      ...(input.finished ? { wins: { increment: 1 } } : {}),
    },
  });

  const scope = boardWhere(board);
  const [above, totalClimbers, player] = await Promise.all([
    prisma.climbRecord.count({
      where: { ...scope, peak_y: { gt: newBest } },
    }),
    prisma.climbRecord.count({ where: scope }),
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
    board,
    runId: created.id,
  };
}

const getClimbRunRow = cache(async (id: string) => {
  const parsed = parseRecordingId(id);
  if (!parsed) return null;
  return prisma.climbRun.findUnique({
    where: { id: parsed },
    select: {
      id: true,
      peak_y: true,
      replay_token: true,
      userId: true,
      user: { select: { display_name: true } },
    },
  });
});

/**
 * Allow-list DTO for share/OG/metadata. Returns null when the id is invalid,
 * the row is missing, or `replay_token` is null. Never spreads the Prisma row.
 */
export async function getShareableClimbRun(
  id: string
): Promise<ShareableRecording | null> {
  const row = await getClimbRunRow(id);
  if (!row || row.replay_token == null) return null;
  return {
    id: row.id,
    peakY: row.peak_y,
    handle: shareHandle(row.userId, row.user?.display_name),
  };
}

/**
 * Playback token for the recording page body only — not share JSON or metadata.
 */
export async function getClimbRunReplayToken(
  id: string
): Promise<string | null> {
  const row = await getClimbRunRow(id);
  if (!row || row.replay_token == null) return null;
  return row.replay_token;
}

export interface ClimberRank {
  rank: number;
  userId: string;
  /** Privacy-safe pseudonym (never the email). */
  handle: string;
  peakY: number;
  wins: number;
}

/**
 * One free-stack board: highest peak-height record per player on that surface,
 * ranked descending. Ties broken by who reached it first (earliest updated_at).
 */
export async function topFreeClimbers(
  limit = 50,
  board: ClimbBoard = DEFAULT_CLIMB_BOARD
): Promise<ClimberRank[]> {
  const rows = await prisma.climbRecord.findMany({
    where: boardWhere(board),
    orderBy: [{ peak_y: "desc" }, { updated_at: "asc" }],
    take: limit,
    select: {
      userId: true,
      peak_y: true,
      wins: true,
      user: { select: { display_name: true } },
    },
  });
  return rows.map((r, i) => ({
    rank: i + 1,
    userId: r.userId,
    handle: climberDisplay(r.userId, r.user.display_name),
    peakY: r.peak_y,
    wins: r.wins,
  }));
}

/** @deprecated Use topFreeClimbers — kept for tests referencing the old name. */
export async function topClimbers(
  _categorySlug?: string,
  limit = 50
): Promise<ClimberRank[]> {
  return topFreeClimbers(limit);
}

/** Aggregate free-climb stats for the landing: distinct climbers + Mobile max. */
export async function getGlobalClimbStats(): Promise<{
  climberCount: number;
  topPeak: number | null;
}> {
  const [distinctClimbers, mobilePeak] = await Promise.all([
    prisma.climbRecord.findMany({
      where: { category_slug: FREE_STACK_SLUG },
      distinct: ["userId"],
      select: { userId: true },
    }),
    prisma.climbRecord.aggregate({
      where: { category_slug: FREE_STACK_SLUG, board: DEFAULT_CLIMB_BOARD },
      _max: { peak_y: true },
    }),
  ]);
  return {
    climberCount: distinctClimbers.length,
    topPeak: mobilePeak._max.peak_y,
  };
}

/** Whether this board has at least one free-climb record (cheap occupancy probe). */
export async function freeClimbBoardOccupied(board: ClimbBoard): Promise<boolean> {
  const row = await prisma.climbRecord.findFirst({
    where: boardWhere(board),
    select: { id: true },
  });
  return row !== null;
}

/** Occupancy probe that fails open: `null` when the read throws. */
export async function probeFreeClimbBoardOccupied(
  board: ClimbBoard
): Promise<boolean | null> {
  try {
    return await freeClimbBoardOccupied(board);
  } catch {
    return null;
  }
}

export interface UserBoardStanding {
  board: ClimbBoard;
  peakY: number;
  rank: number;
  totalClimbers: number;
  wins: number;
}

export interface UserFreeClimbBoards {
  handle: string;
  boards: UserBoardStanding[];
}

/** A signed-in user's standing on each free-stack board they have a record on. */
export async function getUserFreeClimbRecords(
  userId: string
): Promise<UserFreeClimbBoards | null> {
  const records = await prisma.climbRecord.findMany({
    where: { userId, category_slug: FREE_STACK_SLUG },
    select: {
      board: true,
      peak_y: true,
      wins: true,
      user: { select: { display_name: true } },
    },
  });
  if (records.length === 0) return null;

  const handle = climberDisplay(userId, records[0].user.display_name);
  const byBoard = new Map(records.map((r) => [r.board, r]));
  const boards: UserBoardStanding[] = [];

  for (const board of CLIMB_BOARD_ORDER) {
    const rec = byBoard.get(board);
    if (!rec) continue;
    const scope = boardWhere(board);
    const [above, totalClimbers] = await Promise.all([
      prisma.climbRecord.count({
        where: { ...scope, peak_y: { gt: rec.peak_y } },
      }),
      prisma.climbRecord.count({ where: scope }),
    ]);
    boards.push({
      board,
      peakY: rec.peak_y,
      rank: above + 1,
      totalClimbers,
      wins: rec.wins,
    });
  }

  if (boards.length === 0) return null;
  return { handle, boards };
}

/** @deprecated Use topFreeClimbers — landing previously used cross-category rows. */
export async function topClimbersGlobal(limit = 8): Promise<ClimberRank[]> {
  return topFreeClimbers(limit);
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

function recordKey(userId: string, board: ClimbBoard) {
  return {
    userId,
    category_slug: FREE_STACK_SLUG,
    board,
  };
}

function boardWhere(board: ClimbBoard) {
  return { category_slug: FREE_STACK_SLUG, board };
}
