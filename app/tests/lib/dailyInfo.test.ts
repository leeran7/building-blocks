/**
 * The shared GET /api/climb/daily contract (RV-DC-5) and the staleness rule
 * that makes "Play again" after 00:00 UTC refetch the tower (RV-DC-3).
 * Every rejection is shown against a body that parses once the defect is
 * removed.
 */

import { describe, expect, it, vi } from "vitest";
import {
  DAILY_REFETCH_BACKOFF_MS,
  isDailyInfoStale,
  parseDailyInfo,
  stampDailyInfo,
  type DailyInfo,
} from "../../src/lib/dailyInfo";
import { GET } from "../../app/api/climb/daily/route";
import { TEST_DAILY_SEED_SECRET } from "./dailySeedTestSecret";

const SEED = "daily1-AbCdEfGhIjKlMnOpQrSt_-";
const INFO: DailyInfo = {
  day: "2026-09-26",
  seed: SEED,
  resetsAt: "2026-09-27T00:00:00.000Z",
  now: "2026-09-26T12:00:00.000Z",
};

describe("parseDailyInfo (shared by web and mobile)", () => {
  it("accepts the real route's own answer", async () => {
    vi.stubEnv("DAILY_SEED_SECRET", TEST_DAILY_SEED_SECRET);
    try {
      const body: unknown = await GET().json();
      expect(parseDailyInfo(body)).toEqual(body);
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("accepts a consistent body and returns only the four contract fields", () => {
    expect(parseDailyInfo({ ...INFO, extra: "x" })).toEqual(INFO);
  });

  it("rejects a resetsAt that is not the reset ending that day", () => {
    let checked = 0;
    for (const resetsAt of [
      "2026-09-26T00:00:00.000Z", // the day's own start
      "2026-09-28T00:00:00.000Z", // a day late
      "2026-09-27T00:00:01.000Z", // off by a second
      "soon",
      "",
      null,
      1790467200000,
    ]) {
      expect(parseDailyInfo({ ...INFO, resetsAt })).toBeNull();
      checked++;
    }
    expect(checked).toBeGreaterThan(0);
    // Positive control: the same instant in another ISO spelling parses.
    expect(parseDailyInfo({ ...INFO, resetsAt: "2026-09-27T00:00:00Z" })).not.toBeNull();
  });

  it("rejects a missing resetsAt (the web copy never checked it)", () => {
    const { resetsAt: _drop, ...noReset } = INFO;
    void _drop;
    expect(parseDailyInfo(noReset)).toBeNull();
  });

  it("rejects non-objects, bad days and bad seeds", () => {
    let checked = 0;
    for (const body of [null, "x", 7, [], { ...INFO, day: "2026-02-30" }, { ...INFO, seed: "daily-2026-09-26" }]) {
      expect(parseDailyInfo(body)).toBeNull();
      checked++;
    }
    expect(checked).toBeGreaterThan(0);
  });
});

describe("parseDailyInfo: the server's now (V-DC-2)", () => {
  it("rejects a missing, non-string or unparseable now", () => {
    const { now: _drop, ...noNow } = INFO;
    void _drop;
    let checked = 0;
    for (const body of [
      noNow,
      { ...INFO, now: null },
      { ...INFO, now: Date.parse(INFO.now) },
      { ...INFO, now: new Date(INFO.now) },
      { ...INFO, now: [INFO.now] },
      { ...INFO, now: "noon" },
      { ...INFO, now: "" },
    ]) {
      expect(parseDailyInfo(body)).toBeNull();
      checked++;
    }
    expect(checked).toBe(7);
    // Positive control: the same instant as a string parses and is kept.
    expect(parseDailyInfo(INFO)?.now).toBe(INFO.now);
  });

  it("rejects a now outside the answer's own day", () => {
    let checked = 0;
    for (const now of [
      "2026-09-25T23:59:59.999Z", // 1 ms before the day starts
      "2026-09-27T00:00:00.000Z", // the reset itself: the day is over
      "2026-09-27T06:00:00.000Z", // after the reset
    ]) {
      expect(parseDailyInfo({ ...INFO, now })).toBeNull();
      checked++;
    }
    expect(checked).toBe(3);
    // Positive controls: both inner edges of the day parse.
    expect(parseDailyInfo({ ...INFO, now: "2026-09-26T00:00:00.000Z" })).not.toBeNull();
    expect(parseDailyInfo({ ...INFO, now: "2026-09-26T23:59:59.999Z" })).not.toBeNull();
  });
});

describe("isDailyInfoStale: elapsed time against the time the server said was left", () => {
  const reset = Date.parse(INFO.resetsAt);
  const MIN = 60_000;
  const HOUR = 3_600_000;
  /** An answer the server gave `msLeft` before its reset. */
  const answer = (msLeft: number): DailyInfo => ({ ...INFO, now: new Date(reset - msLeft).toISOString() });

  it("msLeft comes from the server's resetsAt and now, not the device clock", () => {
    const stamp = stampDailyInfo(answer(90_000), { mono: 5, wall: 0 });
    expect(stamp.msLeft).toBe(90_000);
  });

  it("is fresh until exactly msLeft has elapsed, then stale (boundary)", () => {
    const wall = reset - MIN; // an accurate device clock
    const stamp = stampDailyInfo(answer(MIN), { mono: 1000, wall });
    expect(isDailyInfoStale(stamp, { mono: 1000 + MIN - 1, wall: wall + MIN - 1 })).toBe(false);
    expect(isDailyInfoStale(stamp, { mono: 1000 + MIN, wall: wall + MIN })).toBe(true);
    expect(isDailyInfoStale(stamp, { mono: 1000 + 3 * HOUR, wall: wall + 3 * HOUR })).toBe(true);
  });

  it("counts monotonic time when the wall clock is set back", () => {
    const stamp = stampDailyInfo(answer(MIN), { mono: 0, wall: reset - MIN });
    expect(isDailyInfoStale(stamp, { mono: MIN, wall: reset - 2 * HOUR })).toBe(true);
    expect(isDailyInfoStale(stamp, { mono: MIN - 1, wall: reset - 2 * HOUR })).toBe(false);
  });

  it("counts wall time when the monotonic clock paused (suspended webview)", () => {
    const stamp = stampDailyInfo(answer(MIN), { mono: 0, wall: reset - MIN });
    expect(isDailyInfoStale(stamp, { mono: 0, wall: reset })).toBe(true);
    expect(isDailyInfoStale(stamp, { mono: 0, wall: reset - 1 })).toBe(false);
  });

  it("a device clock 2 h SLOW still goes stale when the server's reset passes", () => {
    const skew = -2 * HOUR;
    const stamp = stampDailyInfo(answer(MIN), { mono: 0, wall: reset - MIN + skew });
    // The device reads 22:00:01, long before its own idea of the reset.
    expect(isDailyInfoStale(stamp, { mono: MIN + 1000, wall: reset + 1000 + skew })).toBe(true);
  });

  it("a device clock 2 min FAST that refetched in the skew window: fresh right after, stale 3 h later (V-DC-2 repro)", () => {
    const skew = 2 * MIN;
    // Device 00:00:30, server 23:58:30: the server still names yesterday's tower.
    const requestedWall = reset + 30_000;
    const stamp = stampDailyInfo(answer(90_000), { mono: 0, wall: requestedWall });
    expect(requestedWall - skew).toBe(reset - 90_000);
    // Straight after the refetch it plays what the server said (no loop).
    expect(isDailyInfoStale(stamp, { mono: 10, wall: requestedWall + 10 })).toBe(false);
    // Three hours later the server has long reset: the old answer is stale.
    expect(isDailyInfoStale(stamp, { mono: 3 * HOUR, wall: requestedWall + 3 * HOUR })).toBe(true);
  });

  it("backstop: past the device's reset and more than the backoff since the fetch, refetch anyway", () => {
    // Device 1 h fast; the server answered an hour before its reset.
    const stamp = stampDailyInfo(answer(HOUR), { mono: 0, wall: reset });
    const at = (ms: number) => ({ mono: ms, wall: reset + ms });
    expect(isDailyInfoStale(stamp, at(DAILY_REFETCH_BACKOFF_MS))).toBe(false);
    expect(isDailyInfoStale(stamp, at(DAILY_REFETCH_BACKOFF_MS + 1))).toBe(true);
  });

  it("backstop needs the device clock past the reset", () => {
    // An accurate clock two hours before the reset, 2 min after the fetch.
    const stamp = stampDailyInfo(answer(2 * HOUR), { mono: 0, wall: reset - 2 * HOUR });
    expect(isDailyInfoStale(stamp, { mono: 2 * MIN, wall: reset - 2 * HOUR + 2 * MIN })).toBe(false);
  });
});
