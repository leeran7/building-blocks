"use client";

/**
 * Climb backdrop — a parallax night sky that deepens with altitude.
 *
 * Purely cosmetic and render-only: it reads the camera altitude + tick and
 * paints behind the tower. The higher the climber gets, the more the sky sheds
 * its warm ground haze for indigo and then near-black space, with a parallax
 * starfield, a low moon, faint nebulae, and the odd shooting star drifting past
 * far slower than the world — so the sense of height reads even on a featureless
 * stretch of tower.
 *
 * Deterministic from (camWorldY, tick): stars are hashed from their grid cell,
 * never stored, so any canvas size costs only the cells on screen. reducedMotion
 * freezes the twinkle and drops the shooting stars; the field itself still draws.
 * The gradient and parallax layers still scroll with the camera under reduced
 * motion — that tracks the same camera the tower and lava already move with, so
 * it is intentional, not an oversight.
 */

/** Sky keyframes: altitude (m) → colour. Warm obsidian at the base, through deep
 *  indigo, into space black up top. Interpolated per-frame for the gradient. */
const SKY: Array<[number, [number, number, number]]> = [
  [0, [21, 18, 30]],
  [130, [17, 19, 46]],
  [340, [10, 12, 32]],
  [680, [5, 6, 13]],
];

/** Cool star white and complementary nebula tints — kept off the lime/ember
 *  gameplay palette so the backdrop never competes with the climber or lava. */
const STAR = "#e8ecff";
const NEBULAE: Array<[number, string]> = [
  [70, "138,110,220"],
  [175, "80,150,200"],
  [275, "150,90,190"],
  [400, "90,130,210"],
];

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

function skyColor(m: number): [number, number, number] {
  if (m <= SKY[0][0]) return SKY[0][1];
  const last = SKY[SKY.length - 1];
  if (m >= last[0]) return last[1];
  for (let i = 1; i < SKY.length; i++) {
    if (m <= SKY[i][0]) {
      const [m0, c0] = SKY[i - 1];
      const [m1, c1] = SKY[i];
      const t = (m - m0) / (m1 - m0);
      return [
        c0[0] + (c1[0] - c0[0]) * t,
        c0[1] + (c1[1] - c0[1]) * t,
        c0[2] + (c1[2] - c0[2]) * t,
      ];
    }
  }
  return last[1];
}

const rgb = (c: [number, number, number]) =>
  `rgb(${c[0] | 0},${c[1] | 0},${c[2] | 0})`;

