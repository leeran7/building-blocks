/**
 * Rising hazard (lava) — a molten body, not a flat band.
 *
 * The hazard used to be a single filled rectangle with a straight top edge. It
 * read as geometry, not lava. This renderer gives it a thick body: a vertical
 * gradient (hot crest → deep maroon depth), an animated wavy crest, a glowing
 * hot rim, drifting heat haze above the surface, swelling surface bubbles, and
 * a few spat embers. All of it is rendering-only and DETERMINISTIC — driven by
 * `tick` plus a seeded `hash()` — so it can never desync the byte-identical
 * simulation. `prefers-reduced-motion` freezes every moving term: the crest goes
 * flat and the haze / bubbles / embers drop, leaving a static gradient band.
 *
 * The body is wrapped in save/restore and the crest sample count is fixed
 * (never scales with width) so cost stays flat on a wide canvas and no fill /
 * composite / lineDash state leaks onto gameplay.
 *
 * Harden-lava: when active the lava dramatically solidifies into dark volcanic
 * rock with glowing cracks, then spectacularly breaks apart as the effect wears
 * off — fissures widen, molten glow bleeds through, rock chunks break free,
 * steam vents erupt, and the surface reclaims its motion in a final surge.
 * `hardenProgress` in [0, 1] drives the phases — 0 is fresh rock, 1 is fully
 * returned to lava. -1 means inactive.
 */

import { POWER_UP_SPECS } from "../../game/powerups";

const LAVA = "#ff5a2c"; // ember — the rising hazard
/** Matches the slow-lava orb; also colors the slowed altimeter label in paintClimbFrame. */
export const LAVA_SLOWED = POWER_UP_SPECS["slow-lava"].color;

/** Fixed number of crest samples across the width — cost is width-independent. */
const CREST_SEGMENTS = 40;
/** How deep the vertical gradient reaches below the crest, in px * ui. */
const BODY_DEPTH = 140;
const HAZE_COUNT = 4;
const BUBBLE_COUNT = 7;
const EMBER_COUNT = 6;

// ── Rock palette (harden-lava) ──────────────────────────────────────────────
const ROCK_SURFACE = "#5a5652";
const ROCK_MID = "#3d3835";
const ROCK_DEEP = "#1e1a18";
const ROCK_RIM = "#7a7572";
const ROCK_CORE = "#9e9892";

// ── Crack / melt effect counts (fixed for perf) ────────────────────────────
const CRACK_COUNT = 8;
const CRACK_BRANCH_MAX = 3;
const STEAM_COUNT = 6;
const CHUNK_COUNT = 5;

export type LavaOptions = {
  width: number;
  height: number;
  /** Screen Y of the hazard line (already clamped to >= 0 by the caller). */
  top: number;
  /** UI scale factor (px per authored px). */
  ui: number;
  tick: number;
  reducedMotion: boolean;
  /** slow-lava power-up active — cool the palette and calm the surface. */
  slowed: boolean;
  /**
   * Harden-lava effect progress. -1 = inactive (normal lava). 0 = just
   * activated (fully rock). 1 = effect fully worn off (back to lava).
   * Intermediate values drive a multi-phase rock→lava spectacle.
   */
  hardenProgress: number;
};

const TAU = Math.PI * 2;
const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const frac = (v: number) => v - Math.floor(v);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const smoothstep = (t: number) => t * t * (3 - 2 * t);

function lerpColor(a: string, b: string, t: number): string {
  const pa = parseInt(a.slice(1), 16);
  const pb = parseInt(b.slice(1), 16);
  const ra = (pa >> 16) & 0xff, ga = (pa >> 8) & 0xff, ba2 = pa & 0xff;
  const rb = (pb >> 16) & 0xff, gb = (pb >> 8) & 0xff, bb = pb & 0xff;
  const r = Math.round(ra + (rb - ra) * t);
  const g = Math.round(ga + (gb - ga) * t);
  const bl = Math.round(ba2 + (bb - ba2) * t);
  return `#${((1 << 24) | (r << 16) | (g << 8) | bl).toString(16).slice(1)}`;
}

