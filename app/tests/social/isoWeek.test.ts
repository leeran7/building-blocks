import { describe, it, expect } from "vitest";
import { toIsoWeekString, currentIsoWeek, previousIsoWeek, nextIsoWeek, isoWeekBounds } from "../../src/social/isoWeek";

describe("isoWeek", () => {
  it("formats a known date as an ISO week string", () => {
    // 2026-01-05 is a Monday in ISO week 2026-W02
    expect(toIsoWeekString(new Date("2026-01-05T12:00:00Z"))).toBe("2026-W02");
  });

  it("previousIsoWeek and nextIsoWeek are inverses around a week", () => {
    const week = "2026-W20";
    expect(nextIsoWeek(previousIsoWeek(week))).toBe(week);
    expect(previousIsoWeek(nextIsoWeek(week))).toBe(week);
  });

  it("isoWeekBounds spans exactly 7 days", () => {
    const { start, end } = isoWeekBounds("2026-W10");
    expect(end.getTime() - start.getTime()).toBe(7 * 86400000);
  });

  it("currentIsoWeek returns a YYYY-Www string", () => {
    expect(currentIsoWeek()).toMatch(/^\d{4}-W\d{2}$/);
  });
});
