"use client";

/**
 * Climb backdrop — a parallax city you ascend through.
 *
 * The whole game is about height, so the backdrop is a neighbourhood seen from
 * the tower: three depth-sorted rows of lit buildings standing on the street,
 * a warm city-glow horizon, and a night sky with a moon and stars up top. As
 * the climber rises the camera lifts, so each building row scrolls down and
 * sinks away — the near rooftops go first, then the mid blocks, then the far
 * skyline — until only the star field is left. Climbing literally carries you
 * up out of the neighbourhood and into the night.
 *
 * Purely cosmetic and render-only: it reads the camera altitude + tick and
 * paints behind the tower, never touching the simulation. Everything is
 * deterministic — building shapes, lit windows, and rooftop clutter are hashed
 * from their index, never stored, so any canvas size costs only what's on
 * screen. reducedMotion freezes the window flicker and the blinking antenna
 * lights; the gradient and parallax scroll stay, tracking the same camera the
 * tower and lava already move with.
 */

/** Sky keyframes: altitude (m) → colour. Dusky indigo down at street level,
 *  deepening to near-black night as you climb clear of the rooftops. */
const SKY: Array<[number, [number, number, number]]> = [
  [0, [26, 24, 48]],
  [130, [18, 20, 42]],
  [340, [11, 13, 30]],
  [700, [6, 7, 18]],
];

const STAR = "#e8ecff";

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

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
        lerp(c0[0], c1[0], t),
        lerp(c0[1], c1[1], t),
        lerp(c0[2], c1[2], t),
      ];
    }
  }
  return last[1];
}

const rgb = (c: [number, number, number]) =>
  `rgb(${c[0] | 0},${c[1] | 0},${c[2] | 0})`;

