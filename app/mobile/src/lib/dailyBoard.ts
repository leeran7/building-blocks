/**
 * Daily Climb board — client types, strict response parsers and the network
 * calls. Every parser is an allow-list: a body that does not match the
 * contract exactly is null (treated as a failed load), never coerced into a
 * plausible-looking board. `fetch(...).json()` is unchecked by tsc, so this is
 * the only place a server shape change can be caught.
 */

import { parseDayKey, utcDayKey, dailySeedFor, nextUtcResetAt } from "@app/lib/dailyDay";
import { parseAvatarId } from "@app/lib/avatars";
import { apiFetch } from "./api";

export interface DailyClimberRank {
  rank: number;
  userId: string;
  handle: string;
  username: string | null;
  peakY: number;
  attempts: number;
  avatarId: string | null;
}

export interface DailyStanding {
  /** Position on the public board; null when the player is hidden (no consent). */
  rank: number | null;
  peakY: number;
  attempts: number;
}

export interface DailyBoard {
  day: string;
  resetsAt: string;
  totalClimbers: number;
  climbers: DailyClimberRank[];
  me: DailyStanding | null;
}

export interface FriendsDailyBoard {
  day: string;
  resetsAt: string;
  climbers: DailyClimberRank[];
  hiddenCount: number;
  notClimbedCount: number;
}

export interface DailyInfo {
  day: string;
  seed: string;
  resetsAt: string;
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null;
const isCount = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v) && v >= 0;
const isHeight = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v) && v >= 0;
const isRank = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v) && v >= 1;
const isIso = (v: unknown): v is string => typeof v === "string" && !Number.isNaN(Date.parse(v));

function parseClimber(v: unknown): DailyClimberRank | null {
  if (!isObject(v)) return null;
  if (!isRank(v.rank) || typeof v.userId !== "string" || typeof v.handle !== "string") return null;
  if (!(v.username === null || typeof v.username === "string")) return null;
  if (!isHeight(v.peakY) || !isRank(v.attempts)) return null;
  if (!(v.avatarId === undefined || v.avatarId === null || typeof v.avatarId === "string")) return null;
  return {
    rank: v.rank,
    userId: v.userId,
    handle: v.handle,
    username: v.username,
    peakY: v.peakY,
    attempts: v.attempts,
    avatarId: parseAvatarId(v.avatarId),
  };
}

function parseClimbers(v: unknown): DailyClimberRank[] | null {
  if (!Array.isArray(v)) return null;
  const out: DailyClimberRank[] = [];
  for (const raw of v) {
    const c = parseClimber(raw);
    if (!c) return null;
    out.push(c);
  }
  return out;
}

function parseStanding(v: unknown): DailyStanding | null | undefined {
  if (v === null) return null;
  if (!isObject(v)) return undefined;
  if (!(v.rank === null || isRank(v.rank)) || !isHeight(v.peakY) || !isRank(v.attempts)) return undefined;
  return { rank: v.rank, peakY: v.peakY, attempts: v.attempts };
}

/** Validates a GET /api/climb/daily/leaderboard body; null if malformed. */
export function parseDailyBoard(body: unknown): DailyBoard | null {
  if (!isObject(body)) return null;
  const day = parseDayKey(body.day);
  const climbers = parseClimbers(body.climbers);
  const me = parseStanding(body.me);
  if (day === null || climbers === null || me === undefined) return null;
  if (!isIso(body.resetsAt) || !isCount(body.totalClimbers)) return null;
  return { day, resetsAt: body.resetsAt, totalClimbers: body.totalClimbers, climbers, me };
}

/** Validates a GET /api/climb/daily/leaderboard/friends body; null if malformed. */
export function parseFriendsDailyBoard(body: unknown): FriendsDailyBoard | null {
  if (!isObject(body)) return null;
  const day = parseDayKey(body.day);
  const climbers = parseClimbers(body.climbers);
  if (day === null || climbers === null || !isIso(body.resetsAt)) return null;
  if (!isCount(body.hiddenCount) || !isCount(body.notClimbedCount)) return null;
  return {
    day,
    resetsAt: body.resetsAt,
    climbers,
    hiddenCount: body.hiddenCount,
    notClimbedCount: body.notClimbedCount,
  };
}

