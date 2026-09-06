/**
 * Tower v3 "The Climb" — floor obstacles.
 *
 * Jump-over crates on the traverse, stacked crates that form a stair to the
 * next floor, and three-level hurdle triangles (up one side, down the other).
 * They tax time the lava spends closing: walking into a lone hurdle stops you;
 * jumping clears it. Stairs/triangles ride a continuous ramp surface (visual
 * crates stay stepped) so cresting is not a jittery tread snap. Nothing falls
 * from the sky — a knock-down next to lava reads as cheap death.
 *
 * Placement prefers corridors between consecutive ladder anchors, with extra
 * punched gaps so crates sit in pockets rather than filling the span. Pure
 * function of (tower.seed, floorIndex) — re-simulation stays bit-identical
 * (AC-11). No Date/random.
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
/** Extra empty lanes punched inside between-ladder corridors. */
const CORRIDOR_GAP_M = 2.4;
/** Clear space reserved around each placed hurdle. */
const HURDLE_CLEAR_M = 2.6;
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
  const band = obstaclesNearY(tower, y, y);
  for (const o of band) {
    if (x < o.x0 - EPS - marginM || x > o.x1 + EPS + marginM) continue;
    const surface = obstacleSurfaceY(band, o, x);
    if (Math.abs(surface - y) <= GROUND_EPS) return true;
  }
  return false;
}

/**
 * Resolve crate collision after x/y integration. Lands on tops (one-way),
 * blocks walking through the sides. Skip while on a ladder — crates never
 * occupy grab zones.
 *
 * When `strideSmallObstacles` is set (Giant), lone slab hurdles are walked
 * over like stair treads — stacked stairs/pyramids already walk-up for everyone.
 */
export function resolveObstacleMotion(
  p: PlayerState,
  prevX: number,
  prevY: number,
  tower: TowerSpec,
  marginM: number,
  strideSmallObstacles = false
): void {
  if (p.onLadder) return;

  const band = obstaclesNearY(
    tower,
    Math.min(prevY, p.y) - 2,
    Math.max(prevY, p.y) + 2
  );
  if (band.length === 0) return;

  const LANDING_EPS = EPS * 1.5;

  if (p.vy <= 0) {
    const top = landingObstacle(band, p.x, prevY, p.y, marginM);
    if (top) {
      p.y = obstacleSurfaceY(band, top, p.x);
      p.vy = 0;
      p.onGround = true;
    }
    // Ride before the grounded gate — platform landing may have cleared
    // onGround while feet are still on a ramp above the slab.
    rideStairRamps(band, p, prevX, prevY, LANDING_EPS);
  }

  // Hurdle: only the grounded walk is blocked. An airborne climber may clip
  // the face on the way over; landing on the top still catches a short jump.
  // Stair/pyramid: continuous ramp (no per-tread snap). Giant: strideSmall
  // also walk-ups lone (non-stair) slab hurdles.
  if (!p.onGround) return;

  const faces = band.slice().sort((a, b) => a.y0 - b.y0);
  let stepped = false;
  for (const o of faces) {
    const belowTop = p.y >= o.y0 - EPS && p.y < o.y1 - EPS;
    if (!belowTop) continue;
    const inX = p.x >= o.x0 && p.x <= o.x1;
    if (!inX) continue;
    if (isStairCrate(band, o)) {
      const surface = obstacleSurfaceY(band, o, p.x);
      const run = collectStairRun(band, o);
      const yHi = Math.max(...run.map((r) => r.y1));
      const yLo = Math.min(...run.map((r) => r.y0));
      const stepSlack = Math.max(0.85, (yHi - yLo) / run.length + 0.25);
      // On/near the ramp — don't shove sideways off the climb.
      if (p.y >= surface - stepSlack) continue;
      // Tall face under the ramp (approach from the high end at slab height).
    } else {
      const atBase = Math.abs(p.y - o.y0) <= LANDING_EPS;
      const canWalkUp =
        atBase && strideSmallObstacles && isSmallHurdle(band, o, tower);
      if (canWalkUp) {
        if (!stepped) {
          p.y = o.y1;
          p.vy = 0;
          p.onGround = true;
          stepped = true;
        }
        continue;
      }
    }
    if (prevX <= o.x0) p.x = o.x0 - EPS;
    else if (prevX >= o.x1) p.x = o.x1 + EPS;
    else p.x = prevX < (o.x0 + o.x1) / 2 ? o.x0 - EPS : o.x1 + EPS;
    p.vx = 0;
  }
}