/** Cheap 2D value hash → [0,1). Stable per cell, so the field never shimmers. */
function hash(x: number, y: number): number {
  let h = (x | 0) * 374761393 + (y | 0) * 668265263;
  h = (h ^ (h >>> 13)) * 1274126177;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

// Star grid: ~11 m tall cells, ~34 px wide columns. Sized so a phone shows a
// couple hundred stars and a wide desktop canvas (fewer metres visible) shows
// fewer rows — the loop count stays small on every canvas.
const CELL_M = 11;
const CELL_X = 34;

interface StarLayer {
  /** Fraction of the world's vertical scroll this layer tracks (depth). */
  parallax: number;
  /** Star size in px. */
  size: number;
  /** Base brightness multiplier. */
  bright: number;
  /** Hash salt so the two layers don't overlap. */
  salt: number;
}

const STAR_LAYERS: StarLayer[] = [
  { parallax: 0.3, size: 1, bright: 0.55, salt: 0 },
  { parallax: 0.55, size: 1.6, bright: 0.9, salt: 97 },
];

/**
 * Paint the sky behind the tower for the current camera window.
 *
 * @param camWorldY  World altitude (m) at the bottom edge of the view.
 * @param viewH      Metres visible vertically.
 * @param pxPerM     World→screen scale (also encodes canvas width).
 */
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
  // Vertical gradient sampled at the world altitude of each screen edge, so the
  // sky bleeds continuously as the camera climbs.
  const grad = ctx.createLinearGradient(0, 0, 0, height);
  grad.addColorStop(0, rgb(skyColor(Math.max(0, camWorldY + viewH))));
  grad.addColorStop(1, rgb(skyColor(Math.max(0, camWorldY))));
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, width, height);

  // Screen Y of an object sitting at world altitude `alt` in a parallax layer.
  const layerY = (alt: number, f: number) =>
    height - (alt - camWorldY * f) * pxPerM;

  // How "in space" we are — fades in the stars/moon over the first stretch.
  const alt = camWorldY + viewH * 0.5;
  const starFade = clamp01((alt - 25) / 190);

  // Nebulae: big, faint radial glows that fade in with altitude alongside the
  // stars. Skipped entirely low down — a screen-sized "lighter" fill is a costly
  // mobile-GPU op, and near the ground it composites to nothing anyway.
  if (starFade > 0.02) {
    const prevComposite = ctx.globalCompositeOperation;
    ctx.globalCompositeOperation = "lighter";
    for (let i = 0; i < NEBULAE.length; i++) {
      const [nAlt, tint] = NEBULAE[i];
      const cy = layerY(nAlt, 0.25);
      if (cy < -height || cy > height * 2) continue;
      const a = 0.09 * starFade * (0.8 + 0.2 * hash(i, 5));
      if (a < 0.004) continue;
      const cx = width * (0.18 + 0.64 * hash(i, 11));
      const r = width * (0.55 + 0.25 * hash(i, 23));
      const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
      glow.addColorStop(0, `rgba(${tint},${a.toFixed(3)})`);
      glow.addColorStop(1, `rgba(${tint},0)`);
      ctx.fillStyle = glow;
      ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
    }
    ctx.globalCompositeOperation = prevComposite;
  }

  // Moon: a soft pale disc that drifts in once the climb is well underway and
  // sinks past as the climber overtakes it.
  if (starFade > 0.01) {
    const my = layerY(215, 0.4);
    const mr = Math.max(22, width * 0.11);
    if (my > -mr && my < height + mr) {
      const mx = width * 0.74;
      const disc = ctx.createRadialGradient(mx, my, 0, mx, my, mr);
      disc.addColorStop(0, `rgba(236,238,228,${(0.9 * starFade).toFixed(3)})`);
      disc.addColorStop(0.82, `rgba(210,214,206,${(0.65 * starFade).toFixed(3)})`);
      disc.addColorStop(1, "rgba(210,214,206,0)");
      ctx.fillStyle = disc;
      ctx.beginPath();
      ctx.arc(mx, my, mr, 0, Math.PI * 2);
      ctx.fill();
      // A couple of hashed craters for character.
      ctx.fillStyle = `rgba(150,152,160,${(0.18 * starFade).toFixed(3)})`;
      for (let i = 0; i < 3; i++) {
        const cr = mr * (0.12 + 0.1 * hash(i, 41));
        const ang = hash(i, 53) * Math.PI * 2;
        const rad = mr * (0.2 + 0.5 * hash(i, 67));
        ctx.beginPath();
        ctx.arc(mx + Math.cos(ang) * rad, my + Math.sin(ang) * rad, cr, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  // Starfield — two parallax layers. Iterate only the cells whose parallax
  // position lands on screen, so the cost tracks the canvas, not the altitude.
  if (starFade > 0.01) {
    ctx.fillStyle = STAR;
    const cols = Math.ceil(width / CELL_X) + 1;
    for (const layer of STAR_LAYERS) {
      const camAlt = camWorldY * layer.parallax;
      const rowLo = Math.floor(camAlt / CELL_M) - 1;
      const rowHi = Math.ceil((camAlt + height / pxPerM) / CELL_M) + 1;
      for (let gy = rowLo; gy <= rowHi; gy++) {
        for (let gx = 0; gx < cols; gx++) {
          const h0 = hash(gx * 3 + layer.salt, gy * 7 + layer.salt);
          if (h0 > 0.58) continue; // ~58% of cells carry a star
          const worldAlt = (gy + hash(gx, gy)) * CELL_M;
          const y = layerY(worldAlt, layer.parallax);
          if (y < 0 || y > height) continue;
          const x = (gx + hash(gx + 5, gy + 5)) * CELL_X;
          const tw = reducedMotion
            ? 1
            : 0.55 + 0.45 * Math.sin(tick * 0.06 + h0 * 6.283);
          ctx.globalAlpha = clamp01(starFade * layer.bright * (0.5 + h0) * tw);
          ctx.fillRect(x, y, layer.size, layer.size);
        }
      }
    }
    ctx.globalAlpha = 1;
  }

  // Shooting star — a rare high-altitude streak on a deterministic cadence.
  if (!reducedMotion && starFade > 0.5) {
    const PERIOD = 250;
    const DUR = 22;
    const idx = Math.floor(tick / PERIOD);
    const local = tick - idx * PERIOD;
    if (local < DUR && hash(idx, 700) < 0.7) {
      const p = local / DUR;
      const sx = hash(idx, 200) * width * 0.7;
      const sy = (0.08 + 0.32 * hash(idx, 300)) * height;
      const x = sx + p * width * 0.55;
      const y = sy + p * height * 0.28;
      const a = Math.sin(p * Math.PI); // fade in then out
      const tail = ctx.createLinearGradient(x, y, x - width * 0.09, y - height * 0.045);
      tail.addColorStop(0, `rgba(232,236,255,${(0.9 * a).toFixed(3)})`);
      tail.addColorStop(1, "rgba(232,236,255,0)");
      ctx.strokeStyle = tail;
      ctx.lineWidth = 2;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x - width * 0.09, y - height * 0.045);
      ctx.stroke();
    }
  }
}
