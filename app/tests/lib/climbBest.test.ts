/**
 * The device-local endless best behind the mid-run "New best!" callout.
 *
 * @vitest-environment happy-dom
 */

import { beforeEach, describe, expect, it } from "vitest";
import { clearClimbBest, commitClimbBest, readClimbBest } from "../../src/lib/climbBest";

const KEY = "doomstack:climb-best";

describe("climb best", () => {
  beforeEach(() => localStorage.clear());

  it("starts at 0 and only ever rises", () => {
    expect(readClimbBest()).toBe(0);
    expect(commitClimbBest(80)).toBe(0);
    expect(readClimbBest()).toBe(80);
    expect(commitClimbBest(40)).toBe(80);
    expect(readClimbBest()).toBe(80);
    expect(commitClimbBest(120.5)).toBe(80);
    expect(readClimbBest()).toBe(120.5);
  });

  it("rejects a hand-edited value rather than trusting it", () => {
    for (const bad of ["abc", "-5", "Infinity", "NaN"]) {
      localStorage.setItem(KEY, bad);
      expect(readClimbBest()).toBe(0);
    }
    localStorage.setItem(KEY, "64");
    expect(readClimbBest()).toBe(64);
  });

  it("never records a non-finite peak", () => {
    commitClimbBest(Number.POSITIVE_INFINITY);
    expect(readClimbBest()).toBe(0);
  });

  it("clears on account deletion", () => {
    commitClimbBest(90);
    clearClimbBest();
    expect(readClimbBest()).toBe(0);
  });
});