/** Lone slab hurdle — not a stair/pyramid tread, height ≤ authored hurdle. */
export function isSmallHurdle(
  band: Obstacle[],
  o: Obstacle,
  tower: TowerSpec
): boolean {
  if (isStairCrate(band, o)) return false;
  return o.y1 - o.y0 <= hurdleHeightM(tower) + 0.1;
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
  let spans = placementSpans(tower, i, width);
  for (let n = 0; n < count; n++) {
    if (spans.length === 0) break;
    const span = pickSpan(rng, spans);
    const x0 = placeAtSpan(span, width, rng);
    const x1 = x0 + width;
    if (x1 - x0 > span.hi - span.lo + 1e-9) break;
    placed.push({
      floorIndex: i,
      x0,
      x1,
      y0,
      y1: y0 + height,
      kind,
    });
    spans = punch(spans, x0 - HURDLE_CLEAR_M, x1 + HURDLE_CLEAR_M, width);
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
  const destKeep = obstacleLadderKeepOutM(tower);
  const destLadders = [
    ...(i > 0 ? laddersForFloor(tower, i - 1).map((l) => l.x) : []),
    ...laddersForFloor(tower, i).map((l) => l.x),
    ...laddersForFloor(tower, i + 1).map((l) => l.x),
  ];

  const attempt = (spans: Span[]): Obstacle[] | null => {
    for (const span of spans) {
      const room = span.hi - span.lo - spanW;
      if (room < 0) continue;
      for (let t = 0; t < 6; t++) {
        const origin =
          span.lo + (t === 0 ? room / 2 : ((t - 1) / 4) * room);
        if (
          pyramidFits(origin, nCrates, width, advance, pieces, destLadders, destKeep)
        ) {
          return buildPyramid(i, origin, nCrates, width, advance, y0, height, kind);
        }
      }
    }
    return null;
  };

  // Prefer between-ladder pockets; fall back so triangles still spawn.
  return (
    attempt(betweenLadderSpans(tower, i, spanW)) ??
    attempt(walkableSpans(tower, i, spanW))
  );
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
  // Shallower treads → ramp-like crest when paired with continuous surface Y.
  const maxStep = Math.min(1.05, apex * 0.38);
  const nSteps = Math.max(5, Math.ceil(gap / maxStep));
  const stepH = gap / nSteps;
  if (stepH >= apex * 0.9) return null;

  const width = crateWidthM(d);
  const overlapFrac = 0.55 + rng.next() * 0.15;
  const advance = width * (1 - overlapFrac);
  const srcPieces = platformsForFloor(tower, i);
  const destPieces = platformsForFloor(tower, i + 1);
  const destKeep = obstacleLadderKeepOutM(tower);
  const destLadders = [
    ...(i > 0 ? laddersForFloor(tower, i - 1).map((l) => l.x) : []),
    ...laddersForFloor(tower, i).map((l) => l.x),
    ...laddersForFloor(tower, i + 1).map((l) => l.x),
  ];

  const dirs: (-1 | 1)[] = rng.next() < 0.5 ? [1, -1] : [-1, 1];
  const attempt = (srcSpans: Span[]): Obstacle[] | null => {
    for (const dir of dirs) {
      for (const span of srcSpans) {
        const room = span.hi - span.lo - width;
        if (room < 0) continue;
        for (let t = 0; t < 6; t++) {
          const origin =
            span.lo + (t === 0 ? room / 2 : ((t - 1) / 4) * room);
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
            return buildStair(
              i,
              origin,
              dir,
              nSteps,
              width,
              advance,
              y0,
              stepH,
              kind
            );
          }
        }
      }
    }
    return null;
  };

  // Prefer between-ladder origins; fall back so stairs still reach the next floor.
  return (
    attempt(betweenLadderSpans(tower, i, width)) ??
    attempt(walkableSpans(tower, i, width))
  );
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
  const overlapNeed = width * 0.35;
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
  let bestY = -Infinity;
  for (const o of band) {
    if (x < o.x0 - EPS - marginM || x > o.x1 + EPS + marginM) continue;
    const surface = obstacleSurfaceY(band, o, x);
    if (surface <= prevY + LANDING_EPS && surface >= newY - LANDING_EPS) {
      if (surface > bestY) {
        best = o;
        bestY = surface;
      }
    }
  }
  return best;
}

