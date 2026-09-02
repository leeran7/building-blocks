/**
 * Tower v3 "The Climb" — floor obstacles.
 *
 * Jump-over crates on the traverse, stacked crates that form a stair to the
 * next floor, and three-level hurdle triangles (up one side, down the other).
 * They tax time the lava spends closing: walking into a lone hurdle stops you;
 * jumping clears it. A stair or triangle is walk-up — each next crate is a
 * tread, not a wall. Nothing falls from the sky — a knock-down next to lava
 * reads as cheap death.
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
/** Hurdle pyramids: floor, mid, peak — then back down. */
const PYRAMID_LEVELS = 3;

export function obstacleLadderKeepOutM(tower: TowerSpec): number {
  return tower.ladderGrabRadius + LADDER_CLEAR_EXTRA_M;
}

/**
 * Crates on floor `i`, or empty. Deterministic in (tower.seed, i).
 * A floor is a hurdle (one or two crates on the slab), a three-level hurdle
 * triangle, or a stair of stacked crates whose last top meets the next floor.
 */
export function obstaclesForFloor(tower: TowerSpec, i: number): Obstacle[] {
  if (i < MIN_SPAWN_FLOOR) return [];
  const d = Math.min(1, i / RAMP_FLOORS);
  const rng = createRng(`${tower.seed}:ob:${i}`);
  const chance = 0.5 + 0.42 * d;
  if (rng.next() >= chance) return [];

  const kind = resolveGameCategory(tower.categorySlug).fallingHazardType;
  const stairChance = 0.4 + 0.35 * d;
  if (rng.next() < stairChance) {
    const stair = tryStair(tower, i, rng, kind, d);
    if (stair) return stair;
  }
  const pyramidChance = 0.4 + 0.2 * d;
  if (rng.next() < pyramidChance) {
    const pyramid = tryPyramid(tower, i, rng, kind, d);
    if (pyramid) return pyramid;
  }
  return placeHurdles(tower, i, rng, kind, d);
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
 * Peak of a standing jump (v² / 2g). Each crate step stays below this so every
 * floor remains solvable without a power-up.
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
  for (const o of obstaclesNearY(tower, y - 0.25, y + 2.8)) {
    if (y >= o.y1 - 0.08) continue;
    // Next-floor crates share a generation window but are a storey up — they
    // are not a hurdle on this walk. Stair steps sit at the current feet.
    if (o.y0 > y + 0.5) continue;
    if (o.x1 < lo || o.x0 > hi) continue;
    if (dir > 0 && o.x1 > x) return true;
    if (dir < 0 && o.x0 < x) return true;
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
  // Stair: overlapping AABBs put the next crate's y0 at your feet, so a side
  // hit would shove you off the tread. One walk-up per tick, lowest first.
  if (!p.onGround) return;

  const LANDING_EPS = EPS * 1.5;
  const faces = band.slice().sort((a, b) => a.y0 - b.y0);
  let stepped = false;
  for (const o of faces) {
    const belowTop = p.y >= o.y0 - EPS && p.y < o.y1 - EPS;
    if (!belowTop) continue;
    const inX = p.x >= o.x0 && p.x <= o.x1;
    if (!inX) continue;
    const atBase = Math.abs(p.y - o.y0) <= LANDING_EPS;
    if (atBase && isStairCrate(band, o)) {
      if (!stepped) {
        p.y = o.y1;
        p.vy = 0;
        p.onGround = true;
        stepped = true;
      }
      continue;
    }
    if (prevX <= o.x0) p.x = o.x0 - EPS;
    else if (prevX >= o.x1) p.x = o.x1 + EPS;
    else p.x = prevX < (o.x0 + o.x1) / 2 ? o.x0 - EPS : o.x1 + EPS;
    p.vx = 0;
  }
}

function crateWidthM(d: number): number {
  return 4.2 + 1.2 * d;
}

function hurdleHeightM(tower: TowerSpec): number {
  return Math.min(2.15, jumpApexM(tower) * 0.72);
}

function placeHurdles(
  tower: TowerSpec,
  i: number,
  rng: { next(): number },
  kind: Obstacle["kind"],
  d: number
): Obstacle[] {
  const height = hurdleHeightM(tower);
  const width = crateWidthM(d);
  const count = d > 0.35 && rng.next() < 0.5 ? 2 : 1;
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

function tryPyramid(
  tower: TowerSpec,
  i: number,
  rng: { next(): number },
  kind: Obstacle["kind"],
  d: number
): Obstacle[] | null {
  const y0 = floorHeight(tower, i);
  const height = hurdleHeightM(tower);
  const width = crateWidthM(d);
  const overlapFrac = 0.32 + rng.next() * 0.1;
  const advance = width * (1 - overlapFrac);
  const nCrates = PYRAMID_LEVELS * 2 - 1;
  const spanW = (nCrates - 1) * advance + width;
  const pieces = platformsForFloor(tower, i);
  const spans = walkableSpans(tower, i, spanW);
  const destKeep = obstacleLadderKeepOutM(tower);
  const destLadders = [
    ...(i > 0 ? laddersForFloor(tower, i - 1).map((l) => l.x) : []),
    ...laddersForFloor(tower, i).map((l) => l.x),
    ...laddersForFloor(tower, i + 1).map((l) => l.x),
  ];

  for (const span of spans) {
    const room = span.hi - span.lo - spanW;
    if (room < 0) continue;
    for (let t = 0; t < 6; t++) {
      const origin = span.lo + (t === 0 ? rng.next() * room : (t / 5) * room);
      if (
        pyramidFits(origin, nCrates, width, advance, pieces, destLadders, destKeep)
      ) {
        return buildPyramid(i, origin, nCrates, width, advance, y0, height, kind);
      }
    }
  }
  return null;
}

function tryStair(
  tower: TowerSpec,
  i: number,
  rng: { next(): number },
  kind: Obstacle["kind"],
  d: number
): Obstacle[] | null {
  const y0 = floorHeight(tower, i);
  const yNext = floorHeight(tower, i + 1);
  const gap = yNext - y0;
  const apex = jumpApexM(tower);
  const maxStep = Math.min(1.75, apex * 0.62);
  const nSteps = Math.max(3, Math.ceil(gap / maxStep));
  const stepH = gap / nSteps;
  if (stepH >= apex * 0.9) return null;

  const width = crateWidthM(d);
  const overlapFrac = 0.36 + rng.next() * 0.16;
  const advance = width * (1 - overlapFrac);
  const srcPieces = platformsForFloor(tower, i);
  const destPieces = platformsForFloor(tower, i + 1);
  const srcSpans = walkableSpans(tower, i, width);
  const destKeep = obstacleLadderKeepOutM(tower);
  const destLadders = [
    ...(i > 0 ? laddersForFloor(tower, i - 1).map((l) => l.x) : []),
    ...laddersForFloor(tower, i).map((l) => l.x),
    ...laddersForFloor(tower, i + 1).map((l) => l.x),
  ];

  const dirs: (-1 | 1)[] = rng.next() < 0.5 ? [1, -1] : [-1, 1];
  for (const dir of dirs) {
    for (const span of srcSpans) {
      const room = span.hi - span.lo - width;
      if (room < 0) continue;
      for (let t = 0; t < 6; t++) {
        const origin = span.lo + (t === 0 ? rng.next() * room : (t / 5) * room);
        if (
          stairFits(
            origin,
            dir,
            nSteps,
            width,
            advance,
            srcPieces,
            destPieces,
            destLadders,
            destKeep,
            tower.widthM
          )
        ) {
          return buildStair(i, origin, dir, nSteps, width, advance, y0, stepH, kind);
        }
      }
    }
  }
  return null;
}

function stairFits(
  origin: number,
  dir: -1 | 1,
  nSteps: number,
  width: number,
  advance: number,
  srcPieces: { x0: number; x1: number }[],
  destPieces: { x0: number; x1: number }[],
  destLadders: number[],
  destKeep: number,
  widthM: number
): boolean {
  const firstX0 = origin;
  const firstX1 = origin + width;
  if (!onSolid(srcPieces, firstX0, firstX1)) return false;
  for (let k = 0; k < nSteps; k++) {
    const x0 = origin + k * advance * dir;
    const x1 = x0 + width;
    if (x0 < 0 || x1 > widthM) return false;
    if (overlapsLadder(x0, x1, destLadders, destKeep)) return false;
  }
  const lastX0 = origin + (nSteps - 1) * advance * dir;
  const lastX1 = lastX0 + width;
  const overlapNeed = width * 0.45;
  return destPieces.some((p) => {
    const overlap = Math.min(lastX1, p.x1) - Math.max(lastX0, p.x0);
    return overlap >= overlapNeed;
  });
}

function buildStair(
  floorIndex: number,
  origin: number,
  dir: -1 | 1,
  nSteps: number,
  width: number,
  advance: number,
  y0: number,
  stepH: number,
  kind: Obstacle["kind"]
): Obstacle[] {
  const out: Obstacle[] = [];
  for (let k = 0; k < nSteps; k++) {
    const x0 = origin + k * advance * dir;
    out.push({
      floorIndex,
      x0,
      x1: x0 + width,
      y0: y0 + k * stepH,
      y1: y0 + (k + 1) * stepH,
      kind,
    });
  }
  return out;
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

function pyramidFits(
  origin: number,
  nCrates: number,
  width: number,
  advance: number,
  pieces: { x0: number; x1: number }[],
  destLadders: number[],
  destKeep: number
): boolean {
  for (let k = 0; k < nCrates; k++) {
    const x0 = origin + k * advance;
    const x1 = x0 + width;
    if (overlapsLadder(x0, x1, destLadders, destKeep)) return false;
    if (!onSolid(pieces, x0, x1)) return false;
  }
  return true;
}

function buildPyramid(
  floorIndex: number,
  origin: number,
  nCrates: number,
  width: number,
  advance: number,
  y0: number,
  height: number,
  kind: Obstacle["kind"]
): Obstacle[] {
  const out: Obstacle[] = [];
  const peak = PYRAMID_LEVELS - 1;
  for (let k = 0; k < nCrates; k++) {
    const level = k <= peak ? k : nCrates - 1 - k;
    const x0 = origin + k * advance;
    out.push({
      floorIndex,
      x0,
      x1: x0 + width,
      y0: y0 + level * height,
      y1: y0 + (level + 1) * height,
      kind,
    });
  }
  return out;
}

/** True when `o` is one tread of a stacked stair or pyramid, not a lone hurdle. */
function isStairCrate(band: Obstacle[], o: Obstacle): boolean {
  for (const b of band) {
    if (b.floorIndex !== o.floorIndex) continue;
    if (b.x0 === o.x0 && b.y0 === o.y0 && b.y1 === o.y1) continue;
    const stacked =
      Math.abs(b.y0 - o.y1) <= 0.05 || Math.abs(b.y1 - o.y0) <= 0.05;
    const xOverlap = Math.min(b.x1, o.x1) - Math.max(b.x0, o.x0) > 0;
    if (stacked && xOverlap) return true;
  }
  return false;
}

function onSolid(
  pieces: { x0: number; x1: number }[],
  x0: number,
  x1: number
): boolean {
  return pieces.some((p) => x0 >= p.x0 - 1e-9 && x1 <= p.x1 + 1e-9);
}

function overlapsLadder(
  x0: number,
  x1: number,
  xs: number[],
  clear: number
): boolean {
  return xs.some((lx) => x0 < lx + clear && x1 > lx - clear);
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
