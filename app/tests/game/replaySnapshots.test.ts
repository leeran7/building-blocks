/**
 * Replay snapshot seek — parity against headless stepMatch oracle (AC-6).
 */

import { describe, it, expect } from "vitest";
import {
  ReplaySnapshotCache,
  headlessReplayAtTick,
} from "../../src/game/replaySnapshots";
import {
  createMatch,
  stepMatch,
  DEFAULT_SIM_CONFIG,
} from "../../src/game/simulation";
import { applyRunSeed, buildTower } from "../../src/game/towers";
import { NO_INPUT, type PlayerInput } from "../../src/game/types";
import { SNAPSHOT_INTERVAL_TICKS } from "../../src/game/replayTransport";

const TOWER = buildTower("indie-games");
const SEED = "replay-snap-test";
const PLAYER = "you";

function oracleAt(
  inputs: readonly PlayerInput[],
  target: number
) {
  const state = createMatch({
    seed: SEED,
    mode: "solo",
    tower: applyRunSeed(TOWER, SEED),
    playerIds: [PLAYER],
  });
  let guard = 200;
  while (state.phase === "countdown" && guard-- > 0) {
    stepMatch(state, {}, DEFAULT_SIM_CONFIG);
  }
  for (let i = 0; i < target; i++) {
    if (state.phase === "finished" || state.phase === "results") break;
    const input = inputs[state.tick] ?? NO_INPUT;
    stepMatch(state, { [PLAYER]: input }, DEFAULT_SIM_CONFIG);
  }
  return state;
}

function idleInputs(n: number): PlayerInput[] {
  return Array.from({ length: n }, () => ({ ...NO_INPUT }));
}

describe("ReplaySnapshotCache", () => {
  it("uses snapshot interval 120", () => {
    expect(SNAPSHOT_INTERVAL_TICKS).toBe(120);
  });

  it("seek(0) matches headless countdown-drained tick 0", () => {
    const inputs = idleInputs(300);
    const cache = new ReplaySnapshotCache({
      tower: TOWER,
      seed: SEED,
      inputs,
    });
    const got = cache.seek(0);
    const expectState = oracleAt(inputs, 0);
    expect(got.phase).toBe("climb");
    expect(got.tick).toBe(0);
    expect(got.players[0].y).toBe(expectState.players[0].y);
    expect(got.players[0].peakY).toBe(expectState.players[0].peakY);
  });

  it("seek matches oracle for y and peakY across interval boundaries", () => {
    const inputs = idleInputs(400);
    // Mild rightward walk so state is non-trivial.
    for (let i = 0; i < inputs.length; i++) {
      inputs[i] = {
        moveX: i % 3 === 0 ? 1 : 0,
        jump: false,
        climbY: 0,
        usePowerUp: false,
      };
    }
    const cache = new ReplaySnapshotCache({
      tower: TOWER,
      seed: SEED,
      inputs,
    });
    for (const target of [0, 1, 119, 120, 121, 250, 360]) {
      const got = cache.seekToTick(target);
      const expectState = oracleAt(inputs, target);
      expect(got.players[0].y).toBe(expectState.players[0].y);
      expect(got.players[0].peakY).toBe(expectState.players[0].peakY);
      expect(got.tick).toBe(expectState.tick);
    }
  });

  it("rewind step of 150 lands on max(0, T-150) with oracle parity", () => {
    const inputs = idleInputs(400);
    const cache = new ReplaySnapshotCache({
      tower: TOWER,
      seed: SEED,
      inputs,
    });
    const t = 200;
    const rewound = Math.max(0, t - 150);
    const got = cache.seek(rewound);
    const expectState = headlessReplayAtTick(TOWER, SEED, inputs, rewound);
    expect(rewound).toBe(50);
    expect(got.players[0].y).toBe(expectState.players[0].y);
    expect(got.players[0].peakY).toBe(expectState.players[0].peakY);
  });

  it("does not mutate stored snapshots when seeking twice", () => {
    const inputs = idleInputs(200);
    const cache = new ReplaySnapshotCache({
      tower: TOWER,
      seed: SEED,
      inputs,
    });
    const a = cache.seek(50);
    a.players[0].y = 9999;
    const b = cache.seek(50);
    expect(b.players[0].y).not.toBe(9999);
    expect(b.players[0].y).toBe(oracleAt(inputs, 50).players[0].y);
  });

  it("clamps seek(N) to N−1 (AC-7 domain)", () => {
    const inputs = idleInputs(100);
    const cache = new ReplaySnapshotCache({
      tower: TOWER,
      seed: SEED,
      inputs,
    });
    const n = inputs.length;
    const atN = cache.seek(n);
    const atLast = cache.seek(n - 1);
    expect(atN.tick).toBe(atLast.tick);
    expect(atN.players[0].y).toBe(atLast.players[0].y);
    expect(atN.players[0].peakY).toBe(atLast.players[0].peakY);
    const oracle = oracleAt(inputs, n - 1);
    expect(atN.tick).toBe(oracle.tick);
  });
});

