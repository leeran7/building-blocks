/**
 * Floor spikes: a short row of spikes on a floor, between the ladders. Touch
 * them and the run ends (Leeran, 2026-10-29: kids wanted more ways to lose).
 *
 * They are the only floor hazard that kills, so placement keeps them fair:
 *
 * - always narrower than a standing jump's reach, so a stop right in front
 *   of them is still recoverable (air control is full);
 * - never within reach of a ladder top you arrive on or a ladder you leave
 *   from, so stepping off a ladder or jumping to grab one never lands on them;
 * - never next to a crate or a gap edge, so the jump over them is a plain
 *   jump with flat floor to land on, and never where a running jump over a
 *   crate or a gap comes down (SPIKE_LANDING_REACH_FRAC);
 * - at most one row per floor.
 *
 * Pure function of (tower.seed, floorIndex) like obstacles.ts, so the server
 * re-simulation and every client agree (AC-11). No Date/random.
 *
 * Where they appear: the free stack (Free Climb, Daily) from
 * SPIKES_ENDLESS.fromFloor, ramping with altitude; level towers through the
 * `spikeChance` knob (levelSpec.ts, 0 before the season's intro level). Duel
 * and category towers never get them.
 */

import type { PlayerState, Spike, TowerSpec } from "./types";
import { createRng } from "./rng";
import { createSeedCache } from "./seedCache";
import { obstaclesForFloor, obstacleLadderKeepOutM } from "./obstacles";
import {
  difficultyAt,
  floorIndexAt,
  geometryCacheKey,
  laddersForFloor,
  platformsForFloor,
  summitFloor,
} from "./towers";

/** Height of the deadly band above the floor, in metres. */
export const SPIKE_HEIGHT_M = 1;
/** Row width at layout difficulty 0 and 1, before the seeded jitter. */
export const SPIKE_WIDTH_M = { from: 3, to: 4.5 } as const;
/** Seeded extra width, [0, this). */
const SPIKE_WIDTH_JITTER_M = 0.5;
/**
 * Flat floor kept clear on each side of a row: room to land past it and to
 * take off before it. Also the gap kept to crates and platform ends.
 */
export const SPIKE_CLEAR_M = 3;
/**
 * Keep-out past crates and gap edges, as a share of a running jump's reach:
 * a jump over a crate or a gap (from a crate top it carries further) always
 * comes down on clear floor.
 */
export const SPIKE_LANDING_REACH_FRAC = 1.25;
/** Extra keep-out on top of the crate keep-out around every ladder. */
const SPIKE_LADDER_EXTRA_M = 2.5;
/**
 * Forgiveness: the climber's feet must be this far inside the row before it
 * counts, so grazing the very tip of the end spike does not end a run.
 */
export const SPIKE_INSET_M = 0.3;

/**
 * Free-stack ramp: no spikes below `fromFloor`, then `fromChance` of floors,
 * rising to `toChance` at `peakFloor`.
 */
export const SPIKES_ENDLESS = { fromFloor: 8, peakFloor: 30, fromChance: 0.25, toChance: 0.5 } as const;

/** A level's first floors stay clear, like its crates (obstacles.ts). */
export const LEVEL_SPIKES_FROM_FLOOR = 2;

/** Largest per-floor chance a level may set. */
export const MAX_SPIKE_CHANCE = 0.6;

/** Standing jump reach: airtime × walk speed. A row never comes close. */
function standingReachM(tower: TowerSpec): number {
  return ((2 * tower.jumpSpeed) / tower.gravity) * tower.moveSpeed;
}

/** Per-floor chance of a spike row on floor `i`. */
export function spikeChanceAt(tower: TowerSpec, i: number): number {
  const set = tower.spikeChance;
  if (set !== undefined) {
    if (!Number.isFinite(set) || set < 0 || set > MAX_SPIKE_CHANCE) {
      throw new RangeError(`tower.spikeChance must be in [0, ${MAX_SPIKE_CHANCE}], got ${set}`);
    }
    return i < LEVEL_SPIKES_FROM_FLOOR ? 0 : set;
  }
  if (tower.endlessLadders !== true || tower.difficulty !== undefined) return 0;
  const r = SPIKES_ENDLESS;
  if (i < r.fromFloor) return 0;
  if (i >= r.peakFloor) return r.toChance;
  const t = (i - r.fromFloor) / (r.peakFloor - r.fromFloor);
  return r.fromChance + (r.toChance - r.fromChance) * t;
}

type Span = { lo: number; hi: number };

