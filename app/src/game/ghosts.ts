/**
 * Ghost store for the independent-sim ("ghost") netcode.
 *
 * Each client runs its OWN climb at full speed and broadcasts periodic position
 * snapshots (see RealtimeSnapshotMessage). This store buffers each peer's last
 * few snapshots and interpolates a smoothed position for a given local tick,
 * rendered a fixed delay behind "now" so we interpolate between two known
 * samples instead of extrapolating into the unknown.
 *
 * Ghosts are display-only: they drive the on-screen opponents and the local
 * shared-hazard estimate, never the authoritative result (that comes from the
 * server re-sim of every player's input log).
 *
 * Smoothing: raw interpolation/extrapolation is blended toward the previously
 * displayed position via an exponential smoothing factor. This absorbs snap-
 * backs from dead-reckoning corrections and segment jumps when a new snapshot
 * shifts the interpolation window, trading a tiny bit of responsiveness for
 * much less visible jitter.
 */

import type { PlayerStatus } from "./types";
import type { RealtimeSnapshotMessage } from "../net/realtime";

export interface GhostSample {
  tick: number;
  x: number;
  y: number;
  status: PlayerStatus;
  peakY: number;
  slowLavaActive: boolean;
}

/**
 * How far behind local time peers are rendered, in ticks (~133 ms at 30 Hz).
 * With ~30 Hz snapshots (every tick) this gives 4 snapshot intervals of
 * buffer, so the interpolation target reliably lands between two known samples
 * even under typical network jitter.
 */
export const GHOST_RENDER_DELAY_TICKS = 4;

/** How many samples to keep per slot. 6 widens the interpolation window. */
const RING_SIZE = 6;

/**
 * Max extrapolation past the latest sample, in ticks. Caps dead-reckoning so a
 * stalled peer (no snapshots arriving) doesn't drift off-screen.
 * ~4 snapshot intervals at ~15 Hz = 8 ticks ≈ 267 ms.
 */
export const MAX_EXTRAPOLATE_TICKS = 8;

/**
 * Exponential smoothing factor applied each tick (0 = no smoothing, 1 = frozen).
 * 0.20 absorbs snap-backs from dead-reckoning correction and segment jumps
 * while keeping opponent motion responsive at ~30 Hz snapshot rate.
 */
const SMOOTH_FACTOR = 0.20;

/**
 * If the raw sample jumps more than this many world-units from the last
 * displayed position, skip smoothing and snap immediately (e.g. a teleport or
 * the very first sample). Prevents the ghost from "dragging" across the map.
 */
const SNAP_THRESHOLD = 3;

export class GhostStore {
  /** Per-slot ring of the last RING_SIZE samples, oldest first. */
  private readonly bySlot = new Map<number, GhostSample[]>();
  /** Per-slot last displayed (smoothed) position, for exponential blending. */
  private readonly lastDisplayed = new Map<number, { x: number; y: number }>();

  /** Absorb a peer snapshot. Out-of-order (stale) arrivals are dropped. */
  ingest(m: RealtimeSnapshotMessage): void {
    const sample: GhostSample = {
      tick: m.tick,
      x: m.x,
      y: m.y,
      status: m.status,
      peakY: m.peakY,
      slowLavaActive: m.slowLavaActive,
    };
    const arr = this.bySlot.get(m.slot);
    if (!arr) {
      this.bySlot.set(m.slot, [sample]);
      return;
    }
    const last = arr[arr.length - 1];
    if (sample.tick <= last.tick) return; // stale / reordered — ignore
    arr.push(sample);
    if (arr.length > RING_SIZE) arr.shift();
  }

