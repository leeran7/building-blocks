/**
 * Daily Climb day arithmetic — the single definition of "which day is it".
 *
 * The day is the UTC calendar day, so every player on every device shares one
 * tower and one board, and the server can decide which day a run belongs to
 * without trusting the client's clock or timezone. Imported by the Next server
 * (routes), the web client and the Capacitor SPA (via "@app/lib/dailyDay"), so
 * it must stay ES2020-safe: no Object.hasOwn, no Array.prototype.at.
 *
 * Every function is pure: the caller passes `now`.
 */

export const MS_PER_MINUTE = 60_000;
export const MS_PER_DAY = 86_400_000;

/**
 * Prefix of every daily tower seed. The rest is an HMAC of the day that only
 * the server can compute (src/lib/dailySeedServer.ts); clients get the seed
 * from GET /api/climb/daily. Distinct from the legacy predictable
 * `daily-YYYY-MM-DD` seeds, which the server no longer accepts.
 */
export const DAILY_SEED_PREFIX = "daily1-";

/** Shape of a daily seed: the prefix and 22 base64url characters (128-bit MAC). */
const DAILY_SEED_RE = new RegExp(`^${DAILY_SEED_PREFIX}[A-Za-z0-9_-]{22}$`);

/**
 * How long after the UTC reset a run on the previous day's tower is still
 * accepted. Covers a run that straddles midnight plus a slow network, and no
 * more: after this the previous board is closed for good.
 */
export const DAILY_SUBMIT_GRACE_MS = 10 * MS_PER_MINUTE;

/** Past boards readable through GET /api/climb/daily/leaderboard?day=. */
export const DAILY_BOARD_HISTORY_DAYS = 7;

const DAY_KEY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

type Instant = Date | number;

function toMs(now: Instant): number {
  return typeof now === "number" ? now : now.getTime();
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

/** UTC calendar day of `now` as "YYYY-MM-DD". */
export function utcDayKey(now: Instant): string {
  const d = new Date(toMs(now));
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
}

/**
 * Whether a value has the shape of a daily seed. Shape only: a client cannot
 * tell a real seed from a forged one, and does not need to. The server
 * accepts runs only on the seed it derived itself.
 */
export function isDailySeedShape(seed: unknown): seed is string {
  return typeof seed === "string" && DAILY_SEED_RE.test(seed);
}

/** Epoch ms of 00:00 UTC on the day containing `now`. */
export function utcDayStartMs(now: Instant): number {
  const ms = toMs(now);
  return ms - (((ms % MS_PER_DAY) + MS_PER_DAY) % MS_PER_DAY);
}

/** The instant the next UTC day (and tower) begins. */
export function nextUtcResetAt(now: Instant): Date {
  return new Date(utcDayStartMs(now) + MS_PER_DAY);
}

/** Milliseconds until the next UTC reset. Always in (0, MS_PER_DAY]. */
export function msUntilUtcReset(now: Instant): number {
  return utcDayStartMs(now) + MS_PER_DAY - toMs(now);
}

/** Milliseconds since the most recent UTC reset. Always in [0, MS_PER_DAY). */
export function msSinceUtcReset(now: Instant): number {
  return toMs(now) - utcDayStartMs(now);
}

/**
 * Strict allow-list parser for a day key: exactly "YYYY-MM-DD" naming a real
 * calendar date. Anything else — wrong shape, 2026-02-30, a number, padding —
 * is null. Never substitutes a default.
 */
export function parseDayKey(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const m = DAY_KEY_RE.exec(raw);
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const ms = Date.UTC(year, month - 1, day);
  // Date.UTC maps years 0-99 to 1900-1999; the round-trip check below rejects
  // those along with every overflowed day (Feb 30 -> Mar 2).
  return utcDayKey(ms) === raw ? raw : null;
}

/** Epoch ms of 00:00 UTC on a day key already accepted by parseDayKey. */
function dayKeyStartMs(day: string): number {
  const m = DAY_KEY_RE.exec(day);
  if (!m) return Number.NaN;
  return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

/** The day key `delta` days after `day` (negative = earlier). */
export function shiftDayKey(day: string, delta: number): string {
  return utcDayKey(dayKeyStartMs(day) + delta * MS_PER_DAY);
}

/** Whole days from `from` to `to` (positive when `to` is later). */
export function daysBetween(from: string, to: string): number {
  return Math.round((dayKeyStartMs(to) - dayKeyStartMs(from)) / MS_PER_DAY);
}

/**
 * Whether a board for `day` is readable at `now`: today or up to
 * DAILY_BOARD_HISTORY_DAYS back. Future days and older history are not.
 */
export function isReadableBoardDay(day: string, now: Instant): boolean {
  const age = daysBetween(day, utcDayKey(now));
  return age >= 0 && age <= DAILY_BOARD_HISTORY_DAYS;
}

/**
 * One-time migration for a device store written when day keys were the
 * device's LOCAL date. A player east of UTC can hold a key one day ahead of
 * the UTC day; left alone, that "future" last-played day matches neither
 * today nor yesterday and silently zeroes the streak. Clamp it to today and
 * drop bests recorded against days that have not started in UTC yet (they
 * belong to a different tower). Keys at or before today are kept — a
 * west-of-UTC key reads as today or yesterday, which keeps the chain alive.
 */
export function migrateLocalDayKeys(
  lastPlayedKey: string | null,
  best: Record<string, number>,
  todayUtc: string
): { lastPlayedKey: string | null; best: Record<string, number> } {
  const nextBest: Record<string, number> = {};
  for (const key of Object.keys(best)) {
    if (parseDayKey(key) !== null && key <= todayUtc) nextBest[key] = best[key];
  }
  const validLast = parseDayKey(lastPlayedKey);
  const nextLast = validLast === null ? null : validLast > todayUtc ? todayUtc : validLast;
  return { lastPlayedKey: nextLast, best: nextBest };
}
