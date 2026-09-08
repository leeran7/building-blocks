/**
 * GhostStore — interpolation + clamping for the independent-sim netcode.
 */

import { describe, it, expect } from "vitest";
import { GhostStore, GHOST_RENDER_DELAY_TICKS } from "../../src/game/ghosts";
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

  it("clamps behind the older sample (no backward extrapolation)", () => {
    const store = new GhostStore();
    store.ingest(snap({ slot: 1, tick: 10, x: 10, y: 100 }));
    store.ingest(snap({ slot: 1, tick: 18, x: 18, y: 180 }));
    // target = 0 → before the older sample (tick 10) → clamp to it.
    const s = store.sampleAt(1, D);
    expect(s!.x).toBe(10);
    expect(s!.y).toBe(100);
  });

  it("clamps to the latest sample (never extrapolates past newest)", () => {
    const store = new GhostStore();
    store.ingest(snap({ slot: 1, tick: 0, x: 0, y: 100 }));
    store.ingest(snap({ slot: 1, tick: 8, x: 8, y: 180 }));
    // target well beyond the newest tick → clamp to newest.
    const s = store.sampleAt(1, 100 + D);
    expect(s!.x).toBe(8);
    expect(s!.y).toBe(180);
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