/**
 * Regression: useClimb's live rAF loop must only push a tick's input onto
 * inputLog while phase === "climb". simulation.ts documents the contract
 * (COUNTDOWN_TICKS docblock) that inputLog[0] is climb-tick 0 — recording
 * during countdown too shifts every real input forward by COUNTDOWN_TICKS,
 * so a shared/saved replay desyncs from what actually happened live (a run
 * that climbed hundreds of feet would die almost immediately on replay).
 */
describe("live-recording contract (AC-11): inputLog excludes countdown ticks", () => {
  /**
   * Mirrors useClimb's rAF loop: one continuous stepMatch per tick across
   * countdown + climb. Snapshots are keyed by climb-tick T = number of climb
   * steps taken so far, matching ReplaySnapshotCache.seek(T)'s contract.
   */
  function recordLiveRun(
    seed: string,
    maxTicks: number,
    input: (climbTick: number) => PlayerInput,
    onlyClimbPhase: boolean
  ) {
    const state = createMatch({
      seed,
      mode: "solo",
      tower: applyRunSeed(TOWER, seed),
      playerIds: [PLAYER],
    });
    const inputLog: PlayerInput[] = [];
    const snapshotsByClimbTick: { y: number; peakY: number }[] = [];
    for (let i = 0; i < maxTicks; i++) {
      if (state.phase === "finished" || state.phase === "results") break;
      if (state.phase === "climb") {
        snapshotsByClimbTick[state.tick] = {
          y: state.players[0].y,
          peakY: state.players[0].peakY,
        };
      }
      const tickInput = state.phase === "climb" ? input(state.tick) : NO_INPUT;
      if (state.phase === "climb" || !onlyClimbPhase) inputLog.push(tickInput);
      stepMatch(state, { [PLAYER]: tickInput }, DEFAULT_SIM_CONFIG);
    }
    return { inputLog, snapshotsByClimbTick };
  }

  const seed = "live-record-contract";
  const walkClimb = (t: number): PlayerInput => ({
    moveX: t % 40 < 8 ? 1 : 0,
    jump: t % 25 === 0,
    climbY: 1,
    usePowerUp: false,
  });

  it("a correctly-recorded log replays to the same end state via ReplaySnapshotCache", () => {
    const { inputLog, snapshotsByClimbTick } = recordLiveRun(
      seed,
      2000,
      walkClimb,
      true
    );
    const cache = new ReplaySnapshotCache({
      tower: TOWER,
      seed,
      inputs: inputLog,
    });
    const target = inputLog.length - 1;
    const replayed = cache.seek(target);
    const expected = snapshotsByClimbTick[target];
    expect(replayed.players[0].y).toBe(expected.y);
    expect(replayed.players[0].peakY).toBe(expected.peakY);
  });

  it("recording countdown ticks too (the bug) desyncs the replay from the live run", () => {
    const { inputLog: buggyLog, snapshotsByClimbTick } = recordLiveRun(
      seed,
      2000,
      walkClimb,
      false
    );
    const cache = new ReplaySnapshotCache({
      tower: TOWER,
      seed,
      inputs: buggyLog,
    });
    const target = buggyLog.length - 1;
    const replayed = cache.seek(target);
    // The buggy log is padded with COUNTDOWN_TICKS leading NO_INPUTs, so
    // every real input lands COUNTDOWN_TICKS late — the replay ends up
    // somewhere else entirely than what actually happened live.
    const expected = snapshotsByClimbTick[Math.min(target, snapshotsByClimbTick.length - 1)];
    expect(replayed.players[0].y).not.toBe(expected.y);
  });
});
