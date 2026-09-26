/**
 * Daily Climb day arithmetic (src/lib/dailyDay.ts) and the board `?day=`
 * resolver (src/lib/dailyBoardDay.ts). Every function is invoked and its
 * output asserted; negative guards are proven against inputs they must reject.
 */

import { describe, expect, it } from "vitest";
import {
  DAILY_BOARD_HISTORY_DAYS,
  DAILY_SUBMIT_GRACE_MS,
  MS_PER_DAY,
  dailySeedFor,
  dayKeyFromSeed,
  daysBetween,
  isReadableBoardDay,
  migrateLocalDayKeys,
  msSinceUtcReset,
  msUntilUtcReset,
  nextUtcResetAt,
  parseDayKey,
  shiftDayKey,
  submissionDayForSeed,
  utcDayKey,
} from "../../src/lib/dailyDay";
import { resolveBoardDay } from "../../src/lib/dailyBoardDay";

const at = (iso: string) => new Date(iso);

describe("utcDayKey", () => {
  it("uses the UTC calendar day, not the local one", () => {
    expect(utcDayKey(at("2026-09-26T23:59:59.999Z"))).toBe("2026-09-26");
    expect(utcDayKey(at("2026-09-27T00:00:00.000Z"))).toBe("2026-09-27");
    // 2026-09-26 20:00 in UTC-8 is already the 27th in UTC.
    expect(utcDayKey(at("2026-09-26T20:00:00-08:00"))).toBe("2026-09-27");
  });

  it("accepts epoch milliseconds", () => {
    expect(utcDayKey(Date.UTC(2024, 1, 29, 12))).toBe("2024-02-29");
  });
});

describe("reset timing", () => {
  it("counts down to the next 00:00 UTC", () => {
    expect(msUntilUtcReset(at("2026-09-26T23:00:00Z"))).toBe(3_600_000);
    expect(msUntilUtcReset(at("2026-09-26T00:00:00Z"))).toBe(MS_PER_DAY);
    expect(nextUtcResetAt(at("2026-09-26T15:27:01Z")).toISOString()).toBe("2026-09-27T00:00:00.000Z");
  });

  it("measures time since the last reset", () => {
    expect(msSinceUtcReset(at("2026-09-26T00:05:00Z"))).toBe(5 * 60_000);
    expect(msSinceUtcReset(at("2026-09-26T00:00:00Z"))).toBe(0);
  });
});

describe("parseDayKey", () => {
  it("accepts real calendar dates in YYYY-MM-DD", () => {
    expect(parseDayKey("2026-09-26")).toBe("2026-09-26");
    expect(parseDayKey("2024-02-29")).toBe("2024-02-29");
    expect(parseDayKey("2026-12-31")).toBe("2026-12-31");
  });

  it("rejects impossible dates instead of rolling them over", () => {
    expect(parseDayKey("2026-02-29")).toBeNull();
    expect(parseDayKey("2026-02-30")).toBeNull();
    expect(parseDayKey("2026-04-31")).toBeNull();
    expect(parseDayKey("2026-13-01")).toBeNull();
    expect(parseDayKey("2026-00-10")).toBeNull();
    expect(parseDayKey("2026-01-00")).toBeNull();
  });

  it("rejects every other shape and type", () => {
    for (const bad of ["2026-9-26", "26-09-2026", " 2026-09-26", "2026-09-26 ", "2026-09-26T00:00", "", "today"]) {
      expect(parseDayKey(bad)).toBeNull();
    }
    for (const bad of [null, undefined, 20260926, {}, ["2026-09-26"]]) {
      expect(parseDayKey(bad)).toBeNull();
    }
    // Date.UTC maps two-digit years to 19xx; the round-trip must catch it.
    expect(parseDayKey("0099-01-01")).toBeNull();
  });
});

