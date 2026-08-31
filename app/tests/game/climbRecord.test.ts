/**
 * Tower v3 "The Climb" — monotonic peak-record tests (AC-30 / AC-31).
 * The record is only ever raised, never lowered.
 *
 * climb.ts also uses `react.cache` for getShareableClimbRun. That export is not
 * a function in vitest's node `react` build, so identity-mock it here in order
 * to import `nextPeak` without changing production.
 */

import { describe, it, expect, vi } from "vitest";

vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  return {
    ...actual,
    cache: <T extends (...args: never[]) => unknown>(fn: T) => fn,
  };
});

import { nextPeak } from "../../src/db/climb";

describe("AC-30 / AC-31: peak-height record is monotonic", () => {
  it("raises the record when a run beats the prior best (AC-30)", () => {
    const r = nextPeak(120, 180);
    expect(r.peakY).toBe(180);
    expect(r.improved).toBe(true);
  });

  it("keeps the record when a run is lower than the prior best (AC-31)", () => {
    const r = nextPeak(200, 150);
    expect(r.peakY).toBe(200);
    expect(r.improved).toBe(false);
  });

  it("equals prior best on a tie (no improvement)", () => {
    const r = nextPeak(200, 200);
    expect(r.peakY).toBe(200);
    expect(r.improved).toBe(false);
  });

  it("treats a first-ever run as an improvement from 0", () => {
    const r = nextPeak(0, 75);
    expect(r.peakY).toBe(75);
    expect(r.improved).toBe(true);
  });

  it("never returns a negative peak", () => {
    const r = nextPeak(0, -10);
    expect(r.peakY).toBe(0);
    expect(r.improved).toBe(false);
  });
});
