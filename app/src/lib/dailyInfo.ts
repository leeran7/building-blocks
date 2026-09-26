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
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null;

/**
 * Validates a GET /api/climb/daily body; null if malformed. The seed is an
 * HMAC only the server can derive, so its shape is checked, not its value.
 * `resetsAt` must be exactly the reset that ends `day`: a body whose two
 * fields disagree is not a real answer.
 */
export function parseDailyInfo(body: unknown): DailyInfo | null {
  if (!isObject(body)) return null;
  const day = parseDayKey(body.day);
  if (day === null || !isDailySeedShape(body.seed)) return null;
  if (typeof body.resetsAt !== "string") return null;
  const resetsAtMs = Date.parse(body.resetsAt);
  const dayStartMs = Date.parse(`${day}T00:00:00.000Z`);
  if (Number.isNaN(resetsAtMs) || resetsAtMs !== nextUtcResetAt(dayStartMs).getTime()) return null;
  return { day, seed: body.seed, resetsAt: body.resetsAt };
}

/**
 * Whether a daily answer fetched at `fetchedAtMs` names a tower that has since
 * closed: the server's reset fell between the fetch and `nowMs`. Keyed on the
 * server's own `resetsAt`, and on the fetch time, so a device clock a little
 * ahead of the server refetches once and then plays whatever the server says
 * (no refetch loop), instead of replaying yesterday's tower after 00:00 UTC
 * (RV-DC-3).
 */
export function isDailyInfoStale(info: DailyInfo, fetchedAtMs: number, nowMs: number): boolean {
  const resetsAtMs = Date.parse(info.resetsAt);
  return fetchedAtMs < resetsAtMs && nowMs >= resetsAtMs;
}