describe("day key arithmetic", () => {
  it("shifts across month and year boundaries", () => {
    expect(shiftDayKey("2026-03-01", -1)).toBe("2026-02-28");
    expect(shiftDayKey("2024-03-01", -1)).toBe("2024-02-29");
    expect(shiftDayKey("2026-12-31", 1)).toBe("2027-01-01");
  });

  it("counts whole days between keys", () => {
    expect(daysBetween("2026-09-19", "2026-09-26")).toBe(7);
    expect(daysBetween("2026-09-26", "2026-09-19")).toBe(-7);
  });

  it("builds and recovers the daily seed", () => {
    expect(dailySeedFor("2026-09-26")).toBe("daily-2026-09-26");
    expect(dayKeyFromSeed("daily-2026-09-26")).toBe("2026-09-26");
    expect(dayKeyFromSeed("daily-2026-02-30")).toBeNull();
    expect(dayKeyFromSeed("solo-abc")).toBeNull();
    expect(dayKeyFromSeed("xdaily-2026-09-26")).toBeNull();
  });
});

describe("submissionDayForSeed", () => {
  const today = "2026-09-26";
  const yesterday = "2026-09-25";

  it("accepts today's tower at any time of day", () => {
    expect(submissionDayForSeed(dailySeedFor(today), at("2026-09-26T00:00:00Z"))).toBe(today);
    expect(submissionDayForSeed(dailySeedFor(today), at("2026-09-26T23:59:59Z"))).toBe(today);
  });

  it("accepts yesterday's tower only inside the grace window", () => {
    const edge = new Date(Date.parse("2026-09-26T00:00:00Z") + DAILY_SUBMIT_GRACE_MS);
    expect(submissionDayForSeed(dailySeedFor(yesterday), at("2026-09-26T00:05:00Z"))).toBe(yesterday);
    expect(submissionDayForSeed(dailySeedFor(yesterday), edge)).toBe(yesterday);
    expect(submissionDayForSeed(dailySeedFor(yesterday), new Date(edge.getTime() + 1))).toBeNull();
    expect(submissionDayForSeed(dailySeedFor(yesterday), at("2026-09-26T12:00:00Z"))).toBeNull();
  });

  it("rejects older, future and non-daily towers", () => {
    const now = at("2026-09-26T00:01:00Z");
    expect(submissionDayForSeed(dailySeedFor("2026-09-24"), now)).toBeNull();
    expect(submissionDayForSeed(dailySeedFor("2026-09-27"), now)).toBeNull();
    expect(submissionDayForSeed("solo", now)).toBeNull();
    expect(submissionDayForSeed(`${dailySeedFor(today)} `, now)).toBeNull();
  });
});

describe("board day window", () => {
  const now = at("2026-09-26T10:00:00Z");

  it("reads today and the previous 7 days only", () => {
    expect(isReadableBoardDay("2026-09-26", now)).toBe(true);
    expect(isReadableBoardDay(shiftDayKey("2026-09-26", -DAILY_BOARD_HISTORY_DAYS), now)).toBe(true);
    expect(isReadableBoardDay(shiftDayKey("2026-09-26", -DAILY_BOARD_HISTORY_DAYS - 1), now)).toBe(false);
    expect(isReadableBoardDay("2026-09-27", now)).toBe(false);
  });

  it("resolveBoardDay defaults an absent day to today and 400s the rest", () => {
    expect(resolveBoardDay(null, now)).toEqual({ ok: true, day: "2026-09-26" });
    expect(resolveBoardDay("2026-09-20", now)).toEqual({ ok: true, day: "2026-09-20" });
    expect(resolveBoardDay("2026-09-18", now)).toMatchObject({ ok: false, code: "DAY_OUT_OF_RANGE" });
    expect(resolveBoardDay("2026-09-27", now)).toMatchObject({ ok: false, code: "DAY_OUT_OF_RANGE" });
    expect(resolveBoardDay("2026-02-30", now)).toMatchObject({ ok: false, code: "INVALID_DAY" });
    expect(resolveBoardDay("", now)).toMatchObject({ ok: false, code: "INVALID_DAY" });
  });
});

