/**
 * Ghost store for the independent-sim ("ghost") netcode.
 *
 * Each client runs its OWN climb at full speed and broadcasts periodic position
 * snapshots (see RealtimeSnapshotMessage). This store buffers each peer's last
 * two snapshots and interpolates a smoothed position for a given local tick,
 * rendered a fixed delay behind "now" so we interpolate between two known
 * samples instead of extrapolating into the unknown.
 *
 * Ghosts are display-only: they drive the on-screen opponents and the local
 * shared-hazard estimate, never the authoritative result (that comes from the
 * server re-sim of every player's input log).
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
 * How far behind local time peers are rendered, in ticks (~200 ms at 30 Hz).
 * With 15 Hz snapshots (every 2 ticks) this gives 3 snapshot intervals of
 * buffer, so the interpolation target reliably lands between two known samples
 * even under typical network jitter.
 */
export const GHOST_RENDER_DELAY_TICKS = 6;

/** How many samples to keep per slot. 4 gives a richer velocity history. */
const RING_SIZE = 4;

/**
 * Max extrapolation past the latest sample, in ticks. Caps dead-reckoning so a
 * stalled peer (no snapshots arriving) doesn't drift off-screen.
 * ~3 snapshot intervals at 15 Hz = 6 ticks ≈ 200 ms.
 */
const MAX_EXTRAPOLATE_TICKS = 6;

export class GhostStore {
  /** Per-slot ring of the last RING_SIZE samples, oldest first. */
  private readonly bySlot = new Map<number, GhostSample[]>();

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
   */
  sampleAt(slot: number, localClimbTick: number): GhostSample | null {
    const arr = this.bySlot.get(slot);
    if (!arr || arr.length === 0) return null;

    const last = arr[arr.length - 1];

    // Once a peer reports finished/eliminated, hold that terminal position.
    if (last.status !== "climbing") return last;

    if (arr.length === 1) return arr[0];

    const target = localClimbTick - GHOST_RENDER_DELAY_TICKS;

    // Find the two samples that bracket `target`.
    let a = arr[0];
    let b = arr[1];
    for (let i = 1; i < arr.length - 1; i++) {
      if (arr[i].tick <= target && arr[i + 1].tick >= target) {
        a = arr[i];
        b = arr[i + 1];
        break;
      }
      // No bracket found yet — use the last two for interpolation/extrapolation.
      a = arr[arr.length - 2];
      b = arr[arr.length - 1];
    }

    if (target <= a.tick) return a; // clamp behind oldest relevant sample

    const span = b.tick - a.tick;

    // Interpolation: target is between a and b.
    if (target <= b.tick) {
      const t = span > 0 ? (target - a.tick) / span : 1;
      return {
        tick: target,
        x: a.x + (b.x - a.x) * t,
        y: a.y + (b.y - a.y) * t,
        status: "climbing",
        peakY: Math.max(a.peakY, b.peakY),
        slowLavaActive: b.slowLavaActive,
      };
    }

    // Dead-reckoning: target is past the latest sample.
    // Extrapolate using b-a velocity, capped to avoid divergence.
    const overshot = Math.min(target - b.tick, MAX_EXTRAPOLATE_TICKS);
    if (span <= 0 || overshot <= 0) return b;
    const t = overshot / span;
    return {
      tick: b.tick + overshot,
      x: b.x + (b.x - a.x) * t,
      y: b.y + (b.y - a.y) * t,
      status: "climbing",
      peakY: b.peakY,
      slowLavaActive: b.slowLavaActive,
    };
  }

  /** Drop all buffered ghosts (e.g. on rematch / new race). */
  clear(): void {
    this.bySlot.clear();
  }
}
