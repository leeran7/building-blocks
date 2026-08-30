/**
 * Tower v3 "The Climb" — floor obstacles.
 *
 * Jump-over crates on the traverse. They tax time the lava spends closing:
 * walking into one stops you; jumping clears it; the top is a one-way landing.
 * Nothing falls from the sky — a knock-down next to lava reads as cheap death.
 *
 * Placement is a pure function of (tower.seed, floorIndex), same as platforms
 * and ladders, so re-simulation stays bit-identical (AC-11). No Date/random.
 */

import { Obstacle, PlayerState, TowerSpec } from "./types";
import { createRng } from "./rng";
import { resolveGameCategory } from "./categories";
import {
  floorHeight,
  floorIndexAt,
  laddersForFloor,
  platformsForFloor,
} from "./towers";

const EPS = 0.02;
/** Opening floors stay clear so the first ladders read. */
const MIN_SPAWN_FLOOR = 2;
/** Matches towers.ts DIFFICULTY_FLOORS — ramp then hold. */
const RAMP_FLOORS = 50;
const EDGE_M = 1.2;
/** Keep-out around every ladder centre so grab + climb stay unblocked. */
const LADDER_CLEAR_EXTRA_M = 2.5;

export function obstacleLadderKeepOutM(tower: TowerSpec): number {
  return tower.ladderGrabRadius + LADDER_CLEAR_EXTRA_M;
}

/**
 * Crates on floor `i`, or empty. Deterministic in (tower.seed, i).
 */
export function obstaclesForFloor(tower: TowerSpec, i: number): Obstacle[] {
  if (i < MIN_SPAWN_FLOOR) return [];
  const d = Math.min(1, i / RAMP_FLOORS);
  const rng = createRng(`${tower.seed}:ob:${i}`);
  const chance = 0.28 + 0.5 * d;
  if (rng.next() >= chance) return [];

  const jumpH = jumpApexM(tower);
  const height = Math.min(1.5, jumpH * 0.55);
  const width = 2.2 + 1.4 * d;
  const count = d > 0.5 && rng.next() < 0.35 ? 2 : 1;
  const kind = resolveGameCategory(tower.categorySlug).fallingHazardType;
  const y0 = floorHeight(tower, i);

  const placed: Obstacle[] = [];
  let spans = walkableSpans(tower, i, width);
  for (let n = 0; n < count; n++) {
    if (spans.length === 0) break;
    const span = pickSpan(rng, spans);
    const room = span.hi - span.lo - width;
    if (room < 0) break;
    const x0 = span.lo + rng.next() * room;
    const x1 = x0 + width;
    placed.push({
      floorIndex: i,
      x0,
      x1,
      y0,
      y1: y0 + height,
      kind,
    });
    spans = punch(spans, x0 - 0.8, x1 + 0.8, width);
  }
  return placed;
}

/** Obstacles whose crates intersect [yLow, yHigh]. */
export function obstaclesNearY(
  tower: TowerSpec,
  yLow: number,
  yHigh: number
): Obstacle[] {
  const lo = Math.max(0, floorIndexAt(tower, yLow) - 1);
  const hi = floorIndexAt(tower, yHigh) + 1;
  const out: Obstacle[] = [];
  for (let i = lo; i <= hi; i++) out.push(...obstaclesForFloor(tower, i));
  return out;
}

/**
 * Peak of a standing jump (v² / 2g). Crates stay below this so every floor
 * remains solvable without a power-up.
 */
export function jumpApexM(tower: TowerSpec): number {
  return (tower.jumpSpeed * tower.jumpSpeed) / (2 * tower.gravity);
}

/** True if a crate sits in the walk direction within `lookM` metres. */
export function obstacleAhead(
  tower: TowerSpec,
  x: number,
  y: number,
  dir: -1 | 0 | 1,
  lookM = 4
): boolean {
  if (dir === 0) return false;
  const lo = dir > 0 ? x : x - lookM;
  const hi = dir > 0 ? x + lookM : x;
  for (const o of obstaclesNearY(tower, y - 0.25, y + 0.25)) {
    if (y >= o.y1 - 0.08) continue;
    if (o.x1 < lo || o.x0 > hi) continue;
    if (dir > 0 && o.x0 >= x - 0.05) return true;
    if (dir < 0 && o.x1 <= x + 0.05) return true;
  }
  return false;
}