describe("migrateLocalDayKeys", () => {
  it("clamps a last-played key that is ahead of the UTC day (east of UTC)", () => {
    const out = migrateLocalDayKeys("2026-09-27", { "2026-09-27": 50 }, "2026-09-26");
    expect(out.lastPlayedKey).toBe("2026-09-26");
    // The future-dated best was set on a different tower; it is dropped.
    expect(out.best).toEqual({});
  });

  it("keeps past and present keys as they are (west of UTC)", () => {
    const best = { "2026-09-24": 10, "2026-09-25": 20, "2026-09-26": 30 };
    const out = migrateLocalDayKeys("2026-09-25", best, "2026-09-26");
    expect(out.lastPlayedKey).toBe("2026-09-25");
    expect(out.best).toEqual(best);
  });

  it("drops malformed keys and a malformed last-played value", () => {
    const out = migrateLocalDayKeys("yesterday", { "not-a-day": 5, "2026-09-26": 7 }, "2026-09-26");
    expect(out.lastPlayedKey).toBeNull();
    expect(out.best).toEqual({ "2026-09-26": 7 });
  });
});

// ---------------------------------------------------------------------------
// Verifier additions: the UTC midnight edge, and the allow-list parser against
// every shape the brief names (plus the positive fixtures that must survive).
// ---------------------------------------------------------------------------

describe("UTC midnight edge", () => {
  const justBefore = at("2026-09-26T23:59:59.999Z");
  const midnight = at("2026-09-27T00:00:00.000Z");
  const justAfter = at("2026-09-27T00:00:00.001Z");

  it("rolls the day key over exactly at 00:00:00.000 UTC", () => {
    expect(utcDayKey(justBefore)).toBe("2026-09-26");
    expect(utcDayKey(midnight)).toBe("2026-09-27");
    expect(utcDayKey(justAfter)).toBe("2026-09-27");
  });

  it("counts down to 1 ms before the reset and restarts at a full day", () => {
    expect(msUntilUtcReset(justBefore)).toBe(1);
    expect(msUntilUtcReset(midnight)).toBe(MS_PER_DAY);
    expect(msUntilUtcReset(justAfter)).toBe(MS_PER_DAY - 1);
    expect(msSinceUtcReset(justBefore)).toBe(MS_PER_DAY - 1);
    expect(msSinceUtcReset(justAfter)).toBe(1);
    expect(nextUtcResetAt(justBefore).toISOString()).toBe("2026-09-27T00:00:00.000Z");
    expect(nextUtcResetAt(midnight).toISOString()).toBe("2026-09-28T00:00:00.000Z");
  });

  it("handles the year boundary and a leap day", () => {
    expect(utcDayKey(at("2026-12-31T23:59:59.999Z"))).toBe("2026-12-31");
    expect(utcDayKey(at("2027-01-01T00:00:00.000Z"))).toBe("2027-01-01");
    expect(msUntilUtcReset(at("2028-02-29T23:59:59.999Z"))).toBe(1);
    expect(utcDayKey(at("2028-02-29T23:59:59.999Z"))).toBe("2028-02-29");
  });

  it("works for instants before 1970 (negative epoch ms)", () => {
    expect(utcDayKey(at("1969-12-31T23:59:59.999Z"))).toBe("1969-12-31");
    expect(msUntilUtcReset(at("1969-12-31T23:59:59.999Z"))).toBe(1);
  });
});

