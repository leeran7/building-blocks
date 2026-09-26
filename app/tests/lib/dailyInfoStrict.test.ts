/**
 * parseDailyInfo (RV-DC-5), beyond the cases in dailyInfo.test.ts:
 *
 * - resetsAt must be a STRING. Date.parse stringifies its argument, so an
 *   array holding the right ISO instant, or a Date object, would otherwise
 *   pass the "is it the reset that ends this day" check and reach callers
 *   typed as string (isDailyInfoStale calls Date.parse on it again).
 * - The parsed resetsAt is the server's, not one the client derives from its
 *   own clock. Checked on a device whose clock is on another day entirely,
 *   so a client-side value cannot coincide with the server's.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { isDailyInfoStale, parseDailyInfo, stampDailyInfo } from "../../src/lib/dailyInfo";

const SEED = "daily1-AbCdEfGhIjKlMnOpQrSt_-";
const INFO = { day: "2026-09-26", seed: SEED, resetsAt: "2026-09-27T00:00:00.000Z", now: "2026-09-26T23:59:00.000Z" };

afterEach(() => {
  vi.useRealTimers();
});

describe("parseDailyInfo: resetsAt is a string or nothing", () => {
  it("refuses the right instant wrapped in an array or a Date", () => {
    let checked = 0;
    for (const resetsAt of [[INFO.resetsAt], new Date(INFO.resetsAt), { toString: () => INFO.resetsAt }]) {
      expect(parseDailyInfo({ ...INFO, resetsAt })).toBeNull();
      checked++;
    }
    expect(checked).toBe(3);
  });

  it("positive control: the same instant as a string parses", () => {
    expect(parseDailyInfo(INFO)).toEqual(INFO);
  });
});

describe("parseDailyInfo keeps the server's resetsAt", () => {
  it("on a device whose clock is years off, the parsed answer carries the server's reset verbatim", () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2031-03-04T15:00:00Z"));
    expect(parseDailyInfo(INFO)?.resetsAt).toBe(INFO.resetsAt);
    // Another ISO spelling of the same instant is kept as sent.
    expect(parseDailyInfo({ ...INFO, resetsAt: "2026-09-27T00:00:00Z" })?.resetsAt).toBe("2026-09-27T00:00:00Z");
  });

  it("so staleness is judged on the server's timeline, whatever the device's date", () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2031-03-04T15:00:00Z"));
    const info = parseDailyInfo(INFO)!;
    // The server answered 60 s before its reset; the device's date is years off.
    const wall = Date.now();
    const stamp = stampDailyInfo(info, { mono: 0, wall });
    expect(stamp.msLeft).toBe(60_000);
    expect(isDailyInfoStale(stamp, { mono: 59_000, wall: wall + 59_000 })).toBe(false);
    expect(isDailyInfoStale(stamp, { mono: 61_000, wall: wall + 61_000 })).toBe(true);
  });
});