/** True if feet at (x, y) are standing on an obstacle top. */
export function isOnObstacle(
  tower: TowerSpec,
  x: number,
  y: number,
  marginM = 0
): boolean {
  const GROUND_EPS = EPS * 1.5;
  for (const o of obstaclesNearY(tower, y, y)) {
    if (x < o.x0 - EPS - marginM || x > o.x1 + EPS + marginM) continue;
    if (Math.abs(o.y1 - y) <= GROUND_EPS) return true;
  }
  return false;
}

/**
 * Resolve crate collision after x/y integration. Lands on tops (one-way),
 * blocks walking through the sides. Skip while on a ladder — crates never
 * occupy grab zones.
 */
export function resolveObstacleMotion(
  p: PlayerState,
  prevX: number,
  prevY: number,
  tower: TowerSpec,
  marginM: number
): void {
  if (p.onLadder) return;

  const band = obstaclesNearY(
    tower,
    Math.min(prevY, p.y) - 2,
    Math.max(prevY, p.y) + 2
  );
  if (band.length === 0) return;

  if (p.vy <= 0) {
    const top = landingObstacle(band, p.x, prevY, p.y, marginM);
    if (top) {
      p.y = top.y1;
      p.vy = 0;
      p.onGround = true;
    }
  }

  // Hurdle: only the grounded walk is blocked. An airborne climber may clip
  // the face on the way over; landing on the top still catches a short jump.
  if (!p.onGround) return;

  for (const o of band) {
    const belowTop = p.y >= o.y0 - EPS && p.y < o.y1 - EPS;
    if (!belowTop) continue;
    const inX = p.x >= o.x0 && p.x <= o.x1;
    if (!inX) continue;
    if (prevX <= o.x0) p.x = o.x0 - EPS;
    else if (prevX >= o.x1) p.x = o.x1 + EPS;
    else p.x = prevX < (o.x0 + o.x1) / 2 ? o.x0 - EPS : o.x1 + EPS;
    p.vx = 0;
  }
}

function landingObstacle(
  band: Obstacle[],
  x: number,
  prevY: number,
  newY: number,
  marginM: number
): Obstacle | null {
  const LANDING_EPS = EPS * 1.5;
  let best: Obstacle | null = null;
  for (const o of band) {
    if (x < o.x0 - EPS - marginM || x > o.x1 + EPS + marginM) continue;
    if (o.y1 <= prevY + LANDING_EPS && o.y1 >= newY - LANDING_EPS) {
      if (!best || o.y1 > best.y1) best = o;
    }
  }
  return best;
}

type Span = { lo: number; hi: number };

function walkableSpans(
  tower: TowerSpec,
  i: number,
  crateW: number
): Span[] {
  const pieces = platformsForFloor(tower, i);
  const ladderXs = [
    ...laddersForFloor(tower, i).map((l) => l.x),
    ...(i > 0 ? laddersForFloor(tower, i - 1).map((l) => l.x) : []),
  ];
  const clear = obstacleLadderKeepOutM(tower);
  const spans: Span[] = [];
  for (const p of pieces) {
    let intervals: Span[] = [{ lo: p.x0 + EDGE_M, hi: p.x1 - EDGE_M }];
    for (const lx of ladderXs) {
      intervals = punch(intervals, lx - clear, lx + clear, crateW);
    }
    for (const s of intervals) {
      if (s.hi - s.lo >= crateW + 0.4) spans.push(s);
    }
  }
  return spans;
}

function punch(spans: Span[], cutLo: number, cutHi: number, minW: number): Span[] {
  const next: Span[] = [];
  for (const s of spans) {
    if (cutHi <= s.lo || cutLo >= s.hi) {
      next.push(s);
      continue;
    }
    if (cutLo > s.lo) next.push({ lo: s.lo, hi: Math.min(s.hi, cutLo) });
    if (cutHi < s.hi) next.push({ lo: Math.max(s.lo, cutHi), hi: s.hi });
  }
  return next.filter((s) => s.hi - s.lo >= minW + 0.4);
}

function pickSpan(
  rng: { next(): number },
  spans: Span[]
): Span {
  const total = spans.reduce((a, s) => a + (s.hi - s.lo), 0);
  let pick = rng.next() * total;
  for (const s of spans) {
    pick -= s.hi - s.lo;
    if (pick <= 0) return s;
  }
  return spans[spans.length - 1];
}
