/**
 * Verifier, iteration 7: direct tests for the two shared helpers added for
 * RV-DCF-4 and RV-DCF-6.
 *
 * isDailyStartFresh: both screens always store an answer together with its
 * own stamp, so no screen test can tell whether the helper checks that the
 * stamp belongs to the answer being shown. Only a direct call can.
 *
 * dailyMsUntilReset: the "Resets in" countdown runs on the server's timeline
 * once an answer is stamped, and on the device clock only before that.
 */

import { describe, expect, it } from "vitest";
import {
  dailyMsUntilReset,
  isDailyStartFresh,
  stampDailyInfo,
  type DailyClockReading,
  type DailyInfo,
} from "../../src/lib/dailyInfo";

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
const RESET = Date.parse("2026-09-27T00:00:00.000Z");

/** Yesterday's (26th) tower, answered `msLeft` before its reset. */
const oldAnswer = (msLeft: number): DailyInfo => ({
  day: "2026-09-26",
  seed: "daily1-OldOldOldOldOldOldOldO",
  resetsAt: new Date(RESET).toISOString(),
  now: new Date(RESET - msLeft).toISOString(),
});
/** Today's (27th) tower, answered 30 s after the reset. */
const NEW: DailyInfo = {
  day: "2026-09-27",
  seed: "daily1-NewNewNewNewNewNewNewN",
  resetsAt: new Date(RESET + DAY).toISOString(),
  now: new Date(RESET + 30_000).toISOString(),
};

describe("isDailyStartFresh (the start gate shared by web and mobile)", () => {
  const requestedAt: DailyClockReading = { mono: 1_000, wall: RESET - HOUR };
  const soon: DailyClockReading = { mono: 1_000 + MIN, wall: RESET - HOUR + MIN };

  it("control: the showing answer with its own fresh stamp may start", () => {
    const info = oldAnswer(HOUR);
    expect(isDailyStartFresh(info, stampDailyInfo(info, requestedAt), soon)).toBe(true);
  });

  it("refuses a stamp taken for a different answer, even when that stamp is still fresh", () => {
    // The stamp is for today's tower and nowhere near stale, but the answer
    // on show is yesterday's: starting would play a tower the stamp never timed.
    const shown = oldAnswer(HOUR);
    const stampForOther = stampDailyInfo(NEW, { mono: 1_000, wall: RESET + 30_000 });
    const justAfter: DailyClockReading = { mono: 1_010, wall: RESET + 30_010 };
    expect(isDailyStartFresh(shown, stampForOther, justAfter)).toBe(false);
    // Positive control: the same stamp with its own answer is fresh at that instant.
    expect(isDailyStartFresh(NEW, stampForOther, justAfter)).toBe(true);
    // And the other way round: today's answer shown with yesterday's stamp.
    const oldStamp = stampDailyInfo(shown, requestedAt);
    expect(isDailyStartFresh(NEW, oldStamp, soon)).toBe(false);
    expect(isDailyStartFresh(shown, oldStamp, soon)).toBe(true);
  });

  it("refuses with no answer or no stamp", () => {
    const info = oldAnswer(HOUR);
    const stamp = stampDailyInfo(info, requestedAt);
    expect(isDailyStartFresh(null, stamp, soon)).toBe(false);
    expect(isDailyStartFresh(info, null, soon)).toBe(false);
    expect(isDailyStartFresh(null, null, soon)).toBe(false);
  });

  it("refuses once the stamp is stale (1 ms before is still fresh)", () => {
    const info = oldAnswer(HOUR);
    const stamp = stampDailyInfo(info, requestedAt);
    const after = (ms: number): DailyClockReading => ({ mono: requestedAt.mono + ms, wall: requestedAt.wall + ms });
    expect(isDailyStartFresh(info, stamp, after(HOUR - 1))).toBe(true);
    expect(isDailyStartFresh(info, stamp, after(HOUR))).toBe(false);
  });
});

describe("dailyMsUntilReset (the lobby's 'Resets in')", () => {
  it("before the first answer: the device clock's next 00:00 UTC, read from the reading passed in", () => {
    expect(dailyMsUntilReset(null, { mono: 0, wall: RESET - MIN })).toBe(MIN);
    expect(dailyMsUntilReset(null, { mono: 0, wall: RESET - 5 * HOUR - 30_000 })).toBe(5 * HOUR + 30_000);
    // At the reset instant the next reset is a full day away, not 0.
    expect(dailyMsUntilReset(null, { mono: 0, wall: RESET })).toBe(DAY);
    // mono plays no part without a stamp.
    expect(dailyMsUntilReset(null, { mono: 123_456, wall: RESET - MIN })).toBe(MIN);
  });

  it("device clock 2 min fast, server at 23:59:00: 60 s left, not the device's 23 h 59 m", () => {
    const skew = 2 * MIN;
    const requestedAt: DailyClockReading = { mono: 500, wall: RESET - MIN + skew };
    const stamp = stampDailyInfo(oldAnswer(MIN), requestedAt);
    expect(dailyMsUntilReset(stamp, requestedAt)).toBe(MIN);
    // 20 s later it has counted down on the server's timeline.
    expect(dailyMsUntilReset(stamp, { mono: 20_500, wall: requestedAt.wall + 20_000 })).toBe(40_000);
    // Control: the device clock alone would say almost a day.
    expect(dailyMsUntilReset(null, requestedAt)).toBe(DAY - MIN);
  });

  it("counts elapsed time like the start gate: monotonic when the wall clock is set back, wall when mono paused", () => {
    const requestedAt: DailyClockReading = { mono: 0, wall: RESET - 10 * MIN };
    const stamp = stampDailyInfo(oldAnswer(10 * MIN), requestedAt);
    // Wall set back 2 h, 3 min on the monotonic clock: 7 min left.
    expect(dailyMsUntilReset(stamp, { mono: 3 * MIN, wall: requestedAt.wall - 2 * HOUR })).toBe(7 * MIN);
    // Monotonic clock paused (suspended webview), 4 min on the wall: 6 min left.
    expect(dailyMsUntilReset(stamp, { mono: 0, wall: requestedAt.wall + 4 * MIN })).toBe(6 * MIN);
  });

  it("reaches 0 exactly when the start gate goes stale, and never goes below 0", () => {
    const requestedAt: DailyClockReading = { mono: 0, wall: RESET - MIN };
    const info = oldAnswer(MIN);
    const stamp = stampDailyInfo(info, requestedAt);
    const after = (ms: number): DailyClockReading => ({ mono: ms, wall: requestedAt.wall + ms });
    expect(dailyMsUntilReset(stamp, after(MIN - 1))).toBe(1);
    expect(isDailyStartFresh(info, stamp, after(MIN - 1))).toBe(true);
    expect(dailyMsUntilReset(stamp, after(MIN))).toBe(0);
    expect(isDailyStartFresh(info, stamp, after(MIN))).toBe(false);
    expect(dailyMsUntilReset(stamp, after(3 * HOUR))).toBe(0);
  });
});
