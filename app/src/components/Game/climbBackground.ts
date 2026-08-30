"use client";

/**
 * Climb backdrop — a flat, animated volcano.
 *
 * The climber is scaling a tower on the flank of an erupting volcano, which is
 * what the rising lava IS: a dark mountain fills the lower sky, its crater
 * glowing and breathing, lava veins shimmering down the slopes, ash drifting up,
 * and embers streaming into a warm dusk sky. It is a single screen-space scene
 * (no parallax layers) animated entirely from the tick — cheap to draw: a couple
 * of gradients, one silhouette, a handful of veins/smoke puffs, and ~40 embers,
 * versus the thousands of fills a tiled city cost.
 *
 * Purely cosmetic and render-only — it never touches the simulation and is a
 * pure function of (width, height, camWorldY, tick). camWorldY only cools the
 * scene slightly as you climb away from the heat. reducedMotion freezes all
 * motion (embers, ash, glow pulse, vein shimmer, twinkle) to a steady frame; the
 * scene still draws.
 */

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const frac = (v: number) => v - Math.floor(v);

/** Cheap 2D value hash → [0,1). Stable per index, so nothing jitters. */
function hash(x: number, y: number): number {
  let h = (x | 0) * 374761393 + (y | 0) * 668265263;
  h = (h ^ (h >>> 13)) * 1274126177;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

// Warm volcanic palette, kept off the lime climber (#cbf24d): sky purples, a
// near-black mountain, and ember golds for the lava/crater/embers.
const SKY_TOP: [number, number, number] = [10, 11, 22];
const SKY_MID: [number, number, number] = [26, 18, 32];
const SKY_HORIZON: [number, number, number] = [58, 27, 32];
const MOUNTAIN = "#141019";
const MOUNTAIN_BASE = "#0c0912";
// Deep red-orange sparks. Kept out of the amber/gold band so a drifting ember
// is never mistaken for the jetpack orb (#ff9a4a) or the sprint-burst gold; the
// solid rising gameplay-lava band stays distinct from these tiny particles.
const EMBER = ["255,74,36", "255,102,48", "255,132,64"];

const EMBER_COUNT = 42;
const SMOKE_COUNT = 6;

/** Draw the volcano scene behind the tower for the current frame. */
export function drawClimbBackground(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  camWorldY: number,
  viewH: number,
  pxPerM: number,
  tick: number,
  reducedMotion: boolean
): void {
  const ui = Math.max(1, width / 360);
  const t = reducedMotion ? 0 : tick;
  // Climbing lifts you out of the worst heat: the glow, embers and haze ease off
  // with altitude but never vanish.
  const heat = 0.45 + 0.55 * clamp01(1 - camWorldY / 700);

  // Volcano geometry (fractions of the canvas, so it scales with any size).
  const peakX = width * 0.5;
  const peakY = height * 0.37;
  const craterHalf = width * 0.07;
  const craterDip = height * 0.02;

  drawSky(ctx, width, height);
  drawStars(ctx, width, height, t, reducedMotion);
  drawCraterGlow(ctx, peakX, peakY, width, height, t, heat, reducedMotion);
  drawMountain(ctx, width, height, peakX, peakY, craterHalf, craterDip, ui, t, heat, reducedMotion);
  drawSmoke(ctx, peakX, peakY, width, height, ui, t, reducedMotion);
  drawEmbers(ctx, width, height, peakX, ui, t, heat, reducedMotion);
  drawHeatHaze(ctx, width, height, t, heat, reducedMotion);
}

const rgb = (c: [number, number, number]) => `rgb(${c[0] | 0},${c[1] | 0},${c[2] | 0})`;

function mix(
  a: [number, number, number],
  b: [number, number, number],
  t: number
): string {
  return rgb([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]);
}

function drawSky(ctx: CanvasRenderingContext2D, width: number, height: number): void {
  const g = ctx.createLinearGradient(0, 0, 0, height);
  g.addColorStop(0, rgb(SKY_TOP));
  g.addColorStop(0.55, rgb(SKY_MID));
  g.addColorStop(1, mix(SKY_MID, SKY_HORIZON, 0.8));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, width, height);
}

