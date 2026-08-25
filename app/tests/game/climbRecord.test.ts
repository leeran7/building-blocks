/**
 * Tower v3 "The Climb" — monotonic peak-record tests (AC-30 / AC-31).
 * The record is only ever raised, never lowered.
 */

import { describe, it, expect } from "vitest";
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
