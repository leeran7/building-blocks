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
 * Must comfortably exceed one snapshot interval (~3.75 ticks at 8 Hz) plus
 * network jitter so the interpolation target normally lands between the two
 * buffered samples rather than clamping to the latest.
 */
export const GHOST_RENDER_DELAY_TICKS = 6;

export class GhostStore {
  /** Per-slot ring of the last two samples, oldest first. */
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
    if (sample.tick < last.tick) return; // stale / reordered — ignore
    arr.push(sample);
    if (arr.length > 2) arr.shift();
  }

  /**
   * Interpolated position for `slot` at `localClimbTick`, rendered
   * GHOST_RENDER_DELAY_TICKS behind. Returns null when nothing has arrived yet
   * (caller should leave that player at its spawn / last-known local state).
   */
  sampleAt(slot: number, localClimbTick: number): GhostSample | null {
    const arr = this.bySlot.get(slot);
    if (!arr || arr.length === 0) return null;
    if (arr.length === 1) return arr[0];

    const [a, b] = arr;
    // Once a peer reports finished/eliminated, hold that terminal position.
    if (b.status !== "climbing") return b;

    const target = localClimbTick - GHOST_RENDER_DELAY_TICKS;
    if (target <= a.tick) return a; // clamp behind the older sample
    if (target >= b.tick) return b; // clamp — never extrapolate past the latest

    const span = b.tick - a.tick;
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

  /** Drop all buffered ghosts (e.g. on rematch / new race). */
  clear(): void {
    this.bySlot.clear();
  }
}