/** Cheap 2D value hash → [0,1). Stable per index, so nothing shimmers. */
function hash(x: number, y: number): number {
  let h = (x | 0) * 374761393 + (y | 0) * 668265263;
  h = (h ^ (h >>> 13)) * 1274126177;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** An "r,g,b" triplet interpolated straight into rgba(). Typed so a stray hex
 *  value (which would silently break rgba()) fails to compile. */
type Rgb = `${number},${number},${number}`;

interface CityLayer {
  /** Fraction of the world's vertical scroll this row tracks (depth). */
  parallax: number;
  /** Screen Y of the street this row stands on, as a fraction of height, when
   *  the camera is at the base. >1 tucks the bases below the viewport. */
  groundFrac: number;
  /** Building silhouette fill. */
  body: string;
  /** Roof-edge highlight. */
  roof: string;
  /** Lit-window colour "r,g,b" (warm). */
  win: Rgb;
  /** Occasional cool-white window "r,g,b". */
  coolWin: Rgb;
  /** Building width range (px, at the 360px baseline). */
  minW: number;
  maxW: number;
  /** Building height range as a fraction of canvas height. */
  minHf: number;
  maxHf: number;
  /** Share of window cells that are lit. */
  litProb: number;
  /** Brightness multiplier — nearer rows read brighter, far ones hazier. */
  winAlpha: number;
  /** Draw rooftop water towers / antennas / aviation lights. */
  features: boolean;
  /** Hash salt so the three rows differ. */
  salt: number;
}

// Back-to-front. Atmospheric perspective: the far skyline is a lighter, bluer
// haze; the near block is the darkest, closest silhouette. Windows warm up and
// brighten as they come forward.
const LAYERS: CityLayer[] = [
  {
    parallax: 0.16,
    groundFrac: 0.9,
    body: "#242a4d",
    roof: "#2f3660",
    win: "233,196,140",
    coolWin: "180,206,246",
    minW: 24,
    maxW: 44,
    minHf: 0.16,
    maxHf: 0.42,
    litProb: 0.34,
    winAlpha: 0.5,
    features: false,
    salt: 0,
  },
  {
    parallax: 0.3,
    groundFrac: 0.99,
    body: "#1a1f3d",
    roof: "#3a4374",
    win: "255,207,122",
    coolWin: "207,228,255",
    minW: 40,
    maxW: 74,
    minHf: 0.28,
    maxHf: 0.62,
    litProb: 0.5,
    winAlpha: 0.95,
    features: true,
    salt: 1009,
  },
  {
    parallax: 0.52,
    groundFrac: 1.05,
    body: "#0e1126",
    roof: "#2a3160",
    win: "255,213,131",
    coolWin: "214,236,255",
    minW: 62,
    maxW: 118,
    minHf: 0.42,
    maxHf: 0.9,
    litProb: 0.56,
    winAlpha: 1,
    features: true,
    salt: 2017,
  },
];

/**
 * Paint the city + sky behind the tower for the current camera window.
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
  const ui = Math.max(1, width / 360);

  // Sky: sampled at the world altitude of each screen edge so it bleeds
  // continuously as the camera climbs.
  const grad = ctx.createLinearGradient(0, 0, 0, height);
  grad.addColorStop(0, rgb(skyColor(Math.max(0, camWorldY + viewH))));
  grad.addColorStop(1, rgb(skyColor(Math.max(0, camWorldY))));
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, width, height);

  // How far above the neighbourhood we are: fades the stars/moon in and the
  // city-glow out as the rooftops drop away.
  const alt = camWorldY + viewH * 0.5;
  const starFade = clamp01((alt - 90) / 240);

  drawStars(ctx, width, height, camWorldY, pxPerM, tick, starFade, reducedMotion);
  drawMoon(ctx, width, height, camWorldY, pxPerM, starFade);

  // Warm city glow hugging the far horizon — light pollution over the skyline.
  // Strongest at street level, gone once you're up in the stars.
  const glowY = height * 0.9 + camWorldY * pxPerM * 0.16;
  const glowA = 0.16 * (1 - starFade);
  if (glowA > 0.004 && glowY > 0 && glowY < height * 1.6) {
    const band = height * 0.4;
    const g = ctx.createLinearGradient(0, glowY - band, 0, glowY);
    g.addColorStop(0, "rgba(110,66,120,0)");
    g.addColorStop(1, `rgba(150,84,116,${glowA.toFixed(3)})`);
    ctx.fillStyle = g;
    ctx.fillRect(0, glowY - band, width, band);
  }

  for (const layer of LAYERS) {
    drawCityRow(ctx, width, height, camWorldY, pxPerM, ui, tick, reducedMotion, layer);
  }
}

function drawStars(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  camWorldY: number,
  pxPerM: number,
  tick: number,
  starFade: number,
  reducedMotion: boolean
): void {
  if (starFade <= 0.01) return;
  const CELL_M = 12;
  const CELL_X = 40;
  const parallax = 0.28;
  ctx.fillStyle = STAR;
  const cols = Math.ceil(width / CELL_X) + 1;
  const camAlt = camWorldY * parallax;
  const rowLo = Math.floor(camAlt / CELL_M) - 1;
  const rowHi = Math.ceil((camAlt + height / pxPerM) / CELL_M) + 1;
  for (let gy = rowLo; gy <= rowHi; gy++) {
    for (let gx = 0; gx < cols; gx++) {
      const h0 = hash(gx * 3 + 11, gy * 7 + 11);
      if (h0 > 0.5) continue;
      const worldAlt = (gy + hash(gx, gy)) * CELL_M;
      const y = height - (worldAlt - camAlt) * pxPerM;
      if (y < 0 || y > height) continue;
      const x = (gx + hash(gx + 5, gy + 5)) * CELL_X;
      const tw = reducedMotion
        ? 1
        : 0.55 + 0.45 * Math.sin(tick * 0.06 + h0 * 6.283);
      ctx.globalAlpha = clamp01(starFade * (0.5 + h0) * tw);
      ctx.fillRect(x, y, 1.4, 1.4);
    }
  }
  ctx.globalAlpha = 1;
}

function drawMoon(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  camWorldY: number,
  pxPerM: number,
  starFade: number
): void {
  if (starFade <= 0.02) return;
  const my = height - (260 - camWorldY * 0.22) * pxPerM;
  const mr = Math.max(20, width * 0.1);
  if (my <= -mr || my >= height + mr) return;
  const mx = width * 0.76;
  const disc = ctx.createRadialGradient(mx, my, 0, mx, my, mr);
  disc.addColorStop(0, `rgba(238,240,228,${(0.92 * starFade).toFixed(3)})`);
  disc.addColorStop(0.82, `rgba(214,218,208,${(0.62 * starFade).toFixed(3)})`);
  disc.addColorStop(1, "rgba(214,218,208,0)");
  ctx.fillStyle = disc;
  ctx.beginPath();
  ctx.arc(mx, my, mr, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = `rgba(150,152,160,${(0.16 * starFade).toFixed(3)})`;
  for (let i = 0; i < 3; i++) {
    const cr = mr * (0.12 + 0.1 * hash(i, 41));
    const ang = hash(i, 53) * Math.PI * 2;
    const rad = mr * (0.2 + 0.5 * hash(i, 67));
    ctx.beginPath();
    ctx.arc(mx + Math.cos(ang) * rad, my + Math.sin(ang) * rad, cr, 0, Math.PI * 2);
    ctx.fill();
  }
}

/** Draw one depth row of buildings, tiled across the width and standing on the
 *  row's parallax-scrolled street line. */
function drawCityRow(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  camWorldY: number,
  pxPerM: number,
  ui: number,
  tick: number,
  reducedMotion: boolean,
  L: CityLayer
): void {
  const scroll = camWorldY * pxPerM * L.parallax;
  const groundY = height * L.groundFrac + scroll;
  // The whole row has sunk below the viewport — nothing to draw.
  if (groundY - height * L.maxHf > height) return;
  if (groundY < 0) return;

  let x = 0;
  let bi = 0;
  // Safety bound; at any real canvas width the while-loop exits on x >= width
  // long before this.
  while (x < width && bi < 500) {
    const r0 = hash(bi, L.salt);
    const w = (L.minW + (L.maxW - L.minW) * r0) * ui;
    const bh = height * (L.minHf + (L.maxHf - L.minHf) * hash(bi, L.salt + 1));
    const top = groundY - bh;
    const gap = (1.5 + 4 * hash(bi, L.salt + 7)) * ui;

    if (top < height && groundY > 0 && x + w > 0) {
      drawBuilding(ctx, x, top, w, groundY, height, ui, tick, reducedMotion, bi, L);
    }

    x += w + gap;
    bi++;
  }
}

function drawBuilding(
  ctx: CanvasRenderingContext2D,
  x: number,
  top: number,
  w: number,
  groundY: number,
  height: number,
  ui: number,
  tick: number,
  reducedMotion: boolean,
  bi: number,
  L: CityLayer
): void {
  const bodyBottom = Math.min(groundY, height);
  const bodyTop = Math.max(top, -4);

  // Some taller buildings get a stepped-back upper section for skyline variety.
  const setback = L.features && hash(bi, L.salt + 3) > 0.62;
  const stepH = setback ? (groundY - top) * 0.26 : 0;
  const stepW = setback ? w * (0.5 + 0.16 * hash(bi, L.salt + 4)) : w;
  const stepX = x + (w - stepW) / 2;

  // Body slab (+ the setback tower on top).
  ctx.fillStyle = L.body;
  ctx.fillRect(x, Math.max(top + stepH, bodyTop), w, bodyBottom - Math.max(top + stepH, bodyTop));
  if (setback) ctx.fillRect(stepX, Math.max(top, -4), stepW, stepH + 1);

  // Roof edges — a thin lit lip catches the city glow.
  ctx.fillStyle = L.roof;
  if (top + stepH > -2 && top + stepH < height) {
    ctx.fillRect(x, top + stepH, w, Math.max(1, 1.5 * ui));
  }
  if (setback && top > -2 && top < height) {
    ctx.fillRect(stepX, top, stepW, Math.max(1, 1.5 * ui));
  }

  drawWindows(ctx, x, top + stepH, w, groundY, height, ui, tick, reducedMotion, bi, L);
  if (setback) {
    drawWindows(ctx, stepX, top, stepW, top + stepH, height, ui, tick, reducedMotion, bi * 7 + 1, L);
  }
  if (L.features) {
    drawRooftop(ctx, setback ? stepX : x, top, setback ? stepW : w, ui, tick, reducedMotion, bi, L);
  }
}

/** Grid of lit/unlit windows from the street line up to the roof, culled to the
 *  visible slice. */
function drawWindows(
  ctx: CanvasRenderingContext2D,
  x: number,
  top: number,
  w: number,
  bottom: number,
  height: number,
  ui: number,
  tick: number,
  reducedMotion: boolean,
  bi: number,
  L: CityLayer
): void {
  const cellW = Math.max(6 * ui, w * 0.16);
  if (w < cellW * 1.2) return; // too slim for a window grid
  const cellH = cellW * 1.5;
  const ww = cellW * 0.52;
  const wh = cellH * 0.56;
  const cols = Math.max(1, Math.floor(w / cellW));
  const marginX = (w - cols * cellW) / 2 + (cellW - ww) / 2;

  // Start at the first row inside the viewport rather than iterating (and
  // skipping) every window row hidden below the fold — buildings whose base sits
  // far under the screen would otherwise burn a row step per hidden floor. The
  // grid stays aligned (whole-cell jump), so rowIdx below is unchanged.
  let ry = bottom - cellH;
  if (ry > height) ry -= Math.ceil((ry - height) / cellH) * cellH;
  for (; ry > top + cellH * 0.3; ry -= cellH) {
    if (ry + wh < 0) break; // climbed above this building's lit slice
    const rowIdx = Math.round((bottom - ry) / cellH);
    for (let c = 0; c < cols; c++) {
      if (hash(bi * 131 + c, L.salt * 17 + rowIdx) > L.litProb) continue;
      const wx = x + marginX + c * cellW;
      const cool = hash(bi + c * 3, rowIdx + 5) > 0.86;
      const tint = cool ? L.coolWin : L.win;
      let a = L.winAlpha * (0.78 + 0.22 * hash(rowIdx * 5, c + bi));
      // A few windows flicker (someone moving past a lamp).
      if (!reducedMotion && hash(bi, rowIdx * 7 + c) > 0.93) {
        a *= 0.5 + 0.5 * (0.5 + 0.5 * Math.sin(tick * 0.15 + rowIdx + c));
      }
      a = clamp01(a);
      // A faint warm bloom around the brightest near/mid windows so the lit
      // neighbourhood glows rather than reading as flat tiles.
      if (L.winAlpha >= 0.9 && a > 0.5) {
        ctx.fillStyle = `rgba(${tint},${(a * 0.22).toFixed(3)})`;
        ctx.fillRect(wx - 1.5 * ui, ry - 1.5 * ui, ww + 3 * ui, wh + 3 * ui);
      }
      ctx.fillStyle = `rgba(${tint},${a.toFixed(3)})`;
      ctx.fillRect(wx, ry, ww, wh);
    }
  }
}

/** Rooftop clutter — a water tower, an antenna, or an AC box, sometimes topped
 *  with a blinking red aviation light. Sells the "real neighbourhood" read. */
function drawRooftop(
  ctx: CanvasRenderingContext2D,
  x: number,
  top: number,
  w: number,
  ui: number,
  tick: number,
  reducedMotion: boolean,
  bi: number,
  L: CityLayer
): void {
  if (top < 0 || top > 100000) return;
  const pick = hash(bi, L.salt + 21);

  if (pick < 0.34 && w > 22 * ui) {
    // Water tower: a squat tank on splayed legs.
    const tw = Math.min(w * 0.32, 16 * ui);
    const tx = x + w * (0.3 + 0.4 * hash(bi, L.salt + 22));
    const legH = 5 * ui;
    const tankH = tw * 0.95;
    const tankTop = top - legH - tankH;
    ctx.strokeStyle = L.roof;
    ctx.lineWidth = Math.max(1, 1.4 * ui);
    ctx.beginPath();
    ctx.moveTo(tx, top);
    ctx.lineTo(tx, top - legH);
    ctx.moveTo(tx + tw, top);
    ctx.lineTo(tx + tw, top - legH);
    ctx.stroke();
    ctx.fillStyle = L.body;
    ctx.fillRect(tx, tankTop, tw, tankH);
    // Conical cap.
    ctx.beginPath();
    ctx.moveTo(tx - 1 * ui, tankTop);
    ctx.lineTo(tx + tw / 2, tankTop - tw * 0.4);
    ctx.lineTo(tx + tw + 1 * ui, tankTop);
    ctx.closePath();
    ctx.fill();
  } else if (pick < 0.6) {
    // Antenna mast with a blinking aviation light.
    const ax = x + w * (0.4 + 0.35 * hash(bi, L.salt + 23));
    const antH = (14 + 20 * hash(bi, L.salt + 24)) * ui;
    ctx.strokeStyle = L.roof;
    ctx.lineWidth = Math.max(1, 1.2 * ui);
    ctx.beginPath();
    ctx.moveTo(ax, top);
    ctx.lineTo(ax, top - antH);
    ctx.stroke();
    const on = reducedMotion ? true : Math.sin(tick * 0.11 + bi) > 0.25;
    if (on) {
      ctx.fillStyle = "rgba(255,96,96,0.92)";
      ctx.beginPath();
      ctx.arc(ax, top - antH, Math.max(1.3, 1.6 * ui), 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (pick < 0.78 && w > 26 * ui) {
    // A low AC / stair box near one edge.
    const bw = w * (0.18 + 0.12 * hash(bi, L.salt + 25));
    const bh = 5 * ui + 4 * ui * hash(bi, L.salt + 26);
    const bx = x + w * (hash(bi, L.salt + 27) > 0.5 ? 0.12 : 0.62);
    ctx.fillStyle = L.body;
    ctx.fillRect(bx, top - bh, bw, bh);
    ctx.fillStyle = L.roof;
    ctx.fillRect(bx, top - bh, bw, Math.max(1, 1.2 * ui));
  }
}