  /**
   * Interpolated (or dead-reckoned) position for `slot` at `localClimbTick`,
   * rendered GHOST_RENDER_DELAY_TICKS behind. Returns null when nothing has
   * arrived yet (caller leaves the player at last-known local state).
   *
   * Interpolation: linear between the two samples bracketing `target`.
   * Extrapolation: dead-reckoning past the latest sample using the velocity of
   *   the last two samples, capped at MAX_EXTRAPOLATE_TICKS to avoid divergence.
   *
   * The result is exponentially smoothed toward the previously displayed
   * position so direction changes and snapshot-arrival jitter don't produce
   * visible snap-backs.
   */
  sampleAt(slot: number, localClimbTick: number): GhostSample | null {
    const arr = this.bySlot.get(slot);
    if (!arr || arr.length === 0) return null;

    const last = arr[arr.length - 1];

    // Once a peer reports finished/eliminated, hold that terminal position.
    if (last.status !== "climbing") {
      this.lastDisplayed.set(slot, { x: last.x, y: last.y });
      return last;
    }

    if (arr.length === 1) {
      this.lastDisplayed.set(slot, { x: arr[0].x, y: arr[0].y });
      return arr[0];
    }

    const target = localClimbTick - GHOST_RENDER_DELAY_TICKS;
    const oldest = arr[0];
    const newest = arr[arr.length - 1];

    if (target <= oldest.tick) {
      this.lastDisplayed.set(slot, { x: oldest.x, y: oldest.y });
      return oldest;
    }

    let a = oldest;
    let b = arr[1];
    if (target > newest.tick) {
      // Past the latest sample — use the last two for extrapolation velocity.
      a = arr[arr.length - 2];
      b = newest;
    } else {
      // Interpolation: scan for the two consecutive samples bracketing target.
      // target is known to be within [oldest, newest] here, so this always
      // finds a pair before exiting the loop.
      for (let i = 0; i < arr.length - 1; i++) {
        if (arr[i].tick <= target && arr[i + 1].tick >= target) {
          a = arr[i];
          b = arr[i + 1];
          break;
        }
      }
    }

    const span = b.tick - a.tick;
    let rawX: number;
    let rawY: number;
    let rawTick: number;

    // Interpolation: target is between a and b.
    if (target <= b.tick) {
      const t = span > 0 ? (target - a.tick) / span : 1;
      rawX = a.x + (b.x - a.x) * t;
      rawY = a.y + (b.y - a.y) * t;
      rawTick = target;
    } else {
      // Dead-reckoning: target is past the latest sample.
      const overshot = Math.min(target - b.tick, MAX_EXTRAPOLATE_TICKS);
      if (span <= 0 || overshot <= 0) {
        this.lastDisplayed.set(slot, { x: b.x, y: b.y });
        return b;
      }
      const t = overshot / span;
      rawX = b.x + (b.x - a.x) * t;
      rawY = b.y + (b.y - a.y) * t;
      rawTick = b.tick + overshot;
    }

    // Exponential smoothing: blend toward the last displayed position to absorb
    // snap-backs from dead-reckoning correction and segment jumps.
    const prev = this.lastDisplayed.get(slot);
    let smoothX = rawX;
    let smoothY = rawY;
    if (prev) {
      const dx = Math.abs(rawX - prev.x);
      const dy = Math.abs(rawY - prev.y);
      if (dx < SNAP_THRESHOLD && dy < SNAP_THRESHOLD) {
        smoothX = prev.x + (rawX - prev.x) * (1 - SMOOTH_FACTOR);
        smoothY = prev.y + (rawY - prev.y) * (1 - SMOOTH_FACTOR);
      }
    }
    this.lastDisplayed.set(slot, { x: smoothX, y: smoothY });

    return {
      tick: rawTick,
      x: smoothX,
      y: smoothY,
      status: "climbing",
      peakY: Math.max(a.peakY, b.peakY),
      slowLavaActive: b.slowLavaActive,
    };
  }

  /** Drop all buffered ghosts (e.g. on rematch / new race). */
  clear(): void {
    this.bySlot.clear();
    this.lastDisplayed.clear();
  }
}
