/**
 * Render feed — decouples the 30 Hz simulation from the display refresh rate.
 *
 * TICK_HZ is a protocol constant: replays, leaderboards, and anti-cheat bounds
 * all re-simulate against it, so the sim cannot be run faster to look smoother.
 * Instead the feed carries the previous tick's positions alongside the current
 * state, and the renderer draws the point between them that the wall clock has
 * actually reached. Rendering therefore trails the sim by up to one tick (33 ms)
 * and in exchange moves continuously at whatever rate the display refreshes.
 *
 * `tick` is interpolated too. Every animation the painter drives off it (limb
 * swing, lava crest, embers, ember drift) is continuous float math, so a
 * fractional tick smooths those the same way lerped positions smooth motion.
 */

import { MatchState, PlayerState, TICK_DT } from "./types";

const TICK_DT_MS = TICK_DT * 1000;

/**
 * A teleport rather than movement — respawn, or a replay seek. Lerping across
 * one would drag the climber through the tower, so the frame snaps instead.
 * Well above the fastest a climber travels in a single tick.
 */
const TELEPORT_M = 5;

/** The moving fields of one simulation tick. */
export interface InterpSample {
  tick: number;
  hazardY: number;
  x: number[];
  y: number[];
}

export interface RenderFrame {
  /** Authoritative state at the most recently completed tick. */
  state: MatchState;
  /** The tick before it, or null when this frame must not be interpolated. */
  prev: InterpSample | null;
  /** `performance.now()` at which `state`'s tick completed. */
  stepTs: number;
}

/**
 * Live handle the sim writes and the renderer reads, once per frame each. Null
 * until the driver has a match to show, so the renderer falls back to its
 * React snapshot.
 */
export type RenderFeed = { readonly current: RenderFrame | null };

/**
 * Copy the moving fields of `state` into `into` (reused across ticks so the hot
 * loop allocates nothing), returning it as the sample to interpolate from.
 */
export function sampleInterp(state: MatchState, into: InterpSample): InterpSample {
  const players = state.players;
  into.tick = state.tick;
  into.hazardY = state.hazardY;
  into.x.length = players.length;
  into.y.length = players.length;
  for (let i = 0; i < players.length; i++) {
    into.x[i] = players[i].x;
    into.y[i] = players[i].y;
  }
  return into;
}

export function emptySample(): InterpSample {
  return { tick: 0, hazardY: 0, x: [], y: [] };
}

/**
 * The state to paint at `now`: `frame.state` shifted back toward `frame.prev`
 * by however much of the current tick is still unspent. Returns `frame.state`
 * untouched whenever interpolation does not apply, so callers can paint the
 * result unconditionally.
 */
export function interpolateFrame(frame: RenderFrame, now: number): MatchState {
  const { state, prev } = frame;
  if (!prev) return state;
  if (prev.tick !== state.tick - 1) return state;
  const players = state.players;
  if (prev.x.length !== players.length) return state;

  // Time already spent in the tick after `state`; the render point trails that
  // far behind, so it walks prev → state across the tick rather than ahead of it.
  // Compared in milliseconds, not as a ratio: dividing first leaves a whole tick
  // just short of 1.0, and a stalled sim must land on the exact tick, not near it.
  const elapsed = now - frame.stepTs;
  if (elapsed >= TICK_DT_MS) return state;
  const a = elapsed <= 0 ? 0 : elapsed / TICK_DT_MS;

  const lerped: PlayerState[] = new Array(players.length);
  for (let i = 0; i < players.length; i++) {
    const p = players[i];
    const dx = p.x - prev.x[i];
    const dy = p.y - prev.y[i];
    // Per player, not per frame: a peer ghost resyncing must not cost the local
    // climber its smoothing.
    const teleported = Math.abs(dx) > TELEPORT_M || Math.abs(dy) > TELEPORT_M;
    lerped[i] = teleported
      ? p
      : { ...p, x: prev.x[i] + dx * a, y: prev.y[i] + dy * a };
  }

  return {
    ...state,
    tick: prev.tick + a,
    hazardY: prev.hazardY + (state.hazardY - prev.hazardY) * a,
    players: lerped,
  };
}