type Span = { lo: number; hi: number };

/** Spans between consecutive ladder anchors only — no outside-corridor fallback. */
function placementSpans(
  tower: TowerSpec,
  i: number,
  crateW: number
): Span[] {
  return betweenLadderSpans(tower, i, crateW);
}

/**
 * Placement pockets strictly between consecutive ladder anchors on this floor
 * (and the floor below), with additional mid-corridor gaps punched out.
 */
function betweenLadderSpans(
  tower: TowerSpec,
  i: number,
  crateW: number
): Span[] {
  const pieces = platformsForFloor(tower, i);
  const ladderXs = uniqueSorted([
    ...laddersForFloor(tower, i).map((l) => l.x),
    ...(i > 0 ? laddersForFloor(tower, i - 1).map((l) => l.x) : []),
  ]);
  if (ladderXs.length < 2) return [];

  const clear = obstacleLadderKeepOutM(tower);
  const spans: Span[] = [];
  for (let a = 0; a < ladderXs.length - 1; a++) {
    const corridorLo = ladderXs[a]! + clear;
    const corridorHi = ladderXs[a + 1]! - clear;
    if (corridorHi - corridorLo < crateW + 0.4) continue;
    for (const p of pieces) {
      const lo = Math.max(corridorLo, p.x0 + EDGE_M);
      const hi = Math.min(corridorHi, p.x1 - EDGE_M);
      if (hi - lo < crateW + 0.4) continue;
      let intervals: Span[] = [{ lo, hi }];
      const width = hi - lo;
      // Punch extra gaps only when leftover pockets still fit a crate;
      // otherwise keep the full corridor so placement stays between ladders.
      if (width >= crateW * 2 + CORRIDOR_GAP_M * 2) {
        const g = Math.min(CORRIDOR_GAP_M, width * 0.14);
        const third = lo + width / 3;
        const twoThird = lo + (2 * width) / 3;
        const punched = punch(
          punch(intervals, third - g / 2, third + g / 2, crateW),
          twoThird - g / 2,
          twoThird + g / 2,
          crateW
        );
        if (punched.length > 0) intervals = punched;
      } else if (width >= crateW * 2 + CORRIDOR_GAP_M + 1) {
        const mid = (lo + hi) / 2;
        const g = Math.min(CORRIDOR_GAP_M * 0.75, width * 0.18);
        const punched = punch(intervals, mid - g / 2, mid + g / 2, crateW);
        if (punched.length > 0) intervals = punched;
      }
      for (const s of intervals) {
        if (s.hi - s.lo >= crateW + 0.4) spans.push(s);
      }
    }
  }
  return spans;
}

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

/** Stick grounded feet to the continuous ramp across each stair/pyramid run. */
function rideStairRamps(
  band: Obstacle[],
  p: PlayerState,
  prevX: number,
  prevY: number,
  landingEps: number
): void {
  const seen = new Set<string>();
  for (const o of band) {
    if (!isStairCrate(band, o)) continue;
    const run = collectStairRun(band, o);
    if (run.length < 2) continue;
    const key = run
      .map((r) => `${r.x0}:${r.y0}`)
      .sort()
      .join("|");
    if (seen.has(key)) continue;
    seen.add(key);

    const left = Math.min(...run.map((r) => r.x0));
    const right = Math.max(...run.map((r) => r.x1));
    const inside = p.x >= left - EPS && p.x <= right + EPS;
    if (!inside) continue;

    const surface = obstacleSurfaceY(band, o, p.x);
    const yLo = Math.min(...run.map((r) => r.y0));
    const yHi = Math.max(...run.map((r) => r.y1));
    if (p.y < yLo - landingEps || p.y > yHi + landingEps) continue;

    const stepSlack = Math.max(0.85, (yHi - yLo) / run.length + 0.25);
    const wasInside = prevX >= left - EPS && prevX <= right + EPS;
    if (wasInside) {
      const prevSurface = obstacleSurfaceY(
        band,
        o,
        Math.max(left, Math.min(right, prevX))
      );
      // One-way: only ride if feet were already on/above the prior surface.
      if (prevY >= prevSurface - landingEps) {
        p.y = surface;
        p.vy = 0;
        p.onGround = true;
      }
    } else if (Math.abs(surface - p.y) <= stepSlack) {
      // Enter from the low end where the ramp meets the slab.
      p.y = surface;
      p.vy = 0;
      p.onGround = true;
    }
  }
}

