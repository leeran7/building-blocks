/**
 * formatElapsed — m:ss readout for the matchmaking status bar's elapsed
 * timer (AC-9). Invoked directly and asserted; no re-implementation.
 */

import { describe, it, expect } from "vitest";
import { formatElapsed } from "../../src/components/Duel/DuelHome";

describe("formatElapsed", () => {
  it("0 seconds", () => {
    expect(formatElapsed(0)).toBe("0:00");
  });

  it("72 seconds -> 1:12", () => {
    expect(formatElapsed(72)).toBe("1:12");
  });

  it("59 seconds stays under a minute", () => {
    expect(formatElapsed(59)).toBe("0:59");
  });

  it("60 seconds rolls over to a minute", () => {
    expect(formatElapsed(60)).toBe("1:00");
  });

  it("negative input clamps to 0:00", () => {
    expect(formatElapsed(-5)).toBe("0:00");
  });

  it("NaN input clamps to 0:00", () => {
    expect(formatElapsed(NaN)).toBe("0:00");
  });

  it("Infinity input clamps to 0:00", () => {
    expect(formatElapsed(Infinity)).toBe("0:00");
  });

  it("-Infinity input clamps to 0:00", () => {
    expect(formatElapsed(-Infinity)).toBe("0:00");
  });

  it("fractional seconds are floored, not rounded", () => {
    expect(formatElapsed(72.9)).toBe("1:12");
  });
});
