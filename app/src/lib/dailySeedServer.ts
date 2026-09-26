/**
 * Daily Climb tower seed. SERVER-ONLY.
 *
 * The seed is HMAC-SHA256(DAILY_SEED_SECRET, day), truncated and encoded as
 * base64url behind DAILY_SEED_PREFIX. Without the secret nobody can compute a
 * future tower, so an offline search for a perfect run cannot start before
 * the day opens (SEC-DC-3). GET /api/climb/daily is the only place a seed
 * leaves the server, and only for today.
 *
 * Fail closed: with no secret, or one shorter than
 * DAILY_SEED_SECRET_MIN_LENGTH, every function here throws
 * DailySeedUnavailableError. Routes check dailySeedConfigured() first and
 * answer 503. There is no default secret and no fallback to the old
 * `daily-YYYY-MM-DD` seed.
 *
 * Imports node:crypto, so it cannot be bundled into the web or mobile client.
 * Clients only see seeds through the API (see isDailySeedShape in dailyDay.ts).
 */

import { createHmac } from "node:crypto";

import { constantTimeEqual } from "../api/middleware/requireAdmin";
import {
  DAILY_SEED_PREFIX,
  DAILY_SUBMIT_GRACE_MS,
  msSinceUtcReset,
  shiftDayKey,
  utcDayKey,
} from "./dailyDay";

/** Env var holding the HMAC key. Generate with `openssl rand -hex 32`. */
export const DAILY_SEED_SECRET_ENV = "DAILY_SEED_SECRET";

/** Shortest secret accepted, in characters (`openssl rand -hex 32` gives 64). */
export const DAILY_SEED_SECRET_MIN_LENGTH = 32;

/** HMAC bytes kept in the seed: 128 bits, 22 base64url characters. */
const SEED_MAC_BYTES = 16;

/** Domain-separates this HMAC from any other use of the same key. */
const SEED_CONTEXT = "doomstack-daily-seed:";

export class DailySeedUnavailableError extends Error {
  constructor() {
    super(`${DAILY_SEED_SECRET_ENV} is missing or shorter than ${DAILY_SEED_SECRET_MIN_LENGTH} characters`);
    this.name = "DailySeedUnavailableError";
  }
}

function secretOrNull(): string | null {
  const raw = process.env[DAILY_SEED_SECRET_ENV];
  return typeof raw === "string" && raw.length >= DAILY_SEED_SECRET_MIN_LENGTH ? raw : null;
}

function requireSecret(): string {
  const secret = secretOrNull();
  if (secret === null) throw new DailySeedUnavailableError();
  return secret;
}

/** Whether the daily seed can be derived. Routes answer 503 when it cannot. */
export function dailySeedConfigured(): boolean {
  return secretOrNull() !== null;
}

/** The tower seed for a UTC day key. Throws DailySeedUnavailableError without a secret. */
export function dailySeedFor(day: string): string {
  const mac = createHmac("sha256", requireSecret())
    .update(`${SEED_CONTEXT}${day}`)
    .digest()
    .subarray(0, SEED_MAC_BYTES);
  return `${DAILY_SEED_PREFIX}${mac.toString("base64url")}`;
}

/**
 * The day whose board a run on `seed` counts toward, decided entirely from
 * the server clock: today's seed always, yesterday's seed only within
 * DAILY_SUBMIT_GRACE_MS of the reset. Anything else is null: an old tower, a
 * future tower, the legacy `daily-YYYY-MM-DD` seed, or a non-daily seed.
 */
export function submissionDayForSeed(seed: string, now: Date | number): string | null {
  const today = utcDayKey(now);
  if (constantTimeEqual(seed, dailySeedFor(today))) return today;
  if (msSinceUtcReset(now) <= DAILY_SUBMIT_GRACE_MS) {
    const yesterday = shiftDayKey(today, -1);
    if (constantTimeEqual(seed, dailySeedFor(yesterday))) return yesterday;
  }
  return null;
}