// ── Cached body gradient ─────────────────────────────────────────────────────
let _bodyGrad: CanvasGradient | null = null;
let _bodyGradUi = 0;
let _bodyGradSlowed: boolean | null = null;
let _bodyGradCtx: CanvasRenderingContext2D | null = null;
let _bodyGradMinCrest = NaN;
let _bodyGradHarden = -2;

function getBodyGradient(
  ctx: CanvasRenderingContext2D,
  ui: number,
  slowed: boolean,
  minCrest: number,
  hardenProgress: number
): CanvasGradient {
  const hp = Math.round(hardenProgress * 100) / 100;
  if (
    _bodyGrad !== null &&
    _bodyGradCtx === ctx &&
    _bodyGradUi === ui &&
    _bodyGradSlowed === slowed &&
    _bodyGradMinCrest === minCrest &&
    _bodyGradHarden === hp
  ) {
    return _bodyGrad;
  }
  const grad = ctx.createLinearGradient(0, minCrest, 0, minCrest + BODY_DEPTH * ui);

  if (hardenProgress >= 0 && hardenProgress < 1) {
    const p = hardenProgress;
    // Phase 1 (0–0.3): solid dark basalt.
    // Phase 2 (0.3–0.7): underglow bleeds through — dark body with warm mid-tones.
    // Phase 3 (0.7–1.0): rapidly returning to molten.
    if (p < 0.3) {
      grad.addColorStop(0, ROCK_SURFACE);
      grad.addColorStop(0.3, ROCK_MID);
      grad.addColorStop(1, ROCK_DEEP);
    } else if (p < 0.7) {
      const t = (p - 0.3) / 0.4;
      const glowTop = lerpColor(ROCK_SURFACE, "#b05020", t);
      const glowMid = lerpColor(ROCK_MID, "#8a2a0e", t);
      const glowDeep = lerpColor(ROCK_DEEP, "#4a1208", t);
      grad.addColorStop(0, glowTop);
      grad.addColorStop(0.3, glowMid);
      grad.addColorStop(1, glowDeep);
    } else {
      const t = (p - 0.7) / 0.3;
      const st = smoothstep(t);
      grad.addColorStop(0, lerpColor("#b05020", slowed ? "#ffc2e6" : "#ffcf5a", st));
      grad.addColorStop(0.3, lerpColor("#8a2a0e", slowed ? LAVA_SLOWED : LAVA, st));
      grad.addColorStop(1, lerpColor("#4a1208", slowed ? "#7a2f5e" : "#6e1a0d", st));
    }
  } else if (slowed) {
    grad.addColorStop(0, "#ffc2e6");
    grad.addColorStop(0.3, LAVA_SLOWED);
    grad.addColorStop(1, "#7a2f5e");
  } else {
    grad.addColorStop(0, "#ffcf5a");
    grad.addColorStop(0.28, LAVA);
    grad.addColorStop(1, "#6e1a0d");
  }
  _bodyGrad = grad;
  _bodyGradCtx = ctx;
  _bodyGradUi = ui;
  _bodyGradSlowed = slowed;
  _bodyGradMinCrest = minCrest;
  _bodyGradHarden = hp;
  return grad;
}

// Haze color constants — avoid per-frame template-literal allocations.
const HAZE_COLOR_OPAQUE = "rgb(255,150,70)";
const HAZE_COLOR_TRANSPARENT = "rgba(255,150,70,0)";

