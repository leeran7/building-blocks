"use client";

/**
 * Climb backdrop — a flat, animated volcanic vista.
 *
 * A single screen-space scene (no parallax layers) stacked back-to-front like a
 * game-art background: a moody sky with drifting clouds, layered hazy mountains,
 * a dark forest tree-line, a jagged volcanic rock ridge, and — the hero — a
 * cracked-basalt lava field where glowing molten veins run between dark plates
 * and pool bright at the junctions. It explains the game's rising lava: the
 * whole ground is molten.
 *
 * Detailed but cheap: a couple of gradients, a handful of jagged silhouettes,
 * ~130 flat lava plates, and ~30 embers — all flat-shaded, no per-frame gradient
 * churn beyond the molten base + hot pools. Everything is a pure function of
 * (width, height, camWorldY, tick) + hashed indices, so it is deterministic and
 * needs no cached state. camWorldY only eases the heat as you climb away from it;
 * reducedMotion freezes all motion (clouds, pool pulse, ember drift) to a steady,
 * fully-drawn frame.
 *
 * The whole body runs inside a save/restore so no stroke/fill state (lineJoin,
 * lineWidth, composite…) can leak onto the gameplay draws ClimbCanvas layers on
 * top of us. The lava field is deliberately kept dim (a dark scrim + subdued
 * glow) so the real rising-lava hazard band and the lime climber stay legible
 * over it.
 *
 * Fill-rate note: cost is bounded by fixed loop counts but scales with pixel
 * area (large-area gradient fills). Comfortable on phone/full-bleed widths
 * (≤~1200px); a hypothetical 2560px full-bleed stage would want the backdrop's
 * backing store capped — that is a canvas-layer decision, not one for this file.
 */

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const frac = (v: number) => v - Math.floor(v);

/** Cheap 2D value hash → [0,1). Stable per index, so nothing jitters. */
function hash(x: number, y: number): number {
  let h = (x | 0) * 374761393 + (y | 0) * 668265263;
  h = (h ^ (h >>> 13)) * 1274126177;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

type Rgb = [number, number, number];
const rgb = (c: Rgb) => `rgb(${c[0] | 0},${c[1] | 0},${c[2] | 0})`;
const mix = (a: Rgb, b: Rgb, t: number): Rgb => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t,
];

// Palette. Upper scene is a moody desaturated slate (kept dark so the lime
// climber and dark platforms stay legible over it); the warmth is saved for the
// lava field — and even there it is subdued so gameplay reads on top.
const SKY_TOP: Rgb = [24, 28, 38];
const SKY_MID: Rgb = [38, 46, 58];
const SKY_HORIZON: Rgb = [60, 66, 78];
const CLOUD: Rgb = [70, 78, 92];
const MTN_FAR: Rgb = [62, 72, 84];
const MTN_MID: Rgb = [48, 58, 70];
const MTN_NEAR: Rgb = [37, 47, 58];
const FOREST: Rgb = [28, 40, 40];
const RIDGE: Rgb = [58, 24, 26];
const RIDGE_SHADOW: Rgb = [40, 16, 18];
const MOLTEN_TOP: Rgb = [128, 44, 20];
const MOLTEN_BOT: Rgb = [206, 88, 30];
const PLATE: string[] = ["#2c1518", "#341a1c", "#221016", "#3a1e1e", "#281319"];
const EMBER = ["255,74,36", "255,102,48", "255,132,64"];
const SCRIM: Rgb = [10, 10, 14];

// Scene band boundaries as fractions of canvas height.
const HORIZON = 0.52; // sky/land meeting line
const LAVA_TOP = 0.6; // top of the cracked lava field

