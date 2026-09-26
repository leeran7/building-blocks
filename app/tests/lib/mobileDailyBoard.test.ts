/**
 * Strict parsers for the Daily Climb API on mobile (mobile/src/lib/dailyBoard).
 * `fetch().json()` is unchecked by tsc, so these are the only guard between a
 * server shape change and a screen that renders garbage. Each rejection is
 * shown against a body that parses once the defect is removed.
 */

import { describe, expect, it, vi } from "vitest";

vi.mock("../../mobile/src/lib/api", () => ({ apiFetch: vi.fn() }));

import {
  localDailyInfo,
  parseDailyBoard,
  parseDailyInfo,
  parseDailySaveResult,
  parseFriendsDailyBoard,
} from "../../mobile/src/lib/dailyBoard";

const climber = {
  rank: 1,
  userId: "u1",
  handle: "Golden Heron 31",
  username: null,
  peakY: 812.5,
  attempts: 3,
  avatarId: null,
};

const board = {
  day: "2026-09-26",
  resetsAt: "2026-09-27T00:00:00.000Z",
  totalClimbers: 1,
  climbers: [climber],
  me: { rank: 1, peakY: 812.5, attempts: 3 },
};

describe("parseDailyBoard", () => {
  it("accepts the documented response", () => {
    expect(parseDailyBoard(board)).toEqual(board);
    expect(parseDailyBoard({ ...board, me: null })).toEqual({ ...board, me: null });
    expect(parseDailyBoard({ ...board, me: { rank: null, peakY: 5, attempts: 1 } })?.me).toEqual({
      rank: null,
      peakY: 5,
      attempts: 1,
    });
  });

  it("rejects a malformed day, reset, count, climber or standing", () => {
    expect(parseDailyBoard({ ...board, day: "2026-02-30" })).toBeNull();
    expect(parseDailyBoard({ ...board, resetsAt: "soon" })).toBeNull();
    expect(parseDailyBoard({ ...board, totalClimbers: -1 })).toBeNull();
    expect(parseDailyBoard({ ...board, climbers: [{ ...climber, peakY: "812" }] })).toBeNull();
    expect(parseDailyBoard({ ...board, climbers: [{ ...climber, attempts: 0 }] })).toBeNull();
    expect(parseDailyBoard({ ...board, me: { rank: 0, peakY: 1, attempts: 1 } })).toBeNull();
    expect(parseDailyBoard({ ...board, me: undefined })).toBeNull();
    expect(parseDailyBoard(null)).toBeNull();
  });

  it("maps an unknown avatar id to the initials badge", () => {
    const parsed = parseDailyBoard({ ...board, climbers: [{ ...climber, avatarId: "retired-avatar" }] });
    expect(parsed?.climbers[0].avatarId).toBeNull();
  });
});

describe("parseFriendsDailyBoard", () => {
  const friends = {
    day: "2026-09-26",
    resetsAt: "2026-09-27T00:00:00.000Z",
    climbers: [climber],
    hiddenCount: 2,
    notClimbedCount: 1,
  };

  it("accepts the documented response and rejects bad counts", () => {
    expect(parseFriendsDailyBoard(friends)).toEqual(friends);
    expect(parseFriendsDailyBoard({ ...friends, hiddenCount: 1.5 })).toBeNull();
    expect(parseFriendsDailyBoard({ ...friends, notClimbedCount: undefined })).toBeNull();
  });
});

describe("parseDailyInfo", () => {
  it("accepts a self-consistent day and seed only", () => {
    const info = { day: "2026-09-26", seed: "daily-2026-09-26", resetsAt: "2026-09-27T00:00:00.000Z" };
    expect(parseDailyInfo(info)).toEqual(info);
    expect(parseDailyInfo({ ...info, seed: "daily-2026-09-25" })).toBeNull();
    expect(parseDailyInfo({ ...info, day: "26/09/2026" })).toBeNull();
  });

  it("builds the offline fallback from the device's UTC day", () => {
    expect(localDailyInfo(new Date("2026-09-26T23:30:00-05:00"))).toEqual({
      day: "2026-09-27",
      seed: "daily-2026-09-27",
      resetsAt: "2026-09-28T00:00:00.000Z",
    });
  });
});

describe("parseDailySaveResult", () => {
  const saved = {
    saved: true,
    day: "2026-09-26",
    peakY: 812.5,
    improved: true,
    rank: 4,
    totalClimbers: 41,
    attempts: 2,
  };

  it("reads a verified save", () => {
    expect(parseDailySaveResult(200, saved)).toEqual({
      status: "saved",
      day: "2026-09-26",
      peakY: 812.5,
      improved: true,
      rank: 4,
      totalClimbers: 41,
      attempts: 2,
    });
    expect(parseDailySaveResult(200, { ...saved, rank: null })).toMatchObject({ status: "saved", rank: null });
  });

  it("separates not-saved, rejected and retryable failures", () => {
    expect(parseDailySaveResult(200, { saved: false, reason: "no_consent" })).toEqual({
      status: "not_saved",
      reason: "no_consent",
    });
    expect(parseDailySaveResult(400, { error: "x", code: "REPLAY_MISMATCH" })).toEqual({
      status: "rejected",
      code: "REPLAY_MISMATCH",
    });
    expect(parseDailySaveResult(429, { code: "RATE_LIMITED" })).toEqual({ status: "failed" });
    expect(parseDailySaveResult(500, { saved: false, reason: "persist_error" })).toEqual({ status: "failed" });
  });

  it("treats a 200 that breaks the contract as a failure, not a save", () => {
    expect(parseDailySaveResult(200, { ...saved, peakY: -1 })).toEqual({ status: "failed" });
    expect(parseDailySaveResult(200, { ...saved, day: undefined })).toEqual({ status: "failed" });
    expect(parseDailySaveResult(200, { ...saved, attempts: 0 })).toEqual({ status: "failed" });
    expect(parseDailySaveResult(200, null)).toEqual({ status: "failed" });
  });
});
