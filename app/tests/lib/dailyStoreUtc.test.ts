/**
 * AC-13: the device-local Daily Climb store (streak + per-day best) runs on
 * the UTC day, and a legacy store written with LOCAL-date keys migrates once.
 *
 * Runs the same behaviour against both copies: the native app's
 * mobile/src/lib/daily.ts (ClimbScreen, HomeScreen) and the web port
 * src/lib/daily.ts (DailyClimbClient). They share STORE_KEY, so they must
 * agree. Only Date is faked; localStorage is happy-dom's.
 *
 * @vitest-environment happy-dom
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/** The API both copies share (only mobile has clearDailyStore). */
type DailyLib = Pick<
  typeof import("../../mobile/src/lib/daily"),
  "todayKey" | "msUntilReset" | "dailySummary" | "commitDailyRun"
>;

/**
 * A fresh module instance per test, so no module state can carry between
 * tests and hide a leak like the shared-empty-store defect pinned below.
 */
const LOADERS: Record<"mobile" | "web", () => Promise<DailyLib>> = {
  mobile: () => import("../../mobile/src/lib/daily"),
  web: () => import("../../src/lib/daily"),
};

const STORE_KEY = "doomstack.daily.v1";

const stored = () => JSON.parse(localStorage.getItem(STORE_KEY) ?? "null") as Record<string, unknown> | null;
const at = (iso: string) => vi.setSystemTime(new Date(iso));

describe.each(["mobile", "web"] as const)("%s daily store on the UTC day", (name) => {
  let lib: DailyLib;
  // Run in a zone far from UTC, or a store keyed on the LOCAL date would pass
  // every test here by coincidence. (vitest's default fork pool keeps this to
  // this file's process.)
  const originalTz = process.env.TZ;
  beforeEach(async () => {
    process.env.TZ = "America/Los_Angeles";
    vi.resetModules();
    lib = await LOADERS[name]();
    localStorage.clear();
    vi.useFakeTimers({ toFake: ["Date"] });
  });
  afterEach(() => {
    vi.useRealTimers();
    if (originalTz === undefined) delete process.env.TZ;
    else process.env.TZ = originalTz;
  });

  it("keys today and the reset on the UTC day, not the device's", () => {
    // 20:00 in UTC-8 on the 26th is already the 27th in UTC.
    at("2026-09-26T20:00:00-08:00");
    // Precondition: the device's local date really is a different day here.
    expect(new Date().getDate()).toBe(26);
    expect(lib.todayKey()).toBe("2026-09-27");
    expect(lib.msUntilReset()).toBe(20 * 3_600_000);
  });

  it("extends the streak across the UTC reset even when both plays are the same local date", () => {
    at("2026-09-25T23:30:00Z"); // 16:30 on the 25th in UTC-7
    expect(lib.commitDailyRun(10)).toMatchObject({ streak: 1, streakExtended: true });
    at("2026-09-26T00:30:00Z"); // 17:30 on the 25th in UTC-7, but a new UTC day
    expect(lib.commitDailyRun(12)).toMatchObject({ streak: 2, streakExtended: true, isDayBest: true });
    expect(lib.dailySummary()).toEqual({ streak: 2, todayBest: 12, playedToday: true });
  });

  it("a second run the same UTC day keeps the streak and only raises the best", () => {
    at("2026-09-26T01:00:00Z");
    lib.commitDailyRun(10);
    at("2026-09-26T23:59:59Z");
    expect(lib.commitDailyRun(8)).toMatchObject({ streak: 1, streakExtended: false, isDayBest: false, todayBest: 10 });
  });

  it("a missed UTC day restarts the streak at 1", () => {
    at("2026-09-24T12:00:00Z");
    lib.commitDailyRun(10);
    at("2026-09-26T12:00:00Z");
    expect(lib.dailySummary().streak).toBe(0);
    expect(lib.commitDailyRun(5)).toMatchObject({ streak: 1, streakExtended: true });
  });

  it("a run that straddled the reset counts for the day it started on, without rewinding lastPlayed", () => {
    at("2026-09-25T20:00:00Z");
    lib.commitDailyRun(10); // 25th
    at("2026-09-26T00:01:00Z");
    lib.commitDailyRun(4); // 26th, streak 2
    // Yesterday's tower run lands after today's.
    expect(lib.commitDailyRun(30, "2026-09-25")).toMatchObject({ streak: 2, streakExtended: false, isDayBest: true });
    expect(lib.dailySummary()).toEqual({ streak: 2, todayBest: 4, playedToday: true });
    expect(stored()?.lastPlayedKey).toBe("2026-09-26");
  });

  it("migrates a legacy local-date store once: a future last-played key is clamped, future bests dropped", () => {
    at("2026-09-26T10:00:00Z");
    // Written east of UTC, where it was already the 27th locally.
    localStorage.setItem(
      STORE_KEY,
      JSON.stringify({ lastPlayedKey: "2026-09-27", streak: 5, best: { "2026-09-27": 50, "2026-09-25": 20, junk: 3 } })
    );
    expect(lib.dailySummary()).toEqual({ streak: 5, todayBest: 0, playedToday: true });
    expect(stored()).toEqual({ scheme: "utc", lastPlayedKey: "2026-09-26", streak: 5, best: { "2026-09-25": 20 } });
  });

  it("keeps a west-of-UTC legacy key (yesterday) so the chain stays alive", () => {
    at("2026-09-26T10:00:00Z");
    localStorage.setItem(STORE_KEY, JSON.stringify({ lastPlayedKey: "2026-09-25", streak: 3, best: { "2026-09-25": 9 } }));
    expect(lib.dailySummary()).toEqual({ streak: 3, todayBest: 0, playedToday: false });
    expect(lib.commitDailyRun(1)).toMatchObject({ streak: 4, streakExtended: true });
  });

  it("does not re-run the migration on a store already marked UTC", () => {
    at("2026-09-26T10:00:00Z");
    // A UTC store whose last play is legitimately later than a stale device
    // clock would say: left as-is, not clamped.
    localStorage.setItem(STORE_KEY, JSON.stringify({ scheme: "utc", lastPlayedKey: "2026-09-27", streak: 2, best: {} }));
    lib.dailySummary();
    expect(stored()).toEqual({ scheme: "utc", lastPlayedKey: "2026-09-27", streak: 2, best: {} });
  });

  it("treats a corrupt blob as an empty store", () => {
    at("2026-09-26T10:00:00Z");
    localStorage.setItem(STORE_KEY, "{not json");
    expect(lib.dailySummary()).toEqual({ streak: 0, todayBest: 0, playedToday: false });
    localStorage.setItem(STORE_KEY, JSON.stringify({ scheme: "utc", lastPlayedKey: 7, streak: "9", best: { "2026-09-26": -1 } }));
    expect(lib.dailySummary()).toEqual({ streak: 0, todayBest: 0, playedToday: false });
  });

  // Regression: read() used to return `{ ...empty }`, a shallow copy, so
  // commitDailyRun wrote the day's best into a shared module-level `best`.
  // After clearDailyStore() (account deletion) the next account in the same
  // session inherited those bests.
  it("a cleared store does not inherit bests from an earlier run in the same session", () => {
    at("2026-09-26T10:00:00Z");
    lib.commitDailyRun(812);
    localStorage.removeItem(STORE_KEY); // what clearDailyStore() does
    expect(lib.dailySummary()).toEqual({ streak: 0, todayBest: 0, playedToday: false });
    expect(lib.commitDailyRun(5)).toMatchObject({ isDayBest: true, todayBest: 5 });
  });
});
