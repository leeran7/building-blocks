/**
 * dailyInputSegments counts over the canonical packed bytes (SEC-DC-15,
 * verifier). Every field the packing keeps must be able to start a segment on
 * its own, and nothing the packing drops may add one. The expected counts are
 * written out by hand, never recomputed with a second counter.
 */

import { describe, expect, it } from "vitest";
import { dailyInputHash, dailyInputSegments } from "../../src/game/dailyVerify";
import { packInputLog, unpackInputLog } from "../../src/game/runReplay";
import type { PlayerInput } from "../../src/game/types";

const still: PlayerInput = { moveX: 0, jump: false, climbY: 0, usePowerUp: false };
const run = (input: Partial<PlayerInput>, n: number): PlayerInput[] =>
  Array.from({ length: n }, () => ({ ...still, ...input }));

describe("dailyInputSegments: each packed field splits a segment on its own", () => {
  it("climbY alone (up, none, up, down) makes 4 segments", () => {
    const log = [...run({ climbY: 1 }, 5), ...run({ climbY: 0 }, 5), ...run({ climbY: 1 }, 5), ...run({ climbY: -1 }, 5)];
    expect(dailyInputSegments(log)).toBe(4);
  });

  it("jump alone makes 4 segments", () => {
    const log = [...run({ jump: true }, 3), ...run({}, 3), ...run({ jump: true }, 3), ...run({}, 3)];
    expect(dailyInputSegments(log)).toBe(4);
  });

  it("moveX alone (left, none, right, left) makes 4 segments", () => {
    const log = [...run({ moveX: -1 }, 2), ...run({}, 2), ...run({ moveX: 1 }, 2), ...run({ moveX: -1 }, 2)];
    expect(dailyInputSegments(log)).toBe(4);
  });

  it("a single-tick blip is its own segment, and a return to an earlier input is a new one", () => {
    expect(dailyInputSegments([...run({ climbY: 1 }, 50), { ...still, climbY: 1, jump: true }, ...run({ climbY: 1 }, 50)])).toBe(3);
  });

  it("the last tick changing adds a segment; a change only in usePowerUp does not", () => {
    const base = run({ climbY: 1 }, 20);
    expect(dailyInputSegments([...base, { ...still, climbY: -1 }])).toBe(2);
    expect(dailyInputSegments([...base, { ...still, climbY: 1, usePowerUp: true }])).toBe(1);
  });
});

describe("dailyInputSegments depends only on the bytes dailyInputHash hashes", () => {
  it("any two logs with the same hash have the same count (round trip through the packed bytes)", () => {
    // Fixed pseudo-random logs covering every packed value; usePowerUp is set at random too.
    let r = 7;
    const next = () => (r = (r * 48271) % 2147483647);
    let checked = 0;
    for (let n = 1; n <= 40; n++) {
      const log: PlayerInput[] = Array.from({ length: n * 3 }, () => ({
        moveX: ((next() % 3) - 1) as -1 | 0 | 1,
        jump: next() % 2 === 0,
        climbY: ((next() % 3) - 1) as -1 | 0 | 1,
        usePowerUp: next() % 2 === 0,
      }));
      const canonical = unpackInputLog(packInputLog(log));
      expect(dailyInputHash(canonical)).toBe(dailyInputHash(log));
      expect(dailyInputSegments(canonical)).toBe(dailyInputSegments(log));
      checked++;
    }
    expect(checked).toBe(40);
  });
});
