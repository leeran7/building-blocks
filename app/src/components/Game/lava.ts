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
 */

const LAVA = "#ff5a2c"; // ember — the rising hazard
/** Matches the slow-lava orb; also used by the HUD label in ClimbCanvas. */
export const LAVA_SLOWED = "#ff8ad4";

/** Fixed number of crest samples across the width — cost is width-independent. */
const CREST_SEGMENTS = 40;
/** How deep the vertical gradient reaches below the crest, in px * ui. */
const BODY_DEPTH = 140;
const HAZE_COUNT = 4;
const BUBBLE_COUNT = 7;
const EMBER_COUNT = 6;

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
};

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const frac = (v: number) => v - Math.floor(v);

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
  slowed: boolean
): number {
  if (reducedMotion) return 0;
  const amp = (slowed ? 4 : 9) * ui;
  const w = Math.max(1, width);
  const a = Math.sin((x / w) * 6.283 * 2.0 + tick * 0.05);
  const b = Math.sin((x / w) * 6.283 * 3.7 - tick * 0.031 + 1.3);
  // (a*0.6 + b*0.4) is in [-1, 1]; the "- amp" bias maps it to [-2amp, 0] so
  // the crest never dips below the hazard line (see the doc comment above).
  return (a * 0.6 + b * 0.4) * amp - amp;
}