/** Seeded, stable pseudo-random in [0,1). Mirrors climbBackground's hash. */
export function hash(x: number, y: number): number {
  let h = (x | 0) * 374761393 + (y | 0) * 668265263;
  h = (h ^ (h >>> 13)) * 1274126177;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/**
 * Vertical offset (px, downward-positive) of the molten crest at column `x`,
 * relative to the flat hazard line. Two summed sines at different frequencies
 * give an irregular, non-repeating-looking surface. Reduced motion returns 0 so
 * the crest is flat. Slowed shrinks the amplitude so held-back lava reads calm.
 * Pure and deterministic — the unit tests lean on this.
 *
 * The result is always <= 0, i.e. the crest sits at or ABOVE the true hazard
 * line, never below it. That matters: the filled body runs from the crest down,
 * so keeping the crest above the line guarantees the lava always covers every
 * point the sim treats as lethal — a dip below the line would leave a gap where
 * a climber is eliminated with no lava drawn under them, which reads as a bug.
 *
 * When hardened: the smooth sine is blended toward a jagged, stepped rock edge
 * using a hash-based angular offset. The jaggedness flattens as the effect
 * wears off and the lava reclaims its smooth wave.
 */
export function crestOffset(
  x: number,
  width: number,
  ui: number,
  tick: number,
  reducedMotion: boolean,
  slowed: boolean,
  hardenProgress?: number
): number {
  if (reducedMotion) return 0;

  const hardened = hardenProgress !== undefined && hardenProgress >= 0;
  const rockAmount = hardened ? clamp01(1 - hardenProgress) : 0;

  // Normal smooth wave.
  const baseAmp = slowed ? 4 : 9;
  const w = Math.max(1, width);
  const a = Math.sin((x / w) * TAU * 2.0 + tick * 0.05);
  const b = Math.sin((x / w) * TAU * 3.7 - tick * 0.031 + 1.3);
  const smoothWave = (a * 0.6 + b * 0.4);

  if (!hardened) {
    const amp = baseAmp * ui;
    return smoothWave * amp - amp;
  }

  // Jagged rock edge: hash-based angular steps blended with the smooth wave.
  const seg = Math.floor((x / w) * CREST_SEGMENTS);
  const jaggedRaw = hash(seg, 301) * 2 - 1;
  const jagged = jaggedRaw;

  const blended = lerp(smoothWave, jagged, rockAmount);
  const amp = lerp(baseAmp, 3, rockAmount) * ui;
  return blended * amp - amp;
}

// ── Hardened-only drawing helpers ───────────────────────────────────────────

function drawCrackNetwork(
  ctx: CanvasRenderingContext2D,
  width: number,
  top: number,
  height: number,
  ui: number,
  tick: number,
  crestY: number[],
  rockBlend: number,
  hardenProgress: number,
): void {
  // Pulsing underglow intensity — heartbeat rhythm.
  const heartbeat = 0.5 + 0.5 * Math.sin(tick * 0.08) * Math.sin(tick * 0.035 + 0.7);
  const glowIntensity = lerp(0.15, 0.7, hardenProgress) * heartbeat;
  // Crack width widens as the rock weakens.
  const crackWidth = lerp(1.5, 5, hardenProgress) * ui;
  const glowWidth = crackWidth * 3;

  for (let i = 0; i < CRACK_COUNT; i++) {
    const startFrac = hash(i, 100);
    const startX = startFrac * width;
    const startSeg = Math.floor(startFrac * CREST_SEGMENTS);
    const surfY = crestY[Math.min(startSeg, CREST_SEGMENTS)];

    // Main trunk crack.
    const points: { x: number; y: number }[] = [{ x: startX, y: surfY }];
    const trunkSegs = 4 + Math.floor(hash(i, 101) * 3);
    let cx = startX, cy = surfY;
    for (let j = 0; j < trunkSegs; j++) {
      const dx = (hash(i * 7 + j, 102) - 0.5) * 28 * ui;
      const dy = (8 + hash(i * 7 + j, 103) * 18) * ui;
      cx += dx;
      cy += dy;
      if (cy > height) break;
      points.push({ x: cx, y: cy });
    }

    // Underglow — wide, soft, lava-colored stroke behind the crack.
    ctx.globalAlpha = glowIntensity * rockBlend;
    ctx.strokeStyle = lerpColor("#ff3300", "#ffaa00", hash(i, 104));
    ctx.lineWidth = glowWidth;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (let j = 1; j < points.length; j++) ctx.lineTo(points[j].x, points[j].y);
    ctx.stroke();

    // Dark crack line on top.
    ctx.globalAlpha = rockBlend * 0.8;
    ctx.strokeStyle = lerpColor("#1a0a00", "#3d1a05", hardenProgress);
    ctx.lineWidth = crackWidth;
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (let j = 1; j < points.length; j++) ctx.lineTo(points[j].x, points[j].y);
    ctx.stroke();

    // Branches — smaller cracks forking off the trunk.
    const branches = Math.min(CRACK_BRANCH_MAX, Math.floor(hash(i, 105) * 4));
    for (let b = 0; b < branches; b++) {
      const branchIdx = Math.floor(hash(i * 5 + b, 106) * (points.length - 1)) + 1;
      if (branchIdx >= points.length) continue;
      const bp = points[branchIdx];
      const bLen = 2 + Math.floor(hash(i * 5 + b, 107) * 2);
      let bx = bp.x, by = bp.y;
      const dir = hash(i * 5 + b, 108) < 0.5 ? -1 : 1;

      ctx.globalAlpha = glowIntensity * rockBlend * 0.6;
      ctx.strokeStyle = lerpColor("#ff3300", "#ffaa00", hash(i * 5 + b, 109));
      ctx.lineWidth = glowWidth * 0.6;
      ctx.beginPath();
      ctx.moveTo(bx, by);
      for (let k = 0; k < bLen; k++) {
        bx += dir * (5 + hash(i * 10 + b * 3 + k, 110) * 15) * ui;
        by += (4 + hash(i * 10 + b * 3 + k, 111) * 10) * ui;
        ctx.lineTo(bx, by);
      }
      ctx.stroke();

      ctx.globalAlpha = rockBlend * 0.6;
      ctx.strokeStyle = "#1a0a00";
      ctx.lineWidth = crackWidth * 0.6;
      ctx.beginPath();
      ctx.moveTo(bp.x, bp.y);
      bx = bp.x; by = bp.y;
      for (let k = 0; k < bLen; k++) {
        bx += dir * (5 + hash(i * 10 + b * 3 + k, 110) * 15) * ui;
        by += (4 + hash(i * 10 + b * 3 + k, 111) * 10) * ui;
        ctx.lineTo(bx, by);
      }
      ctx.stroke();
    }
  }

  ctx.lineCap = "butt";
  ctx.globalAlpha = 1;
}

function drawSteamWisps(
  ctx: CanvasRenderingContext2D,
  width: number,
  top: number,
  ui: number,
  tick: number,
  rockBlend: number,
  hardenProgress: number,
): void {
  for (let i = 0; i < STEAM_COUNT; i++) {
    const speed = 0.008 + 0.006 * hash(i, 200);
    const life = frac(hash(i, 201) + tick * speed);
    const rise = life;
    const fade = 1 - life;
    if (fade < 0.05) continue;

    const sx = hash(i, 202) * width;
    const baseY = top - 2 * ui;
    // Steam rises and drifts sideways.
    const sy = baseY - rise * (30 + 25 * hash(i, 203)) * ui;
    const drift = Math.sin(tick * 0.03 + i * 2.3) * 8 * ui;
    const px = sx + drift * rise;

    const r = (3 + 5 * hash(i, 204)) * ui * (0.5 + rise * 0.5);
    // Wispy shape — stretched vertically.
    ctx.globalAlpha = fade * 0.35 * rockBlend;
    ctx.fillStyle = `rgba(200,195,190,${fade * 0.3})`;
    ctx.beginPath();
    ctx.ellipse(px, sy, r, r * 1.6, 0, 0, TAU);
    ctx.fill();

    // Brighter core when cracks are glowing (hardenProgress > 0.3).
    if (hardenProgress > 0.3) {
      const glowT = clamp01((hardenProgress - 0.3) / 0.4);
      ctx.globalAlpha = fade * 0.2 * glowT * rockBlend;
      ctx.fillStyle = "#ff8844";
      ctx.beginPath();
      ctx.ellipse(px, sy, r * 0.4, r * 0.8, 0, 0, TAU);
      ctx.fill();
    }
  }
  ctx.globalAlpha = 1;
}

function drawRockChunks(
  ctx: CanvasRenderingContext2D,
  width: number,
  top: number,
  ui: number,
  tick: number,
  crestY: number[],
  hardenProgress: number,
): void {
  // Chunks only appear when the rock is breaking apart (progress > 0.4).
  if (hardenProgress < 0.4) return;
  const intensity = clamp01((hardenProgress - 0.4) / 0.5);

  for (let i = 0; i < CHUNK_COUNT; i++) {
    const chunkSpeed = 0.006 + 0.005 * hash(i, 300);
    // Stagger chunk appearance — each chunk activates at a different threshold.
    const threshold = 0.4 + hash(i, 301) * 0.35;
    if (hardenProgress < threshold) continue;

    const life = frac(hash(i, 302) + tick * chunkSpeed);
    const active = life < 0.7;
    if (!active) continue;
    const t = life / 0.7; // 0→1 over the active phase.

    const cx = hash(i, 303) * width;
    const seg = Math.floor((cx / width) * CREST_SEGMENTS);
    const surfY = crestY[Math.min(seg, CREST_SEGMENTS)];
    // Chunk lifts off the surface then sinks and dissolves.
    const liftArc = Math.sin(t * Math.PI);
    const liftH = (10 + 15 * hash(i, 304)) * ui * intensity;
    const cy = surfY - liftArc * liftH;
    const rotation = t * (1 + hash(i, 305)) * 2;
    const size = (4 + 4 * hash(i, 306)) * ui;
    const dissolve = t > 0.5 ? clamp01((t - 0.5) / 0.5) : 0;

    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(rotation);
    ctx.globalAlpha = (1 - dissolve) * 0.85 * intensity;

    // Angular rock chunk shape.
    ctx.fillStyle = lerpColor(ROCK_SURFACE, "#8a4020", dissolve);
    ctx.beginPath();
    ctx.moveTo(-size, -size * 0.6);
    ctx.lineTo(size * 0.3, -size);
    ctx.lineTo(size, -size * 0.2);
    ctx.lineTo(size * 0.7, size * 0.8);
    ctx.lineTo(-size * 0.5, size);
    ctx.closePath();
    ctx.fill();

    // Glowing edge on the chunk as it heats up and dissolves.
    if (dissolve > 0) {
      ctx.strokeStyle = lerpColor("#ff5500", "#ffcc00", dissolve);
      ctx.lineWidth = lerp(0.5, 2, dissolve) * ui;
      ctx.globalAlpha = dissolve * 0.8 * intensity;
      ctx.stroke();
    }

    ctx.restore();
  }
  ctx.globalAlpha = 1;
}

function drawRockGrain(
  ctx: CanvasRenderingContext2D,
  width: number,
  top: number,
  height: number,
  ui: number,
  crestY: number[],
  rockBlend: number,
): void {
  // Subtle stippled texture on the rock surface — fixed 12 dots.
  const dotCount = 12;
  ctx.fillStyle = "#000000";
  for (let i = 0; i < dotCount; i++) {
    const dx = hash(i, 400) * width;
    const seg = Math.floor((dx / width) * CREST_SEGMENTS);
    const surfY = crestY[Math.min(seg, CREST_SEGMENTS)];
    const depth = (10 + hash(i, 401) * 60) * ui;
    const dy = surfY + depth;
    if (dy > height) continue;
    const r = (0.8 + hash(i, 402) * 1.2) * ui;
    ctx.globalAlpha = rockBlend * (0.08 + hash(i, 403) * 0.12);
    ctx.beginPath();
    ctx.arc(dx, dy, r, 0, TAU);
    ctx.fill();
  }

  // Highlight speckles — lighter spots for mineral texture.
  ctx.fillStyle = "#aaa8a4";
  for (let i = 0; i < 8; i++) {
    const dx = hash(i, 410) * width;
    const seg = Math.floor((dx / width) * CREST_SEGMENTS);
    const surfY = crestY[Math.min(seg, CREST_SEGMENTS)];
    const depth = (5 + hash(i, 411) * 40) * ui;
    const dy = surfY + depth;
    if (dy > height) continue;
    const r = (0.6 + hash(i, 412) * 0.8) * ui;
    ctx.globalAlpha = rockBlend * (0.06 + hash(i, 413) * 0.1);
    ctx.beginPath();
    ctx.arc(dx, dy, r, 0, TAU);
    ctx.fill();
  }

  ctx.globalAlpha = 1;
}

function drawMeltSurge(
  ctx: CanvasRenderingContext2D,
  width: number,
  top: number,
  ui: number,
  tick: number,
  hardenProgress: number,
): void {
  // Near the end (0.85–1.0), a bright surge wave sweeps across as lava
  // reclaims — an additive glow band that travels left to right.
  if (hardenProgress < 0.85) return;
  const t = clamp01((hardenProgress - 0.85) / 0.15);
  const waveFront = t * width * 1.3 - width * 0.15;
  const waveWidth = 60 * ui;

  ctx.globalCompositeOperation = "lighter";
  const g = ctx.createLinearGradient(
    waveFront - waveWidth, 0,
    waveFront + waveWidth, 0
  );
  g.addColorStop(0, "rgba(255,200,80,0)");
  g.addColorStop(0.4, `rgba(255,160,40,${0.3 * (1 - t)})`);
  g.addColorStop(0.5, `rgba(255,220,100,${0.5 * (1 - t)})`);
  g.addColorStop(0.6, `rgba(255,160,40,${0.3 * (1 - t)})`);
  g.addColorStop(1, "rgba(255,200,80,0)");
  ctx.globalAlpha = 1;
  ctx.fillStyle = g;
  ctx.fillRect(0, top - 20 * ui, width, 80 * ui);
  ctx.globalCompositeOperation = "source-over";
  ctx.globalAlpha = 1;
}

/** Draw the molten hazard from `top` down to the bottom of the canvas. */
export function drawLava(ctx: CanvasRenderingContext2D, opts: LavaOptions): void {
  const { width, height, top, ui, reducedMotion, slowed, hardenProgress } = opts;
  const tick = reducedMotion ? 0 : opts.tick;
  const hardened = hardenProgress >= 0;
  const rockBlend = hardened ? clamp01(1 - hardenProgress) : 0;

  ctx.save();

  // Build the crest path (fixed sample count, independent of width).
  const step = width / CREST_SEGMENTS;
  const crestY: number[] = [];
  let minCrest = Infinity;
  for (let i = 0; i <= CREST_SEGMENTS; i++) {
    const x = i * step;
    const y = top + crestOffset(x, width, ui, tick, reducedMotion, slowed, hardenProgress);
    crestY.push(y);
    if (y < minCrest) minCrest = y;
  }

  // 1) Molten body — vertical gradient under the crest.
  const grad = getBodyGradient(ctx, ui, slowed, minCrest, hardenProgress);
  ctx.beginPath();
  ctx.moveTo(0, crestY[0]);
  for (let i = 1; i <= CREST_SEGMENTS; i++) ctx.lineTo(i * step, crestY[i]);
  ctx.lineTo(width, height);
  ctx.lineTo(0, height);
  ctx.closePath();
  const baseAlpha = slowed ? 0.6 : reducedMotion ? 0.9 : 0.82;
  ctx.globalAlpha = hardened ? lerp(0.95, baseAlpha, hardenProgress) : baseAlpha;
  ctx.fillStyle = grad;
  ctx.fill();
  ctx.globalAlpha = 1;

  // Rock grain texture — visible when hardened, gives the surface a stone feel.
  if (hardened && rockBlend > 0.1 && !reducedMotion) {
    drawRockGrain(ctx, width, top, height, ui, crestY, rockBlend);
  }

  // 2) Glowing hot rim along the crest.
  ctx.globalCompositeOperation = hardened && rockBlend > 0.5 ? "source-over" : "lighter";
  ctx.beginPath();
  ctx.moveTo(0, crestY[0]);
  for (let i = 1; i <= CREST_SEGMENTS; i++) ctx.lineTo(i * step, crestY[i]);
  const rimColor = hardened
    ? lerpColor(ROCK_RIM, slowed ? "#ffd6ef" : "#ffd24d", smoothstep(hardenProgress))
    : slowed ? "#ffd6ef" : "#ffd24d";
  ctx.strokeStyle = rimColor;
  ctx.lineWidth = lerp(slowed ? 5 : 6, 3, rockBlend) * ui;
  ctx.globalAlpha = lerp(slowed ? 0.28 : 0.4, 0.5, rockBlend);
  if (slowed && !hardened) ctx.setLineDash([9 * ui, 6 * ui]);
  ctx.stroke();
  ctx.setLineDash([]);
  // A thin bright core line on top of the wide glow.
  ctx.beginPath();
  ctx.moveTo(0, crestY[0]);
  for (let i = 1; i <= CREST_SEGMENTS; i++) ctx.lineTo(i * step, crestY[i]);
  const coreColor = hardened
    ? lerpColor(ROCK_CORE, slowed ? "#ffffff" : "#fff8dc", smoothstep(hardenProgress))
    : slowed ? "#ffffff" : "#fff8dc";
  ctx.strokeStyle = coreColor;
  ctx.lineWidth = lerp(slowed ? 1.6 : 2, 1.2, rockBlend) * ui;
  ctx.globalAlpha = lerp(slowed ? 0.65 : 0.95, 0.7, rockBlend);
  ctx.stroke();
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = "source-over";

  // Crack network with glowing underglow — the signature hardened effect.
  if (hardened && rockBlend > 0.05 && !reducedMotion) {
    drawCrackNetwork(ctx, width, top, height, ui, tick, crestY, rockBlend, hardenProgress);
  }

  if (reducedMotion) {
    ctx.restore();
    return;
  }

  // Steam wisps rising from the rock surface.
  if (hardened && rockBlend > 0.05) {
    drawSteamWisps(ctx, width, top, ui, tick, rockBlend, hardenProgress);
  }

  // Rock chunks breaking free as the surface melts.
  if (hardened && hardenProgress > 0.4) {
    drawRockChunks(ctx, width, top, ui, tick, crestY, hardenProgress);
  }

  // Melt-surge wave near the end of the effect.
  if (hardened && hardenProgress > 0.85) {
    drawMeltSurge(ctx, width, top, ui, tick, hardenProgress);
  }

  // 3) Heat-shimmer haze — suppressed while hardened, returns with intensity.
  const hazeFade = hardened ? smoothstep(hardenProgress) : 1;
  if (hazeFade > 0.05) {
    ctx.globalCompositeOperation = "lighter";
    // Extra haze when the rock is breaking apart (progress > 0.5).
    const hazeBoost = hardened && hardenProgress > 0.5 ? 1.5 : 1;
    for (let i = 0; i < HAZE_COUNT; i++) {
      const drift = Math.sin(tick * (0.02 + 0.01 * hash(i, 5)) + i * 1.7);
      const cx = ((i + 0.5) / HAZE_COUNT + drift * 0.03) * width;
      const cy = top - (14 + 10 * hash(i, 9)) * ui;
      const r = (36 + 30 * hash(i, 13)) * ui;
      const a = (0.05 + 0.04 * (0.5 + 0.5 * Math.sin(tick * 0.05 + i))) * (slowed ? 0.4 : 1) * hazeFade * hazeBoost;
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
      g.addColorStop(0, HAZE_COLOR_OPAQUE);
      g.addColorStop(1, HAZE_COLOR_TRANSPARENT);
      ctx.globalAlpha = a;
      ctx.fillStyle = g;
      ctx.fillRect(cx - r, cy - r * 1.4, r * 2, r * 2.4);
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
  }

  // 4) Surface bubbles — suppressed when hardened; surge on return.
  const bubbleFade = hardened ? smoothstep(hardenProgress) : 1;
  if (bubbleFade > 0.05) {
    const surgeBoost = hardened && hardenProgress > 0.8 ? 1.8 : 1;
    const bubbleN = slowed ? 3 : BUBBLE_COUNT;
    for (let i = 0; i < bubbleN; i++) {
      const speed = (0.01 + 0.008 * hash(i, 21)) * surgeBoost;
      const p = frac(hash(i, 23) + tick * speed);
      const swell = Math.sin(p * Math.PI);
      if (swell <= 0.05) continue;
      const bx = hash(i, 27) * width;
      const surfaceY = top + crestOffset(bx, width, ui, tick, reducedMotion, slowed, hardenProgress);
      const by = surfaceY - swell * 4 * ui;
      const r = (2.5 + 4 * hash(i, 29)) * ui * swell;
      ctx.globalAlpha = 0.5 * swell * bubbleFade;
      ctx.fillStyle = slowed ? "#ffd6ef" : "#ffb24d";
      ctx.beginPath();
      ctx.arc(bx, by, r, 0, TAU);
      ctx.fill();
      // Bright highlight on the bubble crown.
      ctx.globalAlpha = 0.6 * swell * bubbleFade;
      ctx.fillStyle = slowed ? "#ffffff" : "#fff8dc";
      ctx.beginPath();
      ctx.arc(bx - r * 0.3, by - r * 0.3, r * 0.4, 0, TAU);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  // 5) Spat embers — suppressed when hardened; dramatic surge on return.
  const emberFade = hardened ? smoothstep(hardenProgress) : 1;
  if (emberFade > 0.05) {
    ctx.globalCompositeOperation = "lighter";
    const surgeBoost = hardened && hardenProgress > 0.8 ? 2 : 1;
    const emberN = slowed ? 2 : EMBER_COUNT;
    for (let i = 0; i < emberN; i++) {
      const speed = (0.012 + 0.01 * hash(i, 41)) * surgeBoost;
      const p = frac(hash(i, 43) + tick * speed);
      const ex = hash(i, 47) * width + Math.sin(tick * 0.04 + i) * 6 * ui;
      const launchY = top + crestOffset(ex, width, ui, tick, reducedMotion, slowed, hardenProgress);
      const arc = (30 + 40 * hash(i, 49)) * ui;
      const ey = launchY - Math.sin(p * Math.PI) * arc;
      const a = clamp01(Math.sin(p * Math.PI) * 0.9) * emberFade;
      if (a <= 0.02) continue;
      const r = (1.5 + 2 * hash(i, 53)) * ui;
      ctx.globalAlpha = a;
      ctx.fillStyle = "#ffd24d";
      ctx.beginPath();
      ctx.arc(ex, ey, r, 0, TAU);
      ctx.fill();
      // Faint trailing tail toward the launch point.
      ctx.globalAlpha = a * 0.35;
      ctx.fillRect(ex - r * 0.5, ey, r, (launchY - ey) * 0.3);
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
  }

  ctx.restore();
}
