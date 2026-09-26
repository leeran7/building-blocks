/**
 * GET /api/climb/daily — the one client contract for "which daily tower is
 * live", shared by the web /daily page and the Capacitor app (via
 * "@app/lib/dailyInfo"), so the two can never disagree on what a valid answer
 * is (RV-DC-5). Imported by the ES2020 SPA: no Object.hasOwn, no .at().
 *
 * `fetch(...).json()` is unchecked by tsc, so parseDailyInfo is the only
 * guard. It is an allow-list: a body that does not match the contract exactly
 * is null (treated as a failed load), never coerced into a plausible tower.
 */

import { isDailySeedShape, nextUtcResetAt, parseDayKey } from "./dailyDay";

/** Public endpoint path, relative to the API origin. */
export const DAILY_INFO_PATH = "/api/climb/daily";

export interface DailyInfo {
  /** UTC day key of the live tower, by the SERVER clock. */
  day: string;
  /** Opaque server seed (an HMAC of the day, SEC-DC-3). Shape-checked only. */
  seed: string;
  /** ISO instant of the next 00:00 UTC after `day`. */
  resetsAt: string;
  /**
   * ISO instant the server answered, by the SERVER clock. Always inside
   * `day` (before `resetsAt`). Staleness is measured from it, so a device
   * clock that is off cannot decide when the tower closes (V-DC-2).
   */
  now: string;
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null;

/** Parses an ISO instant sent as a string; NaN for anything else. */
function instantMs(v: unknown): number {
  return typeof v === "string" ? Date.parse(v) : Number.NaN;
}

/**
 * Validates a GET /api/climb/daily body; null if malformed. The seed is an
 * HMAC only the server can derive, so its shape is checked, not its value.
 * `resetsAt` must be exactly the reset that ends `day`, and `now` must fall
 * inside `day`: a body whose fields disagree is not a real answer.
 */
export function parseDailyInfo(body: unknown): DailyInfo | null {
  if (!isObject(body)) return null;
  const day = parseDayKey(body.day);
  if (day === null || !isDailySeedShape(body.seed)) return null;
  if (typeof body.resetsAt !== "string" || typeof body.now !== "string") return null;
  const resetsAtMs = instantMs(body.resetsAt);
  const dayStartMs = Date.parse(`${day}T00:00:00.000Z`);
  if (Number.isNaN(resetsAtMs) || resetsAtMs !== nextUtcResetAt(dayStartMs).getTime()) return null;
  const nowMs = instantMs(body.now);
  if (Number.isNaN(nowMs) || nowMs < dayStartMs || nowMs >= resetsAtMs) return null;
  return { day, seed: body.seed, resetsAt: body.resetsAt, now: body.now };
}

/**
 * The backstop: once the device's own clock has passed `resetsAt` and this
 * long has gone by since the fetch, refetch anyway. Only ever checked on a
 * Start tap, so it bounds a refetch to one per tap per minute, never a loop.
 */
export const DAILY_REFETCH_BACKOFF_MS = 60_000;

/** One reading of the device's two clocks. */
export interface DailyClockReading {
  /** Monotonic ms (performance.now): unaffected by clock changes. */
  mono: number;
  /** Wall-clock ms (Date.now): may be skewed from the server. */
  wall: number;
}

/** Reads both clocks. Falls back to the wall clock where there is no performance.now. */
export function readDailyClock(): DailyClockReading {
  const wall = Date.now();
  const mono = typeof performance !== "undefined" && typeof performance.now === "function" ? performance.now() : wall;
  return { mono, wall };
}

/**
 * A daily answer plus when it was asked for. `msLeft` is how long the tower
 * had left on the SERVER's timeline (resetsAt - server now), so it does not
 * depend on the device clock at all.
 */
export interface DailyInfoStamp {
  info: DailyInfo;
  msLeft: number;
  requestedAt: DailyClockReading;
}

/**
 * Stamps an answer with the clock reading taken just before its request.
 * Timing from the request (not the response) counts the network time as
 * elapsed, so the answer goes stale a little early, never late.
 */
export function stampDailyInfo(info: DailyInfo, requestedAt: DailyClockReading): DailyInfoStamp {
  return { info, msLeft: Date.parse(info.resetsAt) - Date.parse(info.now), requestedAt };
}

/**
 * Whether a stamped answer names a tower that has since closed (RV-DC-3,
 * V-DC-2). Stale once the time elapsed since the request reaches the time
 * the server said was left. Elapsed time is the larger of the monotonic and
 * wall-clock differences: a difference cancels any fixed clock skew, the
 * monotonic one survives the clock being set back, and the wall one keeps
 * counting where a suspended webview pauses performance.now. Backstop: also
 * stale once the device clock has passed `resetsAt` and more than
 * DAILY_REFETCH_BACKOFF_MS has gone by since the request.
 */
export function isDailyInfoStale(stamp: DailyInfoStamp, now: DailyClockReading): boolean {
  const wallElapsed = now.wall - stamp.requestedAt.wall;
  const elapsed = Math.max(now.mono - stamp.requestedAt.mono, wallElapsed);
  if (elapsed >= stamp.msLeft) return true;
  return now.wall >= Date.parse(stamp.info.resetsAt) && wallElapsed > DAILY_REFETCH_BACKOFF_MS;
}
