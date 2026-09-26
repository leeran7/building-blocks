/**
 * SEC-DC-3: the Daily Climb seed is HMAC-SHA256(DAILY_SEED_SECRET, day), so a
 * future tower cannot be computed (and searched offline) without the server
 * secret. The module fails closed: no secret, or a short one, means no seed at
 * all. It never falls back to a default or to the old `daily-YYYY-MM-DD` seed.
 */

import { createHmac } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  DAILY_SEED_SECRET_MIN_LENGTH,
  DailySeedUnavailableError,
  dailySeedConfigured,
  dailySeedFor,
  submissionDayForSeed,
} from "../../src/lib/dailySeedServer";
import { DAILY_SEED_PREFIX, isDailySeedShape } from "../../src/lib/dailyDay";
import { TEST_DAILY_SEED_SECRET } from "./dailySeedTestSecret";

const DAY = "2026-09-26";
const MIDDAY = new Date(`${DAY}T12:00:00Z`);

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("daily seed (SEC-DC-3)", () => {
  it("is the prefix plus a base64url HMAC-SHA256 of the day, truncated to 128 bits", () => {
    vi.stubEnv("DAILY_SEED_SECRET", TEST_DAILY_SEED_SECRET);
    const seed = dailySeedFor(DAY);
    expect(seed.startsWith(DAILY_SEED_PREFIX)).toBe(true);
    expect(isDailySeedShape(seed)).toBe(true);
    // Independent derivation from the documented construction.
    const mac = createHmac("sha256", TEST_DAILY_SEED_SECRET).update(`doomstack-daily-seed:${DAY}`).digest();
    expect(seed).toBe(`${DAILY_SEED_PREFIX}${mac.subarray(0, 16).toString("base64url")}`);
  });

  it("is stable for a day, differs between days, and never contains the day", () => {
    vi.stubEnv("DAILY_SEED_SECRET", TEST_DAILY_SEED_SECRET);
    expect(dailySeedFor(DAY)).toBe(dailySeedFor(DAY));
    expect(dailySeedFor(DAY)).not.toBe(dailySeedFor("2026-09-27"));
    expect(dailySeedFor(DAY)).not.toContain(DAY);
    expect(dailySeedFor(DAY)).not.toBe(`daily-${DAY}`);
  });

  it("depends on the secret: another key gives another tower", () => {
    vi.stubEnv("DAILY_SEED_SECRET", TEST_DAILY_SEED_SECRET);
    const a = dailySeedFor(DAY);
    vi.stubEnv("DAILY_SEED_SECRET", `${TEST_DAILY_SEED_SECRET}-rotated`);
    expect(dailySeedFor(DAY)).not.toBe(a);
  });

  it.each([
    ["missing", undefined],
    ["empty", ""],
    ["one character short", "x".repeat(DAILY_SEED_SECRET_MIN_LENGTH - 1)],
  ])("fails closed when the secret is %s", (_label, value) => {
    vi.stubEnv("DAILY_SEED_SECRET", value);
    expect(dailySeedConfigured()).toBe(false);
    expect(() => dailySeedFor(DAY)).toThrow(DailySeedUnavailableError);
    expect(() => submissionDayForSeed(`daily-${DAY}`, MIDDAY)).toThrow(DailySeedUnavailableError);
  });

  it("positive control: a secret of exactly the minimum length works", () => {
    vi.stubEnv("DAILY_SEED_SECRET", "x".repeat(DAILY_SEED_SECRET_MIN_LENGTH));
    expect(dailySeedConfigured()).toBe(true);
    expect(isDailySeedShape(dailySeedFor(DAY))).toBe(true);
  });

  it("accepts today's server seed and rejects the legacy predictable seed", () => {
    vi.stubEnv("DAILY_SEED_SECRET", TEST_DAILY_SEED_SECRET);
    expect(submissionDayForSeed(dailySeedFor(DAY), MIDDAY)).toBe(DAY);
    expect(submissionDayForSeed(`daily-${DAY}`, MIDDAY)).toBeNull();
    expect(submissionDayForSeed(`daily-2026-09-25`, new Date(`${DAY}T00:05:00Z`))).toBeNull();
  });

  it("rejects a seed made with a different secret", () => {
    vi.stubEnv("DAILY_SEED_SECRET", `${TEST_DAILY_SEED_SECRET}-attacker-guess`);
    const forged = dailySeedFor(DAY);
    vi.stubEnv("DAILY_SEED_SECRET", TEST_DAILY_SEED_SECRET);
    expect(submissionDayForSeed(forged, MIDDAY)).toBeNull();
  });
});