/** Draw the volcanic vista behind the tower for the current frame. */
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
  const w = width;
  const h = height;
  const ui = Math.max(1, w / 360);
  // Climbing lifts you out of the worst heat: the embers ease with altitude.
  const heat = 0.5 + 0.5 * clamp01(1 - camWorldY / 800);

  // Everything inside one save/restore so no stroke/fill/composite state leaks
  // onto the gameplay draws ClimbCanvas renders after us.
  ctx.save();

  // The sky, mountains, forest, ridge and lava field are static — repainting all
  // those large gradient/overdraw fills every frame is the mobile bottleneck
  // (cost is fill-rate × the device pixel ratio, so a phone at 2–3× DPR pays
  // several ms per frame, and a power-up's full-canvas flash on top tips it over
  // 60fps). So bake the static scene into an offscreen canvas once and blit it;
  // only the embers are drawn live on top. Falls back to painting inline where
  // an offscreen canvas isn't available.
  const scene = getSceneCache(w, h, ui);
  if (scene) ctx.drawImage(scene, 0, 0, w, h);
  else paintScene(ctx, w, h, ui, BAKE_HEAT);

  drawEmbers(ctx, w, h, ui, reducedMotion ? 0 : tick, heat, reducedMotion);

  ctx.restore();
}

/** Heat the static scene is baked at. Embers still ease with real altitude; the
 *  field itself no longer cools as you climb, which keeps the cache stable (no
 *  mid-run rebuild hitches). */
const BAKE_HEAT = 0.85;

/** Paint the static scene (everything but the live embers) at a frozen tick. */
function paintScene(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  ui: number,
  heat: number
): void {
  drawSky(ctx, w, h);
  drawClouds(ctx, w, h, 0, true);
  // Mountains, back (hazy/high) to front (darker/lower).
  ridgeLine(ctx, w, h, h * 0.3, h * 0.14, 1.7, MTN_FAR);
  ridgeLine(ctx, w, h, h * 0.38, h * 0.12, 3.1, MTN_MID);
  ridgeLine(ctx, w, h, h * HORIZON, h * 0.09, 5.3, MTN_NEAR);
  drawForest(ctx, w, h, ui);
  drawRidge(ctx, w, h);
  drawLava(ctx, w, h, ui, 0, heat, true);
}

interface SceneCache {
  w: number;
  h: number;
  canvas: HTMLCanvasElement;
}
// Render cache only — a pure function of (w, h): the backdrop is the same for
// every tower, so this is shared and rebuilt only when the canvas resizes. The
// simulation is untouched.
let sceneCache: SceneCache | null = null;

/** The baked static scene, rebuilt only on a size change. Returns null when no
 *  offscreen canvas is available (SSR / unsupported) so the caller paints inline. */
function getSceneCache(w: number, h: number, ui: number): HTMLCanvasElement | null {
  if (typeof document === "undefined") return null;
  if (sceneCache && sceneCache.w === w && sceneCache.h === h) return sceneCache.canvas;

  // Cap the offscreen resolution: the scene is soft, so 2× is plenty, and it
  // keeps both the buffer and the per-frame blit affordable on high-DPR phones.
  const dpr = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;
  let scale = Math.min(dpr, 2);
  const MAX_PX = 3_000_000;
  if (w * h * scale * scale > MAX_PX) {
    scale = Math.max(1, Math.sqrt(MAX_PX / (w * h)));
  }

  const cv = sceneCache?.canvas ?? document.createElement("canvas");
  cv.width = Math.round(w * scale);
  cv.height = Math.round(h * scale);
  const c = cv.getContext("2d");
  if (!c) return null;
  c.setTransform(scale, 0, 0, scale, 0, 0);
  paintScene(c, w, h, ui, BAKE_HEAT);
  sceneCache = { w, h, canvas: cv };
  return cv;
}

function drawSky(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  const g = ctx.createLinearGradient(0, 0, 0, h * HORIZON);
  g.addColorStop(0, rgb(SKY_TOP));
  g.addColorStop(0.7, rgb(SKY_MID));
  g.addColorStop(1, rgb(SKY_HORIZON));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h * HORIZON + 1);
}

