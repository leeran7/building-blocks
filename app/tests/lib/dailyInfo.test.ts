/**
 * The shared GET /api/climb/daily contract (RV-DC-5) and the staleness rule
 * that makes "Play again" after 00:00 UTC refetch the tower (RV-DC-3).
 * Every rejection is shown against a body that parses once the defect is
 * removed.
 */

import { describe, expect, it, vi } from "vitest";
import {
  classifyDailyResponse,
  isDailyInfoStale,
  parseDailyInfo,
  readDailyResponse,
  type DailyInfo,
} from "../../src/lib/dailyInfo";
import { GET } from "../../app/api/climb/daily/route";
import { TEST_DAILY_SEED_SECRET } from "./dailySeedTestSecret";

const SEED = "daily1-AbCdEfGhIjKlMnOpQrSt_-";
const INFO: DailyInfo = { day: "2026-09-26", seed: SEED, resetsAt: "2026-09-27T00:00:00.000Z" };

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

  it("accepts a consistent body and returns only the three contract fields", () => {
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

describe("isDailyInfoStale", () => {
  const reset = Date.parse(INFO.resetsAt);

  it("is stale once the server's reset has passed since the fetch", () => {
    expect(isDailyInfoStale(INFO, reset - 60_000, reset)).toBe(true);
    expect(isDailyInfoStale(INFO, reset - 60_000, reset + 3_600_000)).toBe(true);
  });

  it("is fresh before the reset", () => {
    expect(isDailyInfoStale(INFO, reset - 60_000, reset - 1)).toBe(false);
  });

  it("a device clock ahead of the server refetches once, then plays what the server said (no loop)", () => {
    // Fetched after the device's reset, but the server still named the old day.
    expect(isDailyInfoStale(INFO, reset + 30_000, reset + 60_000)).toBe(false);
  });
});

describe("classifyDailyResponse: unavailable vs offline", () => {
  it("reads the real route's 503 as unavailable when the secret is missing or short", async () => {
    for (const value of ["", "x".repeat(31)]) {
      vi.stubEnv("DAILY_SEED_SECRET", value);
      try {
        const res = GET();
        expect(res.status).toBe(503);
        expect(await readDailyResponse(res)).toEqual({ failure: "unavailable" });
      } finally {
        vi.unstubAllEnvs();
      }
    }
  });

  it("reads the real route's 200 as the tower", async () => {
    vi.stubEnv("DAILY_SEED_SECRET", TEST_DAILY_SEED_SECRET);
    try {
      const res = GET();
      const body: unknown = await res.clone().json();
      expect(await readDailyResponse(res)).toEqual({ info: parseDailyInfo(body) });
      expect(parseDailyInfo(body)).not.toBeNull();
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("only the exact 503 contract is unavailable; every other failure is offline", () => {
    const unavailable = { error: "x", code: "DAILY_UNAVAILABLE" };
    expect(classifyDailyResponse(503, unavailable)).toEqual({ failure: "unavailable" });
    expect(classifyDailyResponse(500, unavailable)).toEqual({ failure: "offline" });
    expect(classifyDailyResponse(503, { code: "OTHER" })).toEqual({ failure: "offline" });
    expect(classifyDailyResponse(503, null)).toEqual({ failure: "offline" });
    expect(classifyDailyResponse(502, "Bad gateway")).toEqual({ failure: "offline" });
  });

  it("a 200 with a malformed body is offline, never a tower", () => {
    expect(classifyDailyResponse(200, INFO)).toEqual({ info: INFO });
    expect(classifyDailyResponse(200, { ...INFO, seed: "nope" })).toEqual({ failure: "offline" });
  });

  it("a non-JSON body is offline", async () => {
    const res = new Response("<html>gateway</html>", { status: 503 });
    expect(await readDailyResponse(res)).toEqual({ failure: "offline" });
  });
});
