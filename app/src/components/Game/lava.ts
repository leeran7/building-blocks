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
 * Harden-lava: when active the surface transitions from molten lava to cool
 * gray rock. `hardenProgress` in [0, 1] drives the blend — 0 is fully rock,
 * 1 is fully lava (effect wearing off). -1 means inactive (normal lava).
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
const ROCK_TOP = "#6b6b6b";
const ROCK_MID = "#4a4a4a";
const ROCK_DEEP = "#2d2d2d";
const ROCK_RIM = "#888888";
const ROCK_CORE = "#aaaaaa";
const ROCK_CRACK = "#3a1a0a";

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
   * Intermediate values blend rock → lava as the effect expires.
   */
  hardenProgress: number;
};

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const frac = (v: number) => v - Math.floor(v);

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

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
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
    const t = hardenProgress;
    const topSlowed = "#ffc2e6", midSlowed = LAVA_SLOWED, deepSlowed = "#7a2f5e";
    const topColor = lerpColor(ROCK_TOP, topSlowed, t);
    const midColor = lerpColor(ROCK_MID, midSlowed, t);
    const deepColor = lerpColor(ROCK_DEEP, deepSlowed, t);
    grad.addColorStop(0, topColor);
    grad.addColorStop(0.3, midColor);
    grad.addColorStop(1, deepColor);
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
  const flatness = hardened ? clamp01(1 - hardenProgress) : 0;
  const baseAmp = slowed ? 4 : 9;
  const amp = lerp(baseAmp, 0.5, flatness) * ui;
  const w = Math.max(1, width);
  const a = Math.sin((x / w) * 6.283 * 2.0 + tick * 0.05);
  const b = Math.sin((x / w) * 6.283 * 3.7 - tick * 0.031 + 1.3);
  return (a * 0.6 + b * 0.4) * amp - amp;
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

  // 1) Body — vertical gradient under the crest (rock ↔ molten blend).
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

  // 2) Rim along the crest — from hot glow to cool rock edge.
  ctx.globalCompositeOperation = hardened && rockBlend > 0.5 ? "source-over" : "lighter";
  ctx.beginPath();
  ctx.moveTo(0, crestY[0]);
  for (let i = 1; i <= CREST_SEGMENTS; i++) ctx.lineTo(i * step, crestY[i]);
  const rimColor = hardened
    ? lerpColor(ROCK_RIM, slowed ? "#ffd6ef" : "#ffd24d", hardenProgress)
    : slowed ? "#ffd6ef" : "#ffd24d";
  ctx.strokeStyle = rimColor;
  ctx.lineWidth = lerp(slowed ? 5 : 6, 3, rockBlend) * ui;
  ctx.globalAlpha = lerp(slowed ? 0.28 : 0.4, 0.5, rockBlend);
  if (slowed && !hardened) ctx.setLineDash([9 * ui, 6 * ui]);
  ctx.stroke();
  ctx.setLineDash([]);

  // Thin bright core line on top of the wide glow.
  ctx.beginPath();
  ctx.moveTo(0, crestY[0]);
  for (let i = 1; i <= CREST_SEGMENTS; i++) ctx.lineTo(i * step, crestY[i]);
  const coreColor = hardened
    ? lerpColor(ROCK_CORE, slowed ? "#ffffff" : "#fff8dc", hardenProgress)
    : slowed ? "#ffffff" : "#fff8dc";
  ctx.strokeStyle = coreColor;
  ctx.lineWidth = lerp(slowed ? 1.6 : 2, 1.2, rockBlend) * ui;
  ctx.globalAlpha = lerp(slowed ? 0.65 : 0.95, 0.7, rockBlend);
  ctx.stroke();
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = "source-over";

  // Rock crack lines — visible when hardened, fade as effect wears off.
  if (hardened && rockBlend > 0.1 && !reducedMotion) {
    ctx.globalAlpha = rockBlend * 0.6;
    ctx.strokeStyle = ROCK_CRACK;
    ctx.lineWidth = 1.5 * ui;
    const crackCount = 5;
    for (let i = 0; i < crackCount; i++) {
      const startX = hash(i, 70) * width;
      const startSeg = Math.floor((startX / width) * CREST_SEGMENTS);
      const surfY = crestY[Math.min(startSeg, CREST_SEGMENTS)];
      ctx.beginPath();
      ctx.moveTo(startX, surfY + 2 * ui);
      const segs = 3 + Math.floor(hash(i, 71) * 3);
      let cx = startX, cy = surfY + 2 * ui;
      for (let j = 0; j < segs; j++) {
        cx += (hash(i * 10 + j, 72) - 0.5) * 20 * ui;
        cy += (5 + hash(i * 10 + j, 73) * 15) * ui;
        ctx.lineTo(cx, cy);
      }
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  if (reducedMotion) {
    ctx.restore();
    return;
  }

  // 3) Heat-shimmer haze — fades as rock hardens.
  const hazeFade = hardened ? hardenProgress : 1;
  if (hazeFade > 0.05) {
    ctx.globalCompositeOperation = "lighter";
    for (let i = 0; i < HAZE_COUNT; i++) {
      const drift = Math.sin(tick * (0.02 + 0.01 * hash(i, 5)) + i * 1.7);
      const cx = ((i + 0.5) / HAZE_COUNT + drift * 0.03) * width;
      const cy = top - (14 + 10 * hash(i, 9)) * ui;
      const r = (36 + 30 * hash(i, 13)) * ui;
      const a = (0.05 + 0.04 * (0.5 + 0.5 * Math.sin(tick * 0.05 + i))) * (slowed ? 0.4 : 1) * hazeFade;
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

  // 4) Surface bubbles — swell and pop near the crest; suppress when hardened.
  const bubbleFade = hardened ? hardenProgress : 1;
  if (bubbleFade > 0.05) {
    const bubbleN = slowed ? 3 : BUBBLE_COUNT;
    for (let i = 0; i < bubbleN; i++) {
      const speed = 0.01 + 0.008 * hash(i, 21);
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
      ctx.arc(bx, by, r, 0, 6.283);
      ctx.fill();
      ctx.globalAlpha = 0.6 * swell * bubbleFade;
      ctx.fillStyle = slowed ? "#ffffff" : "#fff8dc";
      ctx.beginPath();
      ctx.arc(bx - r * 0.3, by - r * 0.3, r * 0.4, 0, 6.283);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  // 5) Spat embers — suppress when hardened.
  const emberFade = hardened ? hardenProgress : 1;
  if (emberFade > 0.05) {
    ctx.globalCompositeOperation = "lighter";
    const emberN = slowed ? 2 : EMBER_COUNT;
    for (let i = 0; i < emberN; i++) {
      const speed = 0.012 + 0.01 * hash(i, 41);
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
      ctx.arc(ex, ey, r, 0, 6.283);
      ctx.fill();
      ctx.globalAlpha = a * 0.35;
      ctx.fillRect(ex - r * 0.5, ey, r, (launchY - ey) * 0.3);
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
  }

  ctx.restore();
}
