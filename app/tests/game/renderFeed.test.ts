/**
 * Render feed — the sim steps at 30 Hz, the display refreshes faster, and the
 * gap between the two is what made the climb read as stuttery. These cover the
 * seams where interpolating would be wrong (run start, replay seek, respawn)
 * and must fall back to the authoritative tick instead.
 */

import { describe, expect, it } from "vitest";
import {
  emptySample,
  interpolateFrame,
  sampleInterp,
  type RenderFrame,
} from "../../src/game/renderFeed";
import { createMatch } from "../../src/game/simulation";
import { buildTower } from "../../src/game/towers";
import { MatchState, TICK_DT } from "../../src/game/types";

const TICK_MS = TICK_DT * 1000;
const STEP_TS = 1000;

function matchAt(tick: number, positions: [number, number][]): MatchState {
  const m = createMatch({
    seed: "render-feed",
    mode: "solo",
    tower: buildTower("indie-games"),
    playerIds: positions.map((_, i) => `p${i}`),
  });
  m.phase = "climb";
  m.tick = tick;
  m.hazardY = tick;
  positions.forEach(([x, y], i) => {
    m.players[i].x = x;
    m.players[i].y = y;
  });
  return m;
}

/** A frame whose previous tick sits one step behind `state`. */
function frameFrom(prevState: MatchState, state: MatchState): RenderFrame {
  return {
    state,
    prev: sampleInterp(prevState, emptySample()),
    stepTs: STEP_TS,
  };
}

describe("interpolateFrame: walks the tick the wall clock is inside", () => {
  it("draws the midpoint half a tick after the step", () => {
    const frame = frameFrom(matchAt(4, [[10, 20]]), matchAt(5, [[10.4, 21]]));
    const out = interpolateFrame(frame, STEP_TS + TICK_MS / 2);
    expect(out.players[0].x).toBeCloseTo(10.2);
    expect(out.players[0].y).toBeCloseTo(20.5);
  });

  it("draws the previous tick at the instant of the step", () => {
    const frame = frameFrom(matchAt(4, [[10, 20]]), matchAt(5, [[10.4, 21]]));
    const out = interpolateFrame(frame, STEP_TS);
    expect(out.players[0].y).toBeCloseTo(20);
  });

  it("converges on the current tick as the tick runs out", () => {
    const cur = matchAt(5, [[10.4, 21]]);
    const frame = frameFrom(matchAt(4, [[10, 20]]), cur);
    const out = interpolateFrame(frame, STEP_TS + TICK_MS);
    expect(out.players[0].y).toBeCloseTo(21, 10);
  });

  it("holds the last tick when the sim stalls (backgrounded tab)", () => {
    const cur = matchAt(5, [[10.4, 21]]);
    const frame = frameFrom(matchAt(4, [[10, 20]]), cur);
    // Never extrapolates past the authoritative tick, however long the gap.
    expect(interpolateFrame(frame, STEP_TS + TICK_MS * 40)).toBe(cur);
  });

  it("interpolates the lava line and the tick alongside positions", () => {
    const frame = frameFrom(matchAt(4, [[0, 0]]), matchAt(5, [[0, 0]]));
    const out = interpolateFrame(frame, STEP_TS + TICK_MS / 4);
    expect(out.hazardY).toBeCloseTo(4.25);
    // Limb swing, lava crest and embers are all continuous in tick, so a
    // fractional tick smooths them the same way lerped positions smooth motion.
    expect(out.tick).toBeCloseTo(4.25);
  });

  it("never mutates the authoritative state it was handed", () => {
    const cur = matchAt(5, [[10.4, 21]]);
    const frame = frameFrom(matchAt(4, [[10, 20]]), cur);
    interpolateFrame(frame, STEP_TS + TICK_MS / 2);
    expect(cur.players[0].x).toBe(10.4);
    expect(cur.players[0].y).toBe(21);
    expect(cur.tick).toBe(5);
    expect(cur.hazardY).toBe(5);
  });
});

describe("interpolateFrame: falls back to the exact tick at a seam", () => {
  it("paints the raw state on the first frame of a run", () => {
    const cur = matchAt(0, [[10, 20]]);
    const frame: RenderFrame = { state: cur, prev: null, stepTs: STEP_TS };
    expect(interpolateFrame(frame, STEP_TS + TICK_MS / 2)).toBe(cur);
  });

  it("paints the raw state when the gap is not one tick (seek / phase reset)", () => {
    const cur = matchAt(0, [[10, 20]]);
    const frame = frameFrom(matchAt(90, [[10, 20]]), cur);
    expect(interpolateFrame(frame, STEP_TS + TICK_MS / 2)).toBe(cur);
  });

  it("paints the raw state when the roster size changed", () => {
    const cur = matchAt(5, [
      [0, 0],
      [1, 1],
    ]);
    const frame = frameFrom(matchAt(4, [[0, 0]]), cur);
    expect(interpolateFrame(frame, STEP_TS + TICK_MS / 2)).toBe(cur);
  });

  it("snaps a teleported climber without desmoothing the others", () => {
    // Slot 0 respawns across the tower; slot 1 is just climbing. Lerping slot 0
    // would drag it through the level, but slot 1 must keep its smoothing.
    const frame = frameFrom(
      matchAt(4, [
        [10, 200],
        [10, 20],
      ]),
      matchAt(5, [
        [10, 0],
        [10, 21],
      ])
    );
    const out = interpolateFrame(frame, STEP_TS + TICK_MS / 2);
    expect(out.players[0].y).toBe(0);
    expect(out.players[1].y).toBeCloseTo(20.5);
  });
});

describe("sampleInterp: reused buffer, no per-tick allocation", () => {
  it("overwrites the same arrays rather than growing them", () => {
    const buf = emptySample();
    const xs = buf.x;
    sampleInterp(matchAt(4, [[1, 2]]), buf);
    sampleInterp(
      matchAt(5, [
        [3, 4],
        [5, 6],
      ]),
      buf
    );
    expect(buf.x).toBe(xs);
    expect(buf.tick).toBe(5);
    expect(buf.x).toEqual([3, 5]);
    expect(buf.y).toEqual([4, 6]);
  });

  it("shrinks when the roster does, so stale slots cannot be read back", () => {
    const buf = emptySample();
    sampleInterp(
      matchAt(4, [
        [1, 2],
        [3, 4],
      ]),
      buf
    );
    sampleInterp(matchAt(5, [[7, 8]]), buf);
    expect(buf.x).toEqual([7]);
    expect(buf.y).toEqual([8]);
  });
});