function drawStars(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  t: number,
  reducedMotion: boolean
): void {
  // A light sprinkle in the upper sky only, above the mountain.
  ctx.fillStyle = "#dfe3f2";
  const cols = Math.ceil(width / 46) + 1;
  const rows = Math.ceil(height * 0.4 / 46);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const h0 = hash(c * 3 + 7, r * 5 + 7);
      if (h0 > 0.42) continue;
      const x = (c + hash(c, r)) * 46;
      const y = (r + hash(c + 2, r + 2)) * 46;
      const tw = reducedMotion ? 0.7 : 0.5 + 0.5 * Math.sin(t * 0.05 + h0 * 6.283);
      ctx.globalAlpha = clamp01((0.35 + 0.5 * h0) * tw) * clamp01(1 - y / (height * 0.5));
      ctx.fillRect(x, y, 1.4, 1.4);
    }
  }
  ctx.globalAlpha = 1;
}

/** Warm halo around the crater — lights the peak and the sky above it, and
 *  breathes so the volcano feels alive. */
function drawCraterGlow(
  ctx: CanvasRenderingContext2D,
  peakX: number,
  peakY: number,
  width: number,
  height: number,
  t: number,
  heat: number,
  reducedMotion: boolean
): void {
  const pulse = reducedMotion ? 1 : 1 + 0.12 * Math.sin(t * 0.05);
  const r = width * 0.5 * pulse;
  const cy = peakY + height * 0.02;
  const a = 0.5 * heat;
  const prev = ctx.globalCompositeOperation;
  ctx.globalCompositeOperation = "lighter";
  const g = ctx.createRadialGradient(peakX, cy, 0, peakX, cy, r);
  g.addColorStop(0, `rgba(255,140,70,${(a).toFixed(3)})`);
  g.addColorStop(0.35, `rgba(210,70,50,${(a * 0.5).toFixed(3)})`);
  g.addColorStop(1, "rgba(120,40,60,0)");
  ctx.fillStyle = g;
  // Only the glow's bounding box — the gradient is fully transparent past r, so
  // a full-canvas 'lighter' fill would composite mostly-empty pixels for nothing.
  ctx.fillRect(peakX - r, cy - r, r * 2, r * 2);
  ctx.globalCompositeOperation = prev;
}

