/**
 * Resolve the `?day=` query parameter of the daily board routes.
 *
 * Absent → today (server clock). Present → must pass parseDayKey AND be a
 * readable board day (today back to DAILY_BOARD_HISTORY_DAYS). Everything
 * else is an error the route returns as 400 — never a substituted default,
 * which would show a player a different day's board than they asked for.
 */

import { isReadableBoardDay, parseDayKey, utcDayKey } from "./dailyDay";

export type BoardDayResolution =
  | { ok: true; day: string }
  | { ok: false; code: "INVALID_DAY" | "DAY_OUT_OF_RANGE"; error: string };

export function resolveBoardDay(raw: string | null, now: Date | number): BoardDayResolution {
  if (raw === null) return { ok: true, day: utcDayKey(now) };
  const day = parseDayKey(raw);
  if (day === null) {
    return { ok: false, code: "INVALID_DAY", error: "day must be a YYYY-MM-DD calendar date" };
  }
  if (!isReadableBoardDay(day, now)) {
    return { ok: false, code: "DAY_OUT_OF_RANGE", error: "day must be today or within the last 7 days" };
  }
  return { ok: true, day };
}