/**
 * Continuous surface height at `x` for stair/pyramid crates; discrete top
 * otherwise. Monotone stairs lerp floor→landing; pyramids use piecewise
 * centers so the crest still rises and falls.
 */
function obstacleSurfaceY(band: Obstacle[], o: Obstacle, x: number): number {
  if (!isStairCrate(band, o)) return o.y1;
  const run = collectStairRun(band, o);
  if (run.length < 2) return o.y1;

  const sorted = [...run].sort(
    (a, b) => (a.x0 + a.x1) / 2 - (b.x0 + b.x1) / 2
  );
  if (isMonotoneY1(sorted)) {
    const bottom = run.reduce((a, b) => (a.y0 <= b.y0 ? a : b));
    const top = run.reduce((a, b) => (a.y1 >= b.y1 ? a : b));
    const left = Math.min(...run.map((r) => r.x0));
    const right = Math.max(...run.map((r) => r.x1));
    const asc = (bottom.x0 + bottom.x1) / 2 <= (top.x0 + top.x1) / 2;
    const t = asc
      ? (x - left) / Math.max(1e-6, right - left)
      : (right - x) / Math.max(1e-6, right - left);
    const tt = Math.max(0, Math.min(1, t));
    return bottom.y0 + tt * (top.y1 - bottom.y0);
  }

  const pts = [
    { x: sorted[0]!.x0, y: sorted[0]!.y0 },
    ...sorted.map((c) => ({
      x: (c.x0 + c.x1) / 2,
      y: c.y1,
    })),
    {
      x: sorted[sorted.length - 1]!.x1,
      y: sorted[sorted.length - 1]!.y0,
    },
  ];
  if (x <= pts[0]!.x) return pts[0]!.y;
  const last = pts[pts.length - 1]!;
  if (x >= last.x) return last.y;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i]!;
    const b = pts[i + 1]!;
    if (x >= a.x && x <= b.x) {
      const u = (x - a.x) / Math.max(1e-6, b.x - a.x);
      return a.y + u * (b.y - a.y);
    }
  }
  return o.y1;
}

function isMonotoneY1(sorted: Obstacle[]): boolean {
  let sawUp = false;
  let sawDown = false;
  for (let i = 1; i < sorted.length; i++) {
    const dy = sorted[i]!.y1 - sorted[i - 1]!.y1;
    if (dy > 0.05) sawUp = true;
    if (dy < -0.05) sawDown = true;
  }
  return !(sawUp && sawDown);
}

function collectStairRun(band: Obstacle[], seed: Obstacle): Obstacle[] {
  const run: Obstacle[] = [seed];
  const used = new Set<Obstacle>([seed]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const o of band) {
      if (used.has(o)) continue;
      if (o.floorIndex !== seed.floorIndex) continue;
      for (const r of run) {
        const stacked =
          Math.abs(o.y0 - r.y1) <= 0.05 || Math.abs(o.y1 - r.y0) <= 0.05;
        const xOverlap = Math.min(o.x1, r.x1) - Math.max(o.x0, r.x0) > 0;
        if (stacked && xOverlap) {
          run.push(o);
          used.add(o);
          grew = true;
          break;
        }
      }
    }
  }
  return run;
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

/** Prefer the longest corridors, then pick among the top few. */
function pickSpan(rng: { next(): number }, spans: Span[]): Span {
  const ranked = [...spans].sort((a, b) => b.hi - b.lo - (a.hi - a.lo));
  const top = ranked.slice(0, Math.min(3, ranked.length));
  return top[Math.min(top.length - 1, Math.floor(rng.next() * top.length))]!;
}

/** Discrete slots inside a span — center when only one fits. */
function placeAtSpan(
  span: Span,
  width: number,
  rng: { next(): number }
): number {
  const room = span.hi - span.lo - width;
  if (room <= 0) return span.lo;
  const slots = Math.min(
    5,
    Math.max(1, Math.floor(room / Math.max(width * 0.35, 0.8)) + 1)
  );
  if (slots === 1) return span.lo + room / 2;
  const slot = Math.min(slots - 1, Math.floor(rng.next() * slots));
  return span.lo + (room * slot) / (slots - 1);
}

function uniqueSorted(xs: number[]): number[] {
  return [...new Set(xs)].sort((a, b) => a - b);
}