/** Draw the molten hazard from `top` down to the bottom of the canvas. */
export function drawLava(ctx: CanvasRenderingContext2D, opts: LavaOptions): void {
  const { width, height, top, ui, reducedMotion, slowed } = opts;
  const tick = reducedMotion ? 0 : opts.tick;
  const base = slowed ? LAVA_SLOWED : LAVA;

  ctx.save();

  // Build the crest path (fixed sample count, independent of width).
  const step = width / CREST_SEGMENTS;
  const crestY: number[] = [];
  let minCrest = Infinity;
  for (let i = 0; i <= CREST_SEGMENTS; i++) {
    const x = i * step;
    const y = top + crestOffset(x, width, ui, tick, reducedMotion, slowed);
    crestY.push(y);
    if (y < minCrest) minCrest = y;
  }

  // 1) Molten body — vertical gradient under the crest.
  const grad = ctx.createLinearGradient(0, minCrest, 0, minCrest + BODY_DEPTH * ui);
  if (slowed) {
    grad.addColorStop(0, "#ffc2e6");
    grad.addColorStop(0.3, LAVA_SLOWED);
    grad.addColorStop(1, "#7a2f5e");
  } else {
    grad.addColorStop(0, "#ffcf5a");
    grad.addColorStop(0.28, LAVA);
    grad.addColorStop(1, "#6e1a0d");
  }
  ctx.beginPath();
  ctx.moveTo(0, crestY[0]);
  for (let i = 1; i <= CREST_SEGMENTS; i++) ctx.lineTo(i * step, crestY[i]);
  ctx.lineTo(width, height);
  ctx.lineTo(0, height);
  ctx.closePath();
  ctx.globalAlpha = slowed ? 0.6 : reducedMotion ? 0.9 : 0.82;
  ctx.fillStyle = grad;
  ctx.fill();
  ctx.globalAlpha = 1;

  // 2) Glowing hot rim along the crest — additive so it reads as heat.
  ctx.globalCompositeOperation = "lighter";
  ctx.beginPath();
  ctx.moveTo(0, crestY[0]);
  for (let i = 1; i <= CREST_SEGMENTS; i++) ctx.lineTo(i * step, crestY[i]);
  ctx.strokeStyle = slowed ? "#ffd6ef" : "#ffd24d";
  ctx.lineWidth = (slowed ? 5 : 6) * ui;
  ctx.globalAlpha = slowed ? 0.28 : 0.4;
  if (slowed) ctx.setLineDash([9 * ui, 6 * ui]);
  ctx.stroke();
  ctx.setLineDash([]);
  // A thin bright core line on top of the wide glow.
  ctx.beginPath();
  ctx.moveTo(0, crestY[0]);
  for (let i = 1; i <= CREST_SEGMENTS; i++) ctx.lineTo(i * step, crestY[i]);
  ctx.strokeStyle = slowed ? "#ffffff" : "#fff0c0";
  ctx.lineWidth = (slowed ? 1.6 : 2) * ui;
  ctx.globalAlpha = slowed ? 0.5 : 0.75;
  ctx.stroke();
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = "source-over";

  if (reducedMotion) {
    ctx.restore();
    return;
  }

  // 3) Heat-shimmer haze — wide, faint, drifting glows just above the crest.
  ctx.globalCompositeOperation = "lighter";
  for (let i = 0; i < HAZE_COUNT; i++) {
    const drift = Math.sin(tick * (0.02 + 0.01 * hash(i, 5)) + i * 1.7);
    const cx = ((i + 0.5) / HAZE_COUNT + drift * 0.03) * width;
    const cy = top - (14 + 10 * hash(i, 9)) * ui;
    const r = (36 + 30 * hash(i, 13)) * ui;
    const a = (0.05 + 0.04 * (0.5 + 0.5 * Math.sin(tick * 0.05 + i))) * (slowed ? 0.4 : 1);
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
    g.addColorStop(0, `rgba(255,150,70,${a.toFixed(3)})`);
    g.addColorStop(1, "rgba(255,150,70,0)");
    ctx.fillStyle = g;
    ctx.fillRect(cx - r, cy - r * 1.4, r * 2, r * 2.4);
  }
  ctx.globalCompositeOperation = "source-over";

  // 4) Surface bubbles — swell and pop near the crest on a seeded cadence.
  const bubbleN = slowed ? 3 : BUBBLE_COUNT;
  for (let i = 0; i < bubbleN; i++) {
    const speed = 0.01 + 0.008 * hash(i, 21);
    const p = frac(hash(i, 23) + tick * speed); // 0→1 life cycle
    const swell = Math.sin(p * Math.PI); // 0 at ends, 1 mid-life
    if (swell <= 0.05) continue;
    const bx = hash(i, 27) * width;
    const surfaceY = top + crestOffset(bx, width, ui, tick, reducedMotion, slowed);
    const by = surfaceY - swell * 4 * ui;
    const r = (2.5 + 4 * hash(i, 29)) * ui * swell;
    ctx.globalAlpha = 0.5 * swell;
    ctx.fillStyle = slowed ? "#ffd6ef" : "#ffb24d";
    ctx.beginPath();
    ctx.arc(bx, by, r, 0, 6.283);
    ctx.fill();
    // Bright highlight on the bubble crown.
    ctx.globalAlpha = 0.6 * swell;
    ctx.fillStyle = slowed ? "#ffffff" : "#fff0c0";
    ctx.beginPath();
    ctx.arc(bx - r * 0.3, by - r * 0.3, r * 0.4, 0, 6.283);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  // 5) Spat embers — short-lived sparks launched up from the crest.
  ctx.globalCompositeOperation = "lighter";
  const emberN = slowed ? 2 : EMBER_COUNT;
  for (let i = 0; i < emberN; i++) {
    const speed = 0.012 + 0.01 * hash(i, 41);
    const p = frac(hash(i, 43) + tick * speed);
    const ex = hash(i, 47) * width + Math.sin(tick * 0.04 + i) * 6 * ui;
    const launchY = top + crestOffset(ex, width, ui, tick, reducedMotion, slowed);
    const arc = (30 + 40 * hash(i, 49)) * ui; // apex height
    const ey = launchY - Math.sin(p * Math.PI) * arc;
    const a = clamp01(Math.sin(p * Math.PI) * 0.9);
    if (a <= 0.02) continue;
    const r = (1.5 + 2 * hash(i, 53)) * ui;
    ctx.globalAlpha = a;
    ctx.fillStyle = "#ffd24d";
    ctx.beginPath();
    ctx.arc(ex, ey, r, 0, 6.283);
    ctx.fill();
    // Faint trailing tail toward the launch point.
    ctx.globalAlpha = a * 0.35;
    ctx.fillRect(ex - r * 0.5, ey, r, (launchY - ey) * 0.3);
  }
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = "source-over";

  ctx.restore();
}
