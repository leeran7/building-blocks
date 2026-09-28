/**
 * Star chest rolls (design/xp-and-levels.md §6.4). SERVER-ONLY.
 *
 * A chest's contents are HMAC-SHA256(STAR_CHEST_SECRET, `${userId}:${n}`) for
 * chest number n, mapped onto the booster pool by chestBoostersFromRoll
 * (engagement.ts). Without the secret nobody can predict a chest, and the
 * star_chests row unique on (user, chest number) means each chest is rolled
 * and paid once.
 *
 * Fail closed: unless NODE_ENV is "test" or "development", a missing or
 * short secret opens no chests; they stay earned and open on a later clear
 * once the secret is set. In tests and local dev a fixed test secret is
 * used, so they are deterministic.
 *
 * Imports node:crypto, so it cannot be bundled into the web or mobile client.
 */

import { createHmac } from "node:crypto";

import { chestBoostersFromRoll, type BoosterType } from "./engagement";

/** Env var holding the HMAC key. Generate with `openssl rand -hex 32`. */
export const STAR_CHEST_SECRET_ENV = "STAR_CHEST_SECRET";

/** Shortest secret accepted, in characters (`openssl rand -hex 32` gives 64). */
export const STAR_CHEST_SECRET_MIN_LENGTH = 32;

/** Used only outside production, so local runs and tests roll the same chests. */
export const TEST_STAR_CHEST_SECRET = "test-star-chest-secret-never-in-production-0000";

/** The chest secret, or null (production without a sound secret: open nothing). */
export function starChestSecret(env: Record<string, string | undefined> = process.env): string | null {
  const raw = env[STAR_CHEST_SECRET_ENV];
  if (typeof raw === "string" && raw.length >= STAR_CHEST_SECRET_MIN_LENGTH) return raw;
  // Only local runs and tests fall back to the public test secret; any other
  // deploy (production, a staging `next start`) opens nothing without one.
  return env.NODE_ENV === "test" || env.NODE_ENV === "development" ? TEST_STAR_CHEST_SECRET : null;
}

/** The raw roll for chest `chestNumber` of `userId`. */
export function starChestRoll(secret: string, userId: string, chestNumber: number): Uint8Array {
  return createHmac("sha256", secret).update(`${userId}:${chestNumber}`).digest();
}

/** The boosters in chest `chestNumber` of `userId`, drawn from `pool`. */
export function rollStarChest(
  secret: string,
  userId: string,
  chestNumber: number,
  pool: readonly BoosterType[]
): BoosterType[] {
  return chestBoostersFromRoll(starChestRoll(secret, userId, chestNumber), pool);
}
