/**
 * V-DC-2 (verifier): the device-clock half of the server-deadline check.
 *
 * isDailyInfoStale takes the larger of the monotonic and wall-clock elapsed
 * times, so a readDailyClock that swapped its two readings, or read the wall
 * clock twice, still gives the same `elapsed`. It would silently break the
 * rest: the backstop compares `wall` with the server's resetsAt, and a
 * monotonic reading is what survives the device clock being set back. These
 * tests pin each reading to its source, then drive the whole path (stamp,
 * then check) through the real readDailyClock.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DAILY_REFETCH_BACKOFF_MS,
  isDailyInfoStale,
  readDailyClock,
  stampDailyInfo,
  type DailyInfo,
} from "../../src/lib/dailyInfo";

const SEED = "daily1-AbCdEfGhIjKlMnOpQrSt_-";
const RESET = Date.parse("2026-09-27T00:00:00.000Z");
const HOUR = 3_600_000;

/** An answer the server gave `msLeft` before its reset. */
const answer = (msLeft: number): DailyInfo => ({
  day: "2026-09-26",
  seed: SEED,
  resetsAt: new Date(RESET).toISOString(),
  now: new Date(RESET - msLeft).toISOString(),
});

let mono = 0;

function fakeClocks(wall: number, monoStart: number) {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(wall));
  mono = monoStart;
  vi.spyOn(performance, "now").mockImplementation(() => mono);
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("readDailyClock", () => {
  it("reads mono from performance.now and wall from Date.now, never the other way round", () => {
    // Values far apart, so a swap or a double read cannot pass.
    fakeClocks(RESET - HOUR, 4_242);
    expect(readDailyClock()).toEqual({ mono: 4_242, wall: RESET - HOUR });
  });

  it("falls back to the wall clock for mono where there is no performance.now", () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(RESET - HOUR));
    vi.stubGlobal("performance", undefined);
    expect(readDailyClock()).toEqual({ mono: RESET - HOUR, wall: RESET - HOUR });
  });
});

describe("the real clock readings through stamp and check", () => {
  it("the device clock set back two hours after the fetch still goes stale when the server's minute is up", () => {
    // The server has 60 s left; the device agrees with it at fetch time.
    fakeClocks(RESET - 60_000, 1_000);
    const stamp = stampDailyInfo(answer(60_000), readDailyClock());
    // The player sets the clock back two hours; 61 s pass on the monotonic clock.
    vi.setSystemTime(new Date(RESET - 60_000 - 2 * HOUR));
    mono = 1_000 + 61_000;
    expect(isDailyInfoStale(stamp, readDailyClock())).toBe(true);
    // Positive control: 59 s in, the same set-back clock is still fresh.
    mono = 1_000 + 59_000;
    expect(isDailyInfoStale(stamp, readDailyClock())).toBe(false);
  });

  it("the backstop fires on the real wall reading once the device passes resetsAt", () => {
    // A device a day fast: its clock is always past the server's reset.
    fakeClocks(RESET + 24 * HOUR, 0);
    const stamp = stampDailyInfo(answer(12 * HOUR), readDailyClock());
    vi.setSystemTime(new Date(RESET + 24 * HOUR + DAILY_REFETCH_BACKOFF_MS + 1));
    mono = DAILY_REFETCH_BACKOFF_MS + 1;
    expect(isDailyInfoStale(stamp, readDailyClock())).toBe(true);
    // Positive control: within the backoff it is not refetched again.
    vi.setSystemTime(new Date(RESET + 24 * HOUR + DAILY_REFETCH_BACKOFF_MS));
    mono = DAILY_REFETCH_BACKOFF_MS;
    expect(isDailyInfoStale(stamp, readDailyClock())).toBe(false);
  });
});

describe("the backstop's device-reset edge", () => {
  it("fires from the device's own reset instant, not a millisecond later", () => {
    // Fetched 61 s before the device's reset; the server said an hour was left.
    const requestedAt = { mono: 0, wall: RESET - DAILY_REFETCH_BACKOFF_MS - 1_000 };
    const stamp = stampDailyInfo(answer(HOUR), requestedAt);
    const at = (wall: number) => ({ mono: wall - requestedAt.wall, wall });
    expect(isDailyInfoStale(stamp, at(RESET))).toBe(true);
    // Positive control: 1 ms before the device's reset (61 s since the fetch) it is fresh.
    expect(isDailyInfoStale(stamp, at(RESET - 1))).toBe(false);
  });
});