/** The mountain silhouette + rim light + shimmering lava veins. */
function drawMountain(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  peakX: number,
  peakY: number,
  craterHalf: number,
  craterDip: number,
  ui: number,
  t: number,
  heat: number,
  reducedMotion: boolean
): void {
  const baseY = height * 1.02;
  // Ridge from base up to the crater rim, dipping into the crater, back down.
  // A little hashed jitter on the shoulders keeps it from reading as a triangle.
  const ridge: Array<[number, number]> = [
    [-width * 0.06, baseY],
    [width * 0.1, height * (0.86 + 0.03 * hash(1, 3))],
    [width * 0.26, height * (0.66 + 0.03 * hash(2, 3))],
    [width * 0.4, height * (0.49 + 0.02 * hash(3, 3))],
    [peakX - craterHalf, peakY + craterDip],
    [peakX - craterHalf * 0.45, peakY + craterDip * 1.7],
    [peakX + craterHalf * 0.45, peakY + craterDip * 1.7],
    [peakX + craterHalf, peakY + craterDip],
    [width * 0.61, height * (0.5 + 0.02 * hash(4, 3))],
    [width * 0.75, height * (0.67 + 0.03 * hash(5, 3))],
    [width * 0.9, height * (0.85 + 0.03 * hash(6, 3))],
    [width * 1.06, baseY],
  ];

  // Closed silhouette polygon (ridge + the two bottom corners), traced for both
  // the fill and the vein clip so the veins can never leave the mountain.
  const traceBody = () => {
    ctx.beginPath();
    ctx.moveTo(ridge[0][0], ridge[0][1]);
    for (let i = 1; i < ridge.length; i++) ctx.lineTo(ridge[i][0], ridge[i][1]);
    ctx.lineTo(width * 1.06, height);
    ctx.lineTo(-width * 0.06, height);
    ctx.closePath();
  };

  // Body — a vertical gradient, warmer just under the crater, near-black at base.
  const body = ctx.createLinearGradient(0, peakY, 0, height);
  body.addColorStop(0, MOUNTAIN);
  body.addColorStop(1, MOUNTAIN_BASE);
  ctx.fillStyle = body;
  traceBody();
  ctx.fill();

  // Lava veins, clipped to the mountain so they read as molten cracks in the
  // slopes rather than wires in the sky.
  ctx.save();
  traceBody();
  ctx.clip();
  ctx.globalCompositeOperation = "lighter";
  drawVeins(ctx, peakX, peakY + craterDip * 1.6, height, ui, t, heat, reducedMotion);
  ctx.restore();

  // Warm rim light on the crater lip where the glow catches the edge. Wrapped in
  // save/restore so its lineCap/lineWidth/composite don't leak onto the gameplay
  // strokes ClimbCanvas draws after us (gridlines, ladder rungs, lava dashes) —
  // the ctx persists every property across frames, not just alpha/composite.
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  ctx.strokeStyle = `rgba(255,150,80,${(0.6 * heat).toFixed(3)})`;
  ctx.lineWidth = 1.6 * ui;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(ridge[4][0], ridge[4][1]);
  ctx.lineTo(ridge[5][0], ridge[5][1]);
  ctx.moveTo(ridge[6][0], ridge[6][1]);
  ctx.lineTo(ridge[7][0], ridge[7][1]);
  ctx.stroke();
  ctx.restore();

  // Molten pool nestled DOWN in the crater notch (not floating above the peak),
  // so it reads as a glowing vent between the two rim points.
  const cy = peakY + craterDip * 2;
  const poolPulse = reducedMotion ? 1 : 0.88 + 0.12 * Math.sin(t * 0.07 + 1);
  const pool = ctx.createRadialGradient(peakX, cy, 0, peakX, cy, craterHalf * poolPulse);
  pool.addColorStop(0, `rgba(255,216,150,${(0.9 * heat).toFixed(3)})`);
  pool.addColorStop(0.45, `rgba(255,120,48,${(0.82 * heat).toFixed(3)})`);
  pool.addColorStop(1, "rgba(200,60,40,0)");
  ctx.fillStyle = pool;
  ctx.beginPath();
  ctx.ellipse(peakX, cy, craterHalf * 0.92, craterDip * 2.6, 0, 0, Math.PI * 2);
  ctx.fill();
}

/** A few glowing lava streaks from the crater, each a bright core over a soft
 *  wide halo, with a per-segment shimmer. */
function drawVeins(
  ctx: CanvasRenderingContext2D,
  x0: number,
  y0: number,
  height: number,
  ui: number,
  t: number,
  heat: number,
  reducedMotion: boolean
): void {
  const veins = 4;
  for (let v = 0; v < veins; v++) {
    const dir = v < veins / 2 ? -1 : 1;
    const spread = 0.05 + 0.11 * hash(v, 11);
    const len = height * (0.24 + 0.2 * hash(v, 13));
    const pts: Array<[number, number]> = [[x0 + dir * 4 * ui, y0]];
    const steps = 5;
    for (let s = 1; s <= steps; s++) {
      const f = s / steps;
      const wob = (hash(v, s) - 0.5) * height * 0.03;
      pts.push([x0 + dir * spread * height * f + wob, y0 + len * f]);
    }
    const shimmer = reducedMotion ? 1 : 0.7 + 0.3 * Math.sin(t * 0.12 + v);
    // Soft outer halo.
    ctx.strokeStyle = `rgba(255,90,44,${(0.22 * heat * shimmer).toFixed(3)})`;
    ctx.lineWidth = 5 * ui;
    strokePath(ctx, pts);
    // Bright molten core.
    ctx.strokeStyle = `rgba(255,196,120,${(0.7 * heat * shimmer).toFixed(3)})`;
    ctx.lineWidth = 1.6 * ui;
    strokePath(ctx, pts);
  }
}

