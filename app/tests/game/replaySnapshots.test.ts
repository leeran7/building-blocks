/**
 * Replay snapshot seek — parity against headless stepMatch oracle (AC-6).
 */

import { describe, it, expect } from "vitest";
import {
  ReplaySnapshotCache,
  headlessReplayAtTick,
} from "../../src/game/replaySnapshots";
import { createMatch, stepMatch, DEFAULT_SIM_CONFIG } from "../../src/game/simulation";
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
});