/** A few soft cloud banks drifting slowly across the upper sky. */
function drawClouds(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  t: number,
  reducedMotion: boolean
): void {
  const n = 5;
  for (let i = 0; i < n; i++) {
    const speed = (0.05 + 0.05 * hash(i, 2)) * (i % 2 ? 1 : -1);
    const drift = reducedMotion ? 0 : t * speed;
    const cx = frac(hash(i, 1) + drift / w) * (w + w * 0.6) - w * 0.3;
    const cy = h * (0.06 + 0.22 * hash(i, 3));
    const cw = w * (0.28 + 0.22 * hash(i, 4));
    const ch = cw * 0.4;
    const a = 0.1 + 0.12 * hash(i, 5);
    ctx.fillStyle = `rgba(${CLOUD[0]},${CLOUD[1]},${CLOUD[2]},${a.toFixed(3)})`;
    // A cloud = a few overlapping soft ellipses.
    for (let p = 0; p < 4; p++) {
      const px = cx + (hash(i * 7 + p, 6) - 0.5) * cw;
      const py = cy + (hash(i * 7 + p, 8) - 0.5) * ch * 0.6;
      const pr = cw * (0.16 + 0.12 * hash(i * 7 + p, 9));
      ctx.beginPath();
      ctx.ellipse(px, py, pr, pr * 0.62, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

/** A soft, rounded mountain silhouette filled down to the bottom. A few broad
 *  humps (low-frequency sines + a gentle hashed offset) drawn as quadratic
 *  curves through the midpoints, so the ridges roll rather than zigzag. */
function ridgeLine(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  baseY: number,
  amp: number,
  seed: number,
  color: Rgb
): void {
  const segs = 8;
  const pts: Array<[number, number]> = [];
  for (let i = 0; i <= segs; i++) {
    const x = (i / segs) * w;
    const hump = 0.5 + 0.5 * Math.sin(i * 1.05 + seed);
    const roll = 0.32 * Math.sin(i * 0.5 + seed * 1.7);
    const jitter = (hash(i, seed | 0) - 0.5) * 0.28;
    const y = baseY - amp * (hump * 0.72 + roll + jitter);
    pts.push([x, y]);
  }
  ctx.fillStyle = rgb(color);
  ctx.beginPath();
  ctx.moveTo(0, h);
  ctx.lineTo(pts[0][0], pts[0][1]);
  for (let i = 0; i < pts.length - 1; i++) {
    const mx = (pts[i][0] + pts[i + 1][0]) / 2;
    const my = (pts[i][1] + pts[i + 1][1]) / 2;
    ctx.quadraticCurveTo(pts[i][0], pts[i][1], mx, my);
  }
  ctx.lineTo(pts[pts.length - 1][0], pts[pts.length - 1][1]);
  ctx.lineTo(w, h);
  ctx.closePath();
  ctx.fill();
}

/** A dark row of evergreens along the horizon — a soft sawtooth of tree tops. */
function drawForest(ctx: CanvasRenderingContext2D, w: number, h: number, ui: number): void {
  const baseY = h * (HORIZON + 0.02);
  ctx.fillStyle = rgb(FOREST);
  ctx.beginPath();
  ctx.moveTo(0, h);
  ctx.lineTo(0, baseY);
  const step = 11 * ui;
  const teeth = Math.ceil(w / step);
  for (let i = 0; i <= teeth; i++) {
    const x = (i / teeth) * w;
    const th = (7 + 12 * hash(i, 44)) * ui;
    ctx.lineTo(x - step * 0.5, baseY);
    ctx.lineTo(x, baseY - th);
  }
  ctx.lineTo(w, baseY);
  ctx.lineTo(w, h);
  ctx.closePath();
  ctx.fill();
}

/** The dark volcanic rock wall between the forest and the lava field: a jagged
 *  maroon top edge with a few darker facets for rocky relief. */
function drawRidge(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  const topBase = h * (LAVA_TOP - 0.06);
  const botY = h * LAVA_TOP + 2;
  const top: Array<[number, number]> = [];
  const segs = 22;
  for (let i = 0; i <= segs; i++) {
    const x = (i / segs) * w;
    const jag = (hash(i, 61) - 0.5) * h * 0.05 + (hash(i, 63) - 0.5) * h * 0.02;
    top.push([x, topBase + jag]);
  }
  // Body.
  ctx.fillStyle = rgb(RIDGE);
  ctx.beginPath();
  ctx.moveTo(0, botY);
  ctx.lineTo(top[0][0], top[0][1]);
  for (let i = 1; i < top.length; i++) ctx.lineTo(top[i][0], top[i][1]);
  ctx.lineTo(w, botY);
  ctx.closePath();
  ctx.fill();
  // A few shadowed rock facets hanging from the crest.
  ctx.fillStyle = rgb(RIDGE_SHADOW);
  for (let i = 0; i < top.length - 1; i++) {
    if (hash(i, 67) > 0.5) continue;
    const [x0, y0] = top[i];
    const [x1] = top[i + 1];
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, top[i + 1][1]);
    ctx.lineTo((x0 + x1) / 2, botY);
    ctx.closePath();
    ctx.fill();
  }
}

/**
 * The cracked lava field. A subdued molten underlayer + pulsing hot pools are
 * laid down first, then dark basalt plates are drawn on top slightly shrunk
 * toward their centres — the gaps between them become the glowing veins, widest
 * and brightest near the bottom (perspective). A dark scrim graded toward the
 * bottom keeps the field from out-shouting the gameplay hazard band + climber.
 */
function drawLava(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  ui: number,
  t: number,
  heat: number,
  reducedMotion: boolean
): void {
  const top = h * LAVA_TOP;

  // Molten underlayer — the cracks read as glowing veins, hotter near the base.
  const g = ctx.createLinearGradient(0, top, 0, h);
  g.addColorStop(0, rgb(mix(MOLTEN_TOP, MOLTEN_BOT, 0.15 * heat)));
  g.addColorStop(1, rgb(mix(MOLTEN_TOP, MOLTEN_BOT, heat)));
  ctx.fillStyle = g;
  ctx.fillRect(0, top, w, h - top + 1);

  // Jittered lattice with vertical perspective: rows packed near the top, spread
  // toward the bottom, cells widening with them.
  const rows = 11;
  const cols = 12;
  const P: Array<Array<[number, number]>> = [];
  for (let r = 0; r <= rows; r++) {
    const u = r / rows;
    const y = top + (h * 1.05 - top) * (0.32 * u + 0.68 * u * u);
    const scale = 0.4 + 1 * u;
    const row: Array<[number, number]> = [];
    for (let c = 0; c <= cols; c++) {
      const bx = (c / cols) * w;
      const jx = (hash(r * 41 + c, 3) - 0.5) * (w / cols) * 0.55 * scale;
      const jy = (hash(r * 23 + c, 5) - 0.5) * h * 0.028 * scale;
      row.push([bx + jx, y + jy]);
    }
    P.push(row);
  }

  // Hot pools at some junctions, glowing under the plates and pulsing. Skipped
  // in the top ~18% of the field — that band sits behind the climber's focus
  // point, and the brightest elements there would wash the lime figure out.
  ctx.globalCompositeOperation = "lighter";
  for (let r = 1; r < rows; r++) {
    const u = r / rows;
    if (u < 0.18) continue;
    for (let c = 1; c < cols; c++) {
      if (hash(r * 13 + c, 21) > 0.4) continue;
      const [px, py] = P[r][c];
      const pulse = reducedMotion ? 1 : 0.55 + 0.45 * Math.sin(t * 0.09 + hash(r, c) * 6.283);
      const rad = (7 + 30 * u) * ui;
      const a = 0.4 * heat * pulse;
      const rgd = ctx.createRadialGradient(px, py, 0, px, py, rad);
      rgd.addColorStop(0, `rgba(255,210,110,${a.toFixed(3)})`);
      rgd.addColorStop(0.5, `rgba(255,128,40,${(a * 0.6).toFixed(3)})`);
      rgd.addColorStop(1, "rgba(200,60,20,0)");
      ctx.fillStyle = rgd;
      ctx.fillRect(px - rad, py - rad, rad * 2, rad * 2);
    }
  }
  ctx.globalCompositeOperation = "source-over";

  // Basalt plates, inset toward their centroids so the molten shows in the gaps.
  ctx.lineJoin = "round";
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const TL = P[r][c];
      const TR = P[r][c + 1];
      const BR = P[r + 1][c + 1];
      const BL = P[r + 1][c];
      const cx = (TL[0] + TR[0] + BR[0] + BL[0]) / 4;
      const cy = (TL[1] + TR[1] + BR[1] + BL[1]) / 4;
      const u = r / rows;
      const inset = (1.5 + 4.5 * u) * ui; // wider cracks near the bottom
      const pull = (p: [number, number]): [number, number] => {
        const dx = cx - p[0];
        const dy = cy - p[1];
        const d = Math.hypot(dx, dy) || 1;
        const k = Math.min(inset / d, 0.42);
        return [p[0] + dx * k, p[1] + dy * k];
      };
      const q = [pull(TL), pull(TR), pull(BR), pull(BL)];
      ctx.fillStyle = PLATE[(hash(r * 7 + c, 31) * PLATE.length) | 0];
      ctx.beginPath();
      ctx.moveTo(q[0][0], q[0][1]);
      for (let i = 1; i < 4; i++) ctx.lineTo(q[i][0], q[i][1]);
      ctx.closePath();
      ctx.fill();
      // Warm crust highlight on the top lip where the vein light catches it.
      ctx.strokeStyle = `rgba(158,64,44,${(0.4 * heat).toFixed(3)})`;
      ctx.lineWidth = Math.max(1, (0.5 + 1.1 * u) * ui);
      ctx.beginPath();
      ctx.moveTo(q[0][0], q[0][1]);
      ctx.lineTo(q[1][0], q[1][1]);
      ctx.stroke();
    }
  }

  // Dark scrim graded toward the bottom: recedes the field a plane so the
  // translucent gameplay-lava band and the climber read against a neutral base,
  // darkest where the real hazard band rises from (screen bottom).
  const scrim = ctx.createLinearGradient(0, top, 0, h);
  scrim.addColorStop(0, `rgba(${SCRIM[0]},${SCRIM[1]},${SCRIM[2]},0)`);
  scrim.addColorStop(1, `rgba(${SCRIM[0]},${SCRIM[1]},${SCRIM[2]},0.4)`);
  ctx.fillStyle = scrim;
  ctx.fillRect(0, top, w, h - top + 1);
}

/** Embers streaming upward off the lava field — deep red-orange sparks so they
 *  read as fire, never as an amber power-up orb. */
function drawEmbers(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  ui: number,
  t: number,
  heat: number,
  reducedMotion: boolean
): void {
  ctx.globalCompositeOperation = "lighter";
  const count = Math.round(30 * (0.55 + 0.45 * heat));
  for (let i = 0; i < count; i++) {
    const phase = hash(i, 71);
    const speed = 0.0022 + 0.003 * hash(i, 73);
    const p = frac(phase + (reducedMotion ? 0 : t * speed));
    // Rise from the lava field up through the scene, fading out toward the top.
    const y = h * 1.02 - p * h * 0.72;
    const baseX = hash(i, 77) * w;
    const sway = Math.sin((reducedMotion ? 0 : t * 0.03) + phase * 6.283) * w * 0.015;
    const tw = reducedMotion ? 0.8 : 0.5 + 0.5 * Math.sin(t * 0.2 + i);
    const a = clamp01(0.75 * Math.sin(clamp01(p) * Math.PI) * tw) * heat;
    if (a <= 0.01) continue;
    const size = (0.8 + 1.5 * hash(i, 79)) * ui;
    ctx.fillStyle = `rgba(${EMBER[i % EMBER.length]},${a.toFixed(3)})`;
    ctx.fillRect(baseX + sway, y, size, size);
  }
  ctx.globalCompositeOperation = "source-over";
}
