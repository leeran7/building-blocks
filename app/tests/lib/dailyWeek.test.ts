/**
 * computeWeekDays — pure, total week-strip builder for the /daily streak
 * strip (AC-22, AC-26). Invoked directly and its return value asserted;
 * no source-text greps, no re-implementation of the calendar math.
 */

import { describe, it, expect } from "vitest";
import { computeWeekDays } from "../../src/lib/daily";

// Wednesday 2026-09-16 12:00 local — mid-week reference so both "past this
// week" and "future this week" days exist around it.
const WED = new Date(2026, 8, 16, 12, 0, 0);

describe("computeWeekDays", () => {
  it("always returns 7 entries, Sunday through Saturday, for the week containing now", () => {
    const days = computeWeekDays({}, null, WED);
    expect(days).toHaveLength(7);
    expect(days.map((d) => d.weekday)).toEqual([
      "Sunday",
      "Monday",
      "Tuesday",
      "Wednesday",
      "Thursday",
      "Friday",
      "Saturday",
    ]);
    // Sunday 2026-09-13 -> Saturday 2026-09-19.
    expect(days.map((d) => d.key)).toEqual([
      "2026-09-13",
      "2026-09-14",
      "2026-09-15",
      "2026-09-16",
      "2026-09-17",
      "2026-09-18",
      "2026-09-19",
    ]);
  });

  it("marks exactly one entry isToday, and it is the correct day", () => {
    const days = computeWeekDays({}, null, WED);
    const todays = days.filter((d) => d.isToday);
    expect(todays).toHaveLength(1);
    expect(todays[0].key).toBe("2026-09-16");
  });

  it("played is true only for keys present in best, or equal to lastPlayedKey", () => {
    const best = { "2026-09-14": 120, "2026-09-15": 80 };
    const days = computeWeekDays(best, "2026-09-16", WED);
    const played = days.filter((d) => d.played).map((d) => d.key);
    expect(played.sort()).toEqual(["2026-09-14", "2026-09-15", "2026-09-16"]);
    // Every other day in the week must read unplayed.
    const unplayed = days.filter((d) => !d.played).map((d) => d.key);
    expect(unplayed.sort()).toEqual([
      "2026-09-13",
      "2026-09-17",
      "2026-09-18",
      "2026-09-19",
    ]);
  });

  it("a day outside the current week is correctly absent (calendar week, not rolling 7-day window)", () => {
    // "Last Wednesday" (2026-09-09) has a recorded best, but is not in the
    // week containing WED (2026-09-16) and must not appear as played.
    const best = { "2026-09-09": 999 };
    const days = computeWeekDays(best, null, WED);
    expect(days.some((d) => d.key === "2026-09-09")).toBe(false);
    expect(days.every((d) => !d.played)).toBe(true);
  });

  it("lastPlayedKey alone (no best entry) still marks that day played — a run that never beat 0", () => {
    const days = computeWeekDays({}, "2026-09-14", WED);
    const day = days.find((d) => d.key === "2026-09-14");
    expect(day?.played).toBe(true);
  });

  it("is pure: calling it twice with the same arguments returns equal results", () => {
    const a = computeWeekDays({ "2026-09-14": 1 }, "2026-09-14", WED);
    const b = computeWeekDays({ "2026-09-14": 1 }, "2026-09-14", WED);
    expect(a).toEqual(b);
  });
});