function cut(spans: Span[], lo: number, hi: number): Span[] {
  const out: Span[] = [];
  for (const s of spans) {
    if (hi <= s.lo || lo >= s.hi) {
      out.push(s);
      continue;
    }
    if (lo > s.lo) out.push({ lo: s.lo, hi: lo });
    if (hi < s.hi) out.push({ lo: hi, hi: s.hi });
  }
  return out;
}

function buildSpikes(tower: TowerSpec, i: number): Spike[] {
  if (i < 1) return [];
  const summit = summitFloor(tower);
  if (summit !== null && i >= summit) return [];
  const chance = spikeChanceAt(tower, i);
  if (chance <= 0) return [];
  const rng = createRng(`${tower.seed}:spikes:${i}`);
  if (rng.next() >= chance) return [];

  const d = difficultyAt(tower, i);
  const width = Math.min(
    0.5 * standingReachM(tower),
    SPIKE_WIDTH_M.from + (SPIKE_WIDTH_M.to - SPIKE_WIDTH_M.from) * d + rng.next() * SPIKE_WIDTH_JITTER_M
  );
  const pieces = platformsForFloor(tower, i);
  const floorY = pieces[0]?.y;
  if (floorY === undefined) return [];

  // A piece end at a wall is not an edge: the floor wraps on round.
  const w = tower.widthM;
  const landing = SPIKE_LANDING_REACH_FRAC * standingReachM(tower);
  const edgeClear = (x: number) => (x <= 1e-9 || x >= w - 1e-9 ? SPIKE_CLEAR_M : landing);
  let spans: Span[] = pieces.map((p) => ({ lo: p.x0 + edgeClear(p.x0), hi: p.x1 - edgeClear(p.x1) }));
  const keep = obstacleLadderKeepOutM(tower) + SPIKE_LADDER_EXTRA_M;
  const ladderXs = [
    ...laddersForFloor(tower, i).map((l) => l.x),
    ...laddersForFloor(tower, i - 1).map((l) => l.x),
  ];
  for (const x of ladderXs) {
    // The tower wraps, so a keep-out near one wall also covers the other.
    for (const shift of [-w, 0, w]) spans = cut(spans, x + shift - keep, x + shift + keep);
  }
  for (const o of obstaclesForFloor(tower, i)) {
    for (const shift of [-w, 0, w]) spans = cut(spans, o.x0 + shift - landing, o.x1 + shift + landing);
  }
  const fits = spans.filter((s) => s.hi - s.lo >= width);
  if (fits.length === 0) return [];
  const span = fits[Math.floor(rng.next() * fits.length)]!;
  const x0 = span.lo + rng.next() * (span.hi - span.lo - width);
  return [{ floorIndex: i, x0, x1: x0 + width, y: floorY }];
}

const SPIKE_CACHE = createSeedCache<Map<number, Spike[]>>(8, () => new Map());

/** The spike rows on floor `i` (zero or one). Cached per tower. */
export function spikesForFloor(tower: TowerSpec, i: number): Spike[] {
  const key = `${geometryCacheKey(tower)}|sp=${tower.spikeChance ?? "ramp"}|w=${tower.widthM}`;
  const floors = SPIKE_CACHE.get(key);
  let hit = floors.get(i);
  if (hit === undefined) {
    hit = buildSpikes(tower, i);
    floors.set(i, hit);
  }
  return hit;
}

/** Spike rows on the floors around [yLow, yHigh]. A fresh array. */
export function spikesNearY(tower: TowerSpec, yLow: number, yHigh: number): Spike[] {
  const out: Spike[] = [];
  const lo = Math.max(0, floorIndexAt(tower, yLow) - 1);
  const hi = floorIndexAt(tower, yHigh) + 1;
  for (let i = lo; i <= hi; i++) out.push(...spikesForFloor(tower, i));
  return out;
}

/** Whether feet at (x, y) are in a spike row: the elimination test. */
export function touchesSpikes(tower: TowerSpec, x: number, y: number): boolean {
  const w = tower.widthM;
  const wx = ((x % w) + w) % w;
  for (const s of spikesNearY(tower, y - SPIKE_HEIGHT_M, y)) {
    if (y < s.y - 0.05 || y > s.y + SPIKE_HEIGHT_M) continue;
    if (wx > s.x0 + SPIKE_INSET_M && wx < s.x1 - SPIKE_INSET_M) return true;
  }
  return false;
}

/**
 * Whether an eliminated climber ended on spikes, for the results screen. Read
 * from the final state alone (stepMatch stops a climber on the tick it
 * dies), so it needs no extra field in the replayed state.
 */
export function endedOnSpikes(tower: TowerSpec, p: Pick<PlayerState, "status" | "onLadder" | "x" | "y">): boolean {
  return p.status === "eliminated" && !p.onLadder && touchesSpikes(tower, p.x, p.y);
}
