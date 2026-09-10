/**
 * GhostStore — interpolation + clamping for the independent-sim netcode.
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

  it("linearly interpolates between the two buffered samples at the delayed target", () => {
    const store = new GhostStore();
    store.ingest(snap({ slot: 1, tick: 0, x: 0, y: 100 }));
    store.ingest(snap({ slot: 1, tick: 8, x: 8, y: 180 }));
    // target = localTick - D; pick localTick so target lands halfway (=4).
    const s = store.sampleAt(1, 4 + D);
    expect(s!.x).toBeCloseTo(4);
    expect(s!.y).toBeCloseTo(140);
  });

  it("brackets the correct pair among 4 buffered samples, including the oldest pair", () => {
    const store = new GhostStore();
    // Four samples spanning ticks 0/4/8/12. A target that falls in the FIRST
    // pair (0-4) regressed to the wrong segment when the bracket loop started
    // at i=1 instead of i=0 — it would fall through to the last-two samples.
    store.ingest(snap({ slot: 1, tick: 0, x: 0, y: 0 }));
    store.ingest(snap({ slot: 1, tick: 4, x: 40, y: 0 }));
    store.ingest(snap({ slot: 1, tick: 8, x: 80, y: 0 }));
    store.ingest(snap({ slot: 1, tick: 12, x: 120, y: 0 }));
    const s = store.sampleAt(1, 2 + D); // target = 2, inside the 0-4 pair
    expect(s!.x).toBeCloseTo(20); // interpolated within [0,40], not the 8-12 pair
  });

  it("clamps behind the older sample (no backward extrapolation)", () => {
    const store = new GhostStore();
    store.ingest(snap({ slot: 1, tick: 10, x: 10, y: 100 }));
    store.ingest(snap({ slot: 1, tick: 18, x: 18, y: 180 }));
    // target = 0 → before the older sample (tick 10) → clamp to it.
    const s = store.sampleAt(1, D);
    expect(s!.x).toBe(10);
    expect(s!.y).toBe(100);
  });

  it("dead-reckons a short way past the newest sample using last-two velocity", () => {
    const store = new GhostStore();
    store.ingest(snap({ slot: 1, tick: 0, x: 0, y: 100 }));
    store.ingest(snap({ slot: 1, tick: 8, x: 8, y: 180 }));
    // Velocity is +1 x/tick, +10 y/tick. Aim a few ticks past newest (tick 8),
    // within the extrapolation cap: target = 11 → 3 ticks of overshoot.
    const s = store.sampleAt(1, 11 + D);
    expect(s!.x).toBeCloseTo(11); // 8 + 1×3
    expect(s!.y).toBeCloseTo(210); // 180 + 10×3
  });

  it("caps dead-reckoning at MAX_EXTRAPOLATE_TICKS so a stalled peer can't drift off", () => {
    const store = new GhostStore();
    store.ingest(snap({ slot: 1, tick: 0, x: 0, y: 100 }));
    store.ingest(snap({ slot: 1, tick: 8, x: 8, y: 180 }));
    // target far beyond newest → extrapolation clamps to the cap, not the target.
    const s = store.sampleAt(1, 100 + D);
    expect(s!.x).toBeCloseTo(8 + MAX_EXTRAPOLATE_TICKS); // 8 + 1×6 = 14
    expect(s!.y).toBeCloseTo(180 + 10 * MAX_EXTRAPOLATE_TICKS); // 180 + 60 = 240
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
    expect(s!.x).toBe(10); // still the tick-10 sample, not the stale tick-3
  });

  it("clear() drops all buffered ghosts", () => {
    const store = new GhostStore();
    store.ingest(snap({ slot: 1, tick: 0, x: 1, y: 1 }));
    store.clear();
    expect(store.sampleAt(1, 100)).toBeNull();
  });
});
