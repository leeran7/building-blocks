/**
 * GhostStore — interpolation, smoothing + clamping for the independent-sim
 * netcode.
 */

import { describe, it, expect } from "vitest";
import {
  GhostStore,
  GHOST_RENDER_DELAY_TICKS,
  MAX_EXTRAPOLATE_TICKS,
} from "../../src/game/ghosts";
import type { RealtimeSnapshotMessage } from "../../src/net/realtime";

const D = GHOST_RENDER_DELAY_TICKS;

function snap(over: Partial<RealtimeSnapshotMessage> & { slot: number; tick: number }): RealtimeSnapshotMessage {
  return {
    x: 0,
    y: 0,
    status: "climbing",
    peakY: 0,
    slowLavaActive: false,
    ...over,
  };
}

/**
 * Call sampleAt repeatedly until the exponential smoothing has converged
 * within `epsilon` of the raw value. Returns the converged sample.
 */
function sampleUntilConverged(
  store: GhostStore,
  slot: number,
  localTick: number,
  epsilon = 0.05,
  maxIters = 200
) {
  let s = store.sampleAt(slot, localTick);
  for (let i = 0; i < maxIters && s; i++) {
    const prev = s;
    s = store.sampleAt(slot, localTick);
    if (
      s &&
      Math.abs(s.x - prev.x) < epsilon &&
      Math.abs(s.y - prev.y) < epsilon
    )
      break;
  }
  return s;
}

describe("GhostStore", () => {
  it("returns null for a slot with no snapshots", () => {
    const store = new GhostStore();
    expect(store.sampleAt(1, 100)).toBeNull();
  });

  it("returns the sole sample when only one has arrived", () => {
    const store = new GhostStore();
    store.ingest(snap({ slot: 1, tick: 0, x: 5, y: 50 }));
    const s = store.sampleAt(1, 100);
    expect(s).not.toBeNull();
    expect(s!.x).toBe(5);
    expect(s!.y).toBe(50);
  });

  it("converges toward the linearly interpolated position at the delayed target", () => {
    const store = new GhostStore();
    store.ingest(snap({ slot: 1, tick: 0, x: 0, y: 100 }));
    store.ingest(snap({ slot: 1, tick: 8, x: 8, y: 180 }));
    // target = localTick - D; pick localTick so target lands halfway (=4).
    const s = sampleUntilConverged(store, 1, 4 + D);
    expect(s!.x).toBeCloseTo(4, 0);
    expect(s!.y).toBeCloseTo(140, 0);
  });

  it("brackets the correct pair among 4 buffered samples, including the oldest pair", () => {
    const store = new GhostStore();
    store.ingest(snap({ slot: 1, tick: 0, x: 0, y: 0 }));
    store.ingest(snap({ slot: 1, tick: 4, x: 40, y: 0 }));
    store.ingest(snap({ slot: 1, tick: 8, x: 80, y: 0 }));
    store.ingest(snap({ slot: 1, tick: 12, x: 120, y: 0 }));
    // Converge smoothing so we can assert on the raw interpolated value.
    const s = sampleUntilConverged(store, 1, 2 + D);
    expect(s!.x).toBeCloseTo(20, 0);
  });

  it("clamps behind the older sample (no backward extrapolation)", () => {
    const store = new GhostStore();
    store.ingest(snap({ slot: 1, tick: 10, x: 10, y: 100 }));
    store.ingest(snap({ slot: 1, tick: 18, x: 18, y: 180 }));
    // target = 0 → before the older sample (tick 10) → clamp to it.
    const s = sampleUntilConverged(store, 1, D);
    expect(s!.x).toBeCloseTo(10, 0);
    expect(s!.y).toBeCloseTo(100, 0);
  });

  it("dead-reckons a short way past the newest sample using last-two velocity", () => {
    const store = new GhostStore();
    store.ingest(snap({ slot: 1, tick: 0, x: 0, y: 100 }));
    store.ingest(snap({ slot: 1, tick: 8, x: 8, y: 180 }));
    // Velocity is +1 x/tick, +10 y/tick. Aim a few ticks past newest (tick 8),
    // within the extrapolation cap: target = 11 → 3 ticks of overshoot.
    const s = sampleUntilConverged(store, 1, 11 + D);
    expect(s!.x).toBeCloseTo(11, 0);
    expect(s!.y).toBeCloseTo(210, 0);
  });

  it("caps dead-reckoning at MAX_EXTRAPOLATE_TICKS so a stalled peer can't drift off", () => {
    const store = new GhostStore();
    store.ingest(snap({ slot: 1, tick: 0, x: 0, y: 100 }));
    store.ingest(snap({ slot: 1, tick: 8, x: 8, y: 180 }));
    // target far beyond newest → extrapolation clamps to the cap, not the target.
    const s = sampleUntilConverged(store, 1, 100 + D);
    expect(s!.x).toBeCloseTo(8 + MAX_EXTRAPOLATE_TICKS, 0); // 8 + 1×8 = 16
    expect(s!.y).toBeCloseTo(180 + 10 * MAX_EXTRAPOLATE_TICKS, 0); // 180 + 80 = 260
  });

  it("holds the terminal position once a peer is eliminated/finished", () => {
    const store = new GhostStore();
    store.ingest(snap({ slot: 1, tick: 0, x: 0, y: 100 }));
    store.ingest(snap({ slot: 1, tick: 8, x: 8, y: 180, status: "eliminated" }));
    // Even at an interpolatable target, a terminal newest sample is held as-is.
    const s = store.sampleAt(1, 4 + D);
    expect(s!.status).toBe("eliminated");
    expect(s!.x).toBe(8);
    expect(s!.y).toBe(180);
  });

  it("ignores stale (out-of-order) arrivals", () => {
    const store = new GhostStore();
    store.ingest(snap({ slot: 1, tick: 10, x: 10, y: 100 }));
    store.ingest(snap({ slot: 1, tick: 3, x: 3, y: 30 })); // older — dropped
    const s = store.sampleAt(1, 100);
    expect(s!.x).toBeCloseTo(10, 0);
  });

  it("clear() drops all buffered ghosts and smoothing state", () => {
    const store = new GhostStore();
    store.ingest(snap({ slot: 1, tick: 0, x: 1, y: 1 }));
    store.clear();
    expect(store.sampleAt(1, 100)).toBeNull();
  });

  it("smoothing absorbs small snap-backs without large teleport jumps", () => {
    const store = new GhostStore();
    // Establish a position via a few samples moving right.
    store.ingest(snap({ slot: 1, tick: 0, x: 0, y: 0 }));
    store.ingest(snap({ slot: 1, tick: 4, x: 2, y: 0 }));
    // Let smoothing settle.
    sampleUntilConverged(store, 1, 4 + D);

    // Now a late snapshot arrives that's behind the dead-reckoned position.
    // The smoothing should prevent an instant snap-back.
    store.ingest(snap({ slot: 1, tick: 6, x: 1.5, y: 0 }));
    const first = store.sampleAt(1, 6 + D);
    // Smoothed position should be between old displayed (~2) and new raw (~1.5),
    // not snapping all the way to 1.5 in a single tick.
    expect(first).not.toBeNull();
    expect(first!.x).toBeGreaterThan(1.5);
  });
});
