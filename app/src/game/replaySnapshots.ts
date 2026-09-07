/**
 * Climb-tick snapshot cache for deterministic replay seek/rewind.
 * Interval 120 (ADR-1): clone nearest floor snapshot, step ≤119 forward.
 */

import { MAX_SHARE_TICKS } from "./runReplay";
import { cloneMatchState } from "./cloneMatch";
import { SNAPSHOT_INTERVAL_TICKS } from "./replayTransport";
import {
  createMatch,
  stepMatch,
  DEFAULT_SIM_CONFIG,
  type SimConfig,
} from "./simulation";
import { applyRunSeed } from "./towers";
import type { MatchState, PlayerInput, TowerSpec } from "./types";
import { NO_INPUT } from "./types";

const PLAYER_ID = "you";

export { cloneMatchState };

export class ReplaySnapshotCache {
  private readonly tower: TowerSpec;
  private readonly seed: string;
  private readonly inputs: readonly PlayerInput[];
  private readonly cfg: SimConfig;
  private readonly interval: number;
  private readonly maxKeys: number;
  /** Climb-tick → deep-cloned MatchState after countdown + k climb steps. */
  private readonly snaps = new Map<number, MatchState>();

  constructor(args: {
    tower: TowerSpec;
    seed: string;
    inputs: readonly PlayerInput[];
    cfg?: SimConfig;
    intervalTicks?: number;
  }) {
    this.tower = args.tower;
    this.seed = args.seed;
    this.inputs = args.inputs;
    this.cfg = args.cfg ?? DEFAULT_SIM_CONFIG;
    this.interval = args.intervalTicks ?? SNAPSHOT_INTERVAL_TICKS;
    this.maxKeys = Math.ceil(MAX_SHARE_TICKS / this.interval) + 1;
  }

  /**
   * Return a fresh MatchState at the given climb tick (caller installs it).
   * Never mutates a stored snapshot.
   */
  seek(targetClimbTick: number): MatchState {
    const n = this.inputs.length;
    // AC-7 domain is climb ticks [0, N−1]; never step to N.
    const target = clampInt(targetClimbTick, 0, Math.max(0, n - 1));
    const base = Math.floor(target / this.interval) * this.interval;
    const baseState = this.ensureSnapshot(base);
    const working = cloneMatchState(baseState);
    this.stepClimb(working, target - base);
    return working;
  }

  /** Alias for seek — architecture + implementer brief. */
  seekToTick(targetClimbTick: number): MatchState {
    return this.seek(targetClimbTick);
  }

  invalidate(): void {
    this.snaps.clear();
  }

  private ensureSnapshot(climbTick: number): MatchState {
    const key = Math.max(0, climbTick);
    const hit = this.snaps.get(key);
    if (hit) return hit;

    if (key === 0) {
      const zero = this.buildClimbTickZero();
      this.store(0, zero);
      return zero;
    }

    const prevKey = key - this.interval;
    const prev = this.ensureSnapshot(Math.max(0, prevKey));
    const working = cloneMatchState(prev);
    this.stepClimb(working, key - Math.max(0, prevKey));
    this.store(key, working);
    return working;
  }

  private store(key: number, state: MatchState): void {
    // Cap cardinality (kernel: unbounded cache keys are a leak).
    if (this.snaps.size >= this.maxKeys && !this.snaps.has(key)) {
      const first = this.snaps.keys().next().value;
      if (first !== undefined) this.snaps.delete(first);
    }
    this.snaps.set(key, cloneMatchState(state));
  }

  private buildClimbTickZero(): MatchState {
    const seeded = applyRunSeed(this.tower, this.seed);
    const state = createMatch({
      seed: this.seed,
      mode: "solo",
      tower: seeded,
      playerIds: [PLAYER_ID],
    });
    drainCountdown(state, this.cfg);
    return state;
  }

  private stepClimb(state: MatchState, steps: number): void {
    for (let i = 0; i < steps; i++) {
      if (state.phase === "finished" || state.phase === "results") break;
      const tickBefore = state.phase === "climb" ? state.tick : 0;
      const input =
        state.phase === "countdown"
          ? NO_INPUT
          : this.inputs[tickBefore] ?? NO_INPUT;
      stepMatch(state, { [PLAYER_ID]: input }, this.cfg);
    }
  }
}

/** Headless oracle for AC-6 parity tests. */
export function headlessReplayAtTick(
  tower: TowerSpec,
  seed: string,
  inputs: readonly PlayerInput[],
  targetClimbTick: number,
  cfg: SimConfig = DEFAULT_SIM_CONFIG
): MatchState {
  const cache = new ReplaySnapshotCache({ tower, seed, inputs, cfg });
  return cache.seek(targetClimbTick);
}

function drainCountdown(state: MatchState, cfg: SimConfig): void {
  let guard = 200;
  while (state.phase === "countdown" && guard-- > 0) {
    stepMatch(state, {}, cfg);
  }
}

function clampInt(v: number, lo: number, hi: number): number {
  if (!Number.isFinite(v)) return lo;
  const n = Math.round(v);
  return n < lo ? lo : n > hi ? hi : n;
}