function strokePath(ctx: CanvasRenderingContext2D, pts: Array<[number, number]>): void {
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
  ctx.stroke();
}

/** Ash plume rising from the crater and dissipating into the sky. */
function drawSmoke(
  ctx: CanvasRenderingContext2D,
  peakX: number,
  peakY: number,
  width: number,
  height: number,
  ui: number,
  t: number,
  reducedMotion: boolean
): void {
  for (let i = 0; i < SMOKE_COUNT; i++) {
    const phase = hash(i, 31);
    const speed = 0.0016 + 0.001 * hash(i, 33);
    const p = frac(phase + (reducedMotion ? 0 : t * speed));
    const rise = height * 0.5 * p;
    const cx = peakX + Math.sin(phase * 6.283 + p * 2) * width * (0.04 + 0.08 * p);
    const cy = peakY - rise;
    const rad = (12 + 40 * p) * ui;
    const a = 0.16 * Math.sin(p * Math.PI); // fade in then out
    if (a <= 0.002) continue;
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, rad);
    g.addColorStop(0, `rgba(38,30,36,${a.toFixed(3)})`);
    g.addColorStop(1, "rgba(38,30,36,0)");
    ctx.fillStyle = g;
    ctx.fillRect(cx - rad, cy - rad, rad * 2, rad * 2);
  }
}

/** Embers streaming upward — the "rising heat" motif. A fixed pool, each looping
 *  from below the fold up past the top with a gentle horizontal sway. */
function drawEmbers(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  peakX: number,
  ui: number,
  t: number,
  heat: number,
  reducedMotion: boolean
): void {
  const prev = ctx.globalCompositeOperation;
  ctx.globalCompositeOperation = "lighter";
  const count = Math.round(EMBER_COUNT * (0.55 + 0.45 * heat));
  for (let i = 0; i < count; i++) {
    const phase = hash(i, 71);
    const speed = 0.0022 + 0.0032 * hash(i, 73);
    const p = frac(phase + (reducedMotion ? 0 : t * speed));
    const y = height * 1.05 - p * height * 1.25;
    // Embers cluster toward the volcano centre but scatter across the width.
    const spread = width * (0.2 + 0.55 * hash(i, 75));
    const baseX = peakX + (hash(i, 77) - 0.5) * 2 * spread;
    const sway = Math.sin((reducedMotion ? 0 : t * 0.03) + phase * 6.283) * width * 0.02;
    const x = baseX + sway;
    const tw = reducedMotion ? 0.8 : 0.5 + 0.5 * Math.sin(t * 0.2 + i);
    // Fade in off the bottom, out toward the top.
    const life = Math.sin(clamp01(p) * Math.PI);
    const a = clamp01(0.7 * life * tw) * heat;
    if (a <= 0.01) continue;
    const size = (0.8 + 1.6 * hash(i, 79)) * ui;
    ctx.fillStyle = `rgba(${EMBER[i % EMBER.length]},${a.toFixed(3)})`;
    ctx.fillRect(x, y, size, size);
  }
  ctx.globalCompositeOperation = prev;
}

/** A warm uplight along the bottom edge — heat radiating from below (where the
 *  gameplay lava rises), pulsing slowly. */
function drawHeatHaze(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  t: number,
  heat: number,
  reducedMotion: boolean
): void {
  const pulse = reducedMotion ? 1 : 0.85 + 0.15 * Math.sin(t * 0.06);
  const band = height * 0.32;
  const a = 0.14 * heat * pulse;
  const prev = ctx.globalCompositeOperation;
  ctx.globalCompositeOperation = "lighter";
  const g = ctx.createLinearGradient(0, height, 0, height - band);
  g.addColorStop(0, `rgba(255,90,44,${a.toFixed(3)})`);
  g.addColorStop(1, "rgba(255,90,44,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, height - band, width, band);
  ctx.globalCompositeOperation = prev;
}