describe("parseDayKey allow-list (verifier fixtures)", () => {
  const REJECT: unknown[] = [
    "__proto__",
    "constructor",
    "hasOwnProperty",
    "2026-13-01",
    "2026-02-30",
    "2025-02-29",
    "2100-02-29",
    "",
    " ",
    "\t\n",
    "2026-9-1",
    "2026-09-1",
    "2026-9-01",
    "20260926",
    "2026/09/26",
    "2026-09-26\n",
    "​2026-09-26",
    "２０２６-09-26",
    "+2026-09-26",
    "-2026-09-26",
    "12026-09-26",
    "2026-09-26Z",
    0,
    1_790_000_000_000,
    Number.NaN,
    true,
    false,
    null,
    undefined,
    Symbol("2026-09-26"),
    new Date("2026-09-26T00:00:00Z"),
    { toString: () => "2026-09-26" },
    ["2026-09-26"],
    Object.create(null),
  ];

  const ACCEPT = ["2026-09-26", "2026-01-01", "2026-12-31", "2024-02-29", "2000-02-29", "1970-01-01", "9999-12-31"];

  it("rejects every negative fixture with null (never a default)", () => {
    let checked = 0;
    for (const bad of REJECT) {
      expect(parseDayKey(bad), `input ${String(typeof bad === "symbol" ? "symbol" : JSON.stringify(bad))}`).toBeNull();
      checked++;
    }
    expect(checked).toBe(REJECT.length);
    expect(checked).toBeGreaterThan(0);
  });

  it("returns each positive fixture unchanged", () => {
    let checked = 0;
    for (const good of ACCEPT) {
      expect(parseDayKey(good)).toBe(good);
      checked++;
    }
    expect(checked).toBeGreaterThan(0);
  });

  it("dayKeyFromSeed inherits the same strictness", () => {
    expect(dayKeyFromSeed("daily-__proto__")).toBeNull();
    expect(dayKeyFromSeed("daily-2026-9-1")).toBeNull();
    expect(dayKeyFromSeed("daily-")).toBeNull();
    expect(dayKeyFromSeed("daily-2026-09-26")).toBe("2026-09-26");
  });

  it("migrateLocalDayKeys ignores a JSON-parsed __proto__ key", () => {
    const best = JSON.parse('{"__proto__": 99, "2026-09-26": 4}') as Record<string, number>;
    const out = migrateLocalDayKeys("__proto__", best, "2026-09-26");
    expect(out.lastPlayedKey).toBeNull();
    expect(Object.keys(out.best)).toEqual(["2026-09-26"]);
    expect(Object.getPrototypeOf(out.best)).toBe(Object.prototype);
  });
});

describe("day acceptance at the grace edges (verifier)", () => {
  const reset = Date.parse("2026-09-27T00:00:00Z");
  const today = "2026-09-27";
  const yesterday = "2026-09-26";

  it("accepts today's tower at the first and last millisecond of the day", () => {
    expect(submissionDayForSeed(dailySeedFor(today), reset)).toBe(today);
    expect(submissionDayForSeed(dailySeedFor(today), reset + MS_PER_DAY - 1)).toBe(today);
  });

  it("accepts yesterday's tower up to the grace edge, and not 1 ms later", () => {
    expect(submissionDayForSeed(dailySeedFor(yesterday), reset)).toBe(yesterday);
    expect(submissionDayForSeed(dailySeedFor(yesterday), reset + 5 * 60_000)).toBe(yesterday);
    expect(submissionDayForSeed(dailySeedFor(yesterday), reset + DAILY_SUBMIT_GRACE_MS)).toBe(yesterday);
    expect(submissionDayForSeed(dailySeedFor(yesterday), reset + DAILY_SUBMIT_GRACE_MS + 1)).toBeNull();
    expect(submissionDayForSeed(dailySeedFor(yesterday), reset + 11 * 60_000)).toBeNull();
  });

  it("rejects tomorrow's tower even 1 ms before its reset", () => {
    expect(submissionDayForSeed(dailySeedFor(today), reset - 1)).toBeNull();
    expect(submissionDayForSeed(dailySeedFor("2026-09-28"), reset + MS_PER_DAY - 1)).toBeNull();
  });

  it("rejects the tower from 2 days ago, even inside the grace window", () => {
    expect(submissionDayForSeed(dailySeedFor("2026-09-25"), reset)).toBeNull();
    expect(submissionDayForSeed(dailySeedFor("2026-09-25"), reset + 60_000)).toBeNull();
  });

  it("the grace window is 10 minutes", () => {
    expect(DAILY_SUBMIT_GRACE_MS).toBe(10 * 60_000);
  });
});
