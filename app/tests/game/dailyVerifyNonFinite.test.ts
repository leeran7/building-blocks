/**
 * SEC-DC-5: `Math.abs(NaN - x) > eps` is false, so a NaN peak slipped past
 * both tolerance checks in verifyDailyReplay, and Postgres GREATEST ranks NaN
 * above every number, which would pin it at #1 for the day. The real sim cannot
 * produce NaN today, so the simulation is stubbed here to return a chosen
 * peak. verifyDailyReplay itself is the real unit.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const sim = vi.hoisted(() => ({ peakY: 0 }));

vi.mock("../../src/game/simulation", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../src/game/simulation")>();
  return {
    ...actual,
    simulateFromInputs: vi.fn(() => ({ phase: "climb", players: [{ peakY: sim.peakY, status: "dead" }] })),
  };
});

import { verifyDailyReplay } from "../../src/game/dailyVerify";
import type { RunReplay } from "../../src/game/runReplay";
import { dailySeedFor } from "../../src/lib/dailyDay";

const DAY = "2026-09-26";
const MIDDAY = new Date(`${DAY}T12:00:00Z`);
const IDLE = { moveX: 0, jump: false, climbY: 0, usePowerUp: false } as const;

function replayWithPeak(peakY: number): RunReplay {
  return { version: 1, seed: dailySeedFor(DAY), peakY, inputs: [IDLE, IDLE, IDLE] };
}

beforeEach(() => {
  sim.peakY = 0;
});

describe("verifyDailyReplay rejects non-finite peaks (SEC-DC-5)", () => {
  it("positive control: a finite server peak that matches the claim is accepted", () => {
    sim.peakY = 5;
    expect(verifyDailyReplay(replayWithPeak(5), 5, MIDDAY)).toMatchObject({ ok: true, peakY: 5 });
  });

  it.each([Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])(
    "rejects a server peak of %s even when the claim and token look normal",
    (serverPeak) => {
      sim.peakY = serverPeak;
      expect(verifyDailyReplay(replayWithPeak(5), 5, MIDDAY)).toMatchObject({ ok: false, code: "REPLAY_MISMATCH" });
      expect(verifyDailyReplay(replayWithPeak(5), null, MIDDAY)).toMatchObject({ ok: false, code: "REPLAY_MISMATCH" });
    },
  );

  it.each([Number.NaN, Number.POSITIVE_INFINITY])("rejects a token peak of %s even with a matching finite claim", (tokenPeak) => {
    sim.peakY = 5;
    expect(verifyDailyReplay(replayWithPeak(tokenPeak), 5, MIDDAY)).toMatchObject({
      ok: false,
      code: "REPLAY_MISMATCH",
    });
  });

  it("rejects a NaN client claim", () => {
    sim.peakY = 5;
    expect(verifyDailyReplay(replayWithPeak(5), Number.NaN, MIDDAY)).toMatchObject({
      ok: false,
      code: "REPLAY_MISMATCH",
    });
  });
});