/** Validates a GET /api/climb/daily body; null if malformed or self-inconsistent. */
export function parseDailyInfo(body: unknown): DailyInfo | null {
  if (!isObject(body)) return null;
  const day = parseDayKey(body.day);
  if (day === null || body.seed !== dailySeedFor(day) || !isIso(body.resetsAt)) return null;
  return { day, seed: body.seed, resetsAt: body.resetsAt };
}

/** Today's tower from the device clock — the offline fallback for GET /api/climb/daily. */
export function localDailyInfo(now: Date = new Date()): DailyInfo {
  const day = utcDayKey(now);
  return { day, seed: dailySeedFor(day), resetsAt: nextUtcResetAt(now).toISOString() };
}

/** The server's live daily tower, or null when unreachable (use localDailyInfo). */
export async function fetchDailyInfo(): Promise<DailyInfo | null> {
  try {
    const res = await apiFetch("/api/climb/daily");
    if (!res.ok) return null;
    return parseDailyInfo(await res.json());
  } catch {
    return null;
  }
}

export async function fetchDailyBoard(): Promise<DailyBoard | null> {
  try {
    const res = await apiFetch("/api/climb/daily/leaderboard");
    if (!res.ok) return null;
    return parseDailyBoard(await res.json());
  } catch {
    return null;
  }
}

export async function fetchFriendsDailyBoard(): Promise<FriendsDailyBoard | null> {
  try {
    const res = await apiFetch("/api/climb/daily/leaderboard/friends");
    if (!res.ok) return null;
    return parseFriendsDailyBoard(await res.json());
  } catch {
    return null;
  }
}

/**
 * Outcome of POST /api/climb/daily/result:
 * - saved: verified and on the board (rank null only if hidden);
 * - not_saved: a valid run with nothing to save it against (guest, no consent);
 * - rejected: the server refused this run (closed day, mismatch…) — do not retry;
 * - failed: network / 5xx / rate limit — the same payload may be retried.
 */
export type DailySaveResult =
  | {
      status: "saved";
      day: string;
      peakY: number;
      improved: boolean;
      rank: number | null;
      totalClimbers: number;
      attempts: number;
    }
  | { status: "not_saved"; reason: string }
  | { status: "rejected"; code: string }
  | { status: "failed" };

/** Maps a daily result response (status + parsed body) to a DailySaveResult. */
export function parseDailySaveResult(httpStatus: number, body: unknown): DailySaveResult {
  if (httpStatus === 400) {
    const code = isObject(body) && typeof body.code === "string" ? body.code : "INVALID";
    return { status: "rejected", code };
  }
  if (httpStatus !== 200 || !isObject(body)) return { status: "failed" };
  if (body.saved === false) {
    return { status: "not_saved", reason: typeof body.reason === "string" ? body.reason : "unknown" };
  }
  const day = parseDayKey(body.day);
  if (
    body.saved !== true ||
    day === null ||
    !isHeight(body.peakY) ||
    typeof body.improved !== "boolean" ||
    !(body.rank === null || isRank(body.rank)) ||
    !isCount(body.totalClimbers) ||
    !isRank(body.attempts)
  ) {
    return { status: "failed" };
  }
  return {
    status: "saved",
    day,
    peakY: body.peakY,
    improved: body.improved,
    rank: body.rank,
    totalClimbers: body.totalClimbers,
    attempts: body.attempts,
  };
}

/** Submit a finished daily run (must include replayToken). Never throws. */
export async function postDailyResult(run: object): Promise<DailySaveResult> {
  try {
    const res = await apiFetch("/api/climb/daily/result", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(run),
    });
    const body: unknown = await res.json().catch(() => null);
    return parseDailySaveResult(res.status, body);
  } catch {
    return { status: "failed" };
  }
}
