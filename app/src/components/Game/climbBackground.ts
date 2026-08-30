/**
 * Climb backdrop — a repeating volcanic tile.
 *
 * One JPEG (rock terraces + lava rivers, not a lava lake) is decoded once and
 * blitted as a vertical loop. That is cheaper than drawing plates or pools: a
 * tick is 1–3 tile blits, overlay fills, and a field of pre-baked ember
 * sprites (cores, halos, streaks, sparks, cinders) plus pulsing heat vents.
 * Sprites are decoded once; a tick only drawImages them. The orange lake that
 * read as "you spawned in the lava" is gone.
 *
 * camWorldY scrolls the tile (slow parallax) and eases a cool overlay as you
 * climb away from the caldera. Embers thin with altitude. Vertex counts do
 * not scale with width. The body is wrapped in save/restore so fill state
 * cannot leak onto gameplay.
 */

export const VOLCANO_TILE_SRC = "/climb/volcano-tile.jpg";

/** Camera altitudes (metres) at the five biome anchors. */
export const BIOME_ALTITUDES = [0, 140, 300, 560, 900] as const;

/** Pixels the tile slides per world metre. Slow on purpose — it is scenery. */
const PARALLAX = 1.8;

const FALLBACK = "#161014";
const OVERLAY: readonly Rgb[] = [
  [12, 8, 8],
  [12, 10, 14],
  [10, 12, 18],
  [10, 14, 22],
  [12, 18, 28],
];
const OVERLAY_A = [0.18, 0.26, 0.34, 0.4, 0.46] as const;
const EMBER = ["255,74,36", "255,102,48", "255,132,64", "255,176,80"] as const;
export const EMBER_MAX = 88;
const VENT_COUNT = 7;

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const frac = (v: number) => v - Math.floor(v);

/** 0 at the volcano floor, 1 at the summit and above. */
export function biomeProgress(camWorldY: number): number {
  const y = Math.max(0, camWorldY);
  const last = BIOME_ALTITUDES[BIOME_ALTITUDES.length - 1];
  if (y >= last) return 1;
  for (let i = 0; i < BIOME_ALTITUDES.length - 1; i++) {
    const a = BIOME_ALTITUDES[i];
    const b = BIOME_ALTITUDES[i + 1];
    if (y < b) {
      return (i + (y - a) / (b - a)) / (BIOME_ALTITUDES.length - 1);
    }
  }
  return 1;
}

/** Named band for the camera altitude. */
export function climbBiome(camWorldY: number): ClimbBiome {
  if (camWorldY < BIOME_ALTITUDES[1]) return "volcano";
  if (camWorldY < BIOME_ALTITUDES[2]) return "cooling";
  if (camWorldY < BIOME_ALTITUDES[3]) return "mountains";
  if (camWorldY < BIOME_ALTITUDES[4]) return "leaving";
  return "summit";
}

/** Tile scroll in [0, tileH). Deterministic; wraps so the seam stays hidden. */
export function tileScrollY(camWorldY: number, tileH: number): number {
  if (!(tileH > 0)) return 0;
  const y = Math.max(0, camWorldY) * PARALLAX;
  return ((y % tileH) + tileH) % tileH;
}

/** How many vertical repeats cover a canvas. Depends on height/tileH, not width. */
export function tileRepeatCount(canvasH: number, tileH: number): number {
  if (!(tileH > 0) || !(canvasH > 0)) return 0;
  return Math.ceil(canvasH / tileH) + 1;
}

/** Ember count for this altitude. Caps at EMBER_MAX; thins as you climb. */
export function emberCount(camWorldY: number): number {
  const heat = 0.35 + 0.65 * (1 - biomeProgress(camWorldY));
  return Math.max(6, Math.round(EMBER_MAX * heat));
}

/**
 * Draw the tiled vista. `tile` is for tests; production decodes VOLCANO_TILE_SRC
 * once and reuses it. While the JPEG is still loading, a dark fill covers the
 * canvas so the first tick is never a blank or an orange lake.
 */
export function drawClimbBackground(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  camWorldY: number,
  tick: number = 0,
  reducedMotion: boolean = false,
  tile?: CanvasImageSource | null
): void {
  const src = tile === undefined ? ensureTile() : tile;

  ctx.save();

  if (src) {
    drawTiles(ctx, width, height, camWorldY, src);
  } else {
    ctx.fillStyle = FALLBACK;
    ctx.fillRect(0, 0, width, height);
  }

  const t = biomeProgress(camWorldY);
  const wash = sampleRgb(OVERLAY, t);
  ctx.fillStyle = `rgba(${wash[0] | 0},${wash[1] | 0},${wash[2] | 0},${sample(OVERLAY_A, t).toFixed(3)})`;
  ctx.fillRect(0, 0, width, height);

  ctx.fillStyle = "rgba(10,10,12,0.32)";
  ctx.fillRect(0, height * 0.82, width, height * 0.18);

  drawEmbers(ctx, width, height, camWorldY, tick, reducedMotion);

  ctx.restore();
}

type Rgb = [number, number, number];
export type ClimbBiome =
  | "volcano"
  | "cooling"
  | "mountains"
  | "leaving"
  | "summit";

let decoded: HTMLImageElement | null = null;
let decodeFailed = false;

function ensureTile(): HTMLImageElement | null {
  if (decodeFailed) return null;
  if (decoded && decoded.complete && decoded.naturalWidth > 0) return decoded;
  if (typeof Image === "undefined") return null;
  if (!decoded) {
    decoded = new Image();
    decoded.onload = () => undefined;
    decoded.onerror = () => {
      decodeFailed = true;
    };
    decoded.src = VOLCANO_TILE_SRC;
  }
  return decoded.complete && decoded.naturalWidth > 0 ? decoded : null;
}

function drawTiles(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  camWorldY: number,
  src: CanvasImageSource
): void {
  const { w: nw, h: nh } = naturalSize(src);
  const tileH = width * (nh / nw);
  const scroll = tileScrollY(camWorldY, tileH);
  const repeats = tileRepeatCount(height, tileH);
  let y = -scroll;
  for (let i = 0; i < repeats; i++) {
    ctx.drawImage(src, 0, y, width, tileH);
    y += tileH;
  }
}

function hash(x: number, y: number): number {
  let h = (x | 0) * 374761393 + (y | 0) * 668265263;
  h = (h ^ (h >>> 13)) * 1274126177;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function drawEmbers(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  camWorldY: number,
  tick: number,
  reducedMotion: boolean
): void {
  const heat = 0.35 + 0.65 * (1 - biomeProgress(camWorldY));
  const ui = Math.max(1, w / 360);
  const n = emberCount(camWorldY);
  const t = reducedMotion ? 0 : tick;
  const sprites = ensureSprites();

  ctx.globalCompositeOperation = "lighter";
  drawVents(ctx, w, h, t, heat, ui, reducedMotion, sprites);
  for (let i = 0; i < n; i++) {
    drawEmber(ctx, w, h, i, t, heat, ui, reducedMotion, sprites);
  }
  ctx.globalCompositeOperation = "source-over";
}

function drawVents(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  t: number,
  heat: number,
  ui: number,
  reducedMotion: boolean,
  sprites: EmberSprites | null
): void {
  const halo = sprites?.halo;
  for (let i = 0; i < VENT_COUNT; i++) {
    const pulse = reducedMotion ? 0.75 : 0.55 + 0.45 * Math.sin(t * 0.09 + i * 1.3);
    const a = 0.22 * heat * pulse;
    if (a <= 0.01) continue;
    const x = w * (0.07 + i * 0.14 + (hash(i, 11) - 0.5) * 0.05);
    const y = h * (0.7 + 0.22 * hash(i, 13));
    const s = (28 + 36 * hash(i, 17)) * ui * (0.85 + 0.3 * pulse);
    blitEmber(ctx, halo, x, y, s, s * 0.72, a, 0, `rgba(255,90,36,${a.toFixed(3)})`);
  }
}

function drawEmber(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  i: number,
  t: number,
  heat: number,
  ui: number,
  reducedMotion: boolean,
  sprites: EmberSprites | null
): void {
  const phase = hash(i, 71);
  const kind = (hash(i, 19) * 5) | 0;
  const speed = 0.0016 + 0.0044 * hash(i, 73) + (kind === 2 ? 0.0018 : 0);
  const p = frac(phase + t * speed);
  const rise = kind === 1 ? 0.55 : 0.82;
  const y = h * 1.04 - p * h * rise;
  const drift = Math.sin((reducedMotion ? 0 : t * (0.025 + 0.02 * hash(i, 29))) + phase * 6.283);
  const x = hash(i, 77) * w + drift * w * (0.012 + 0.03 * hash(i, 31));
  const tw = reducedMotion ? 0.85 : 0.45 + 0.55 * Math.sin(t * (0.16 + 0.08 * hash(i, 37)) + i);
  const a = clamp01(0.85 * Math.sin(clamp01(p) * Math.PI) * tw) * heat;
  if (a <= 0.01) return;

  const spin = reducedMotion ? 0 : t * (0.04 + 0.08 * hash(i, 41)) + phase * 6.283;

  if (kind === 0) {
    const s = (5 + 10 * hash(i, 79)) * ui;
    blitEmber(ctx, sprites?.core, x, y, s, s, a, 0, `rgba(${EMBER[i % EMBER.length]},${a.toFixed(3)})`);
    return;
  }
  if (kind === 1) {
    const s = (14 + 22 * hash(i, 79)) * ui;
    blitEmber(ctx, sprites?.halo, x, y, s, s * 0.8, a * 0.7, 0, `rgba(255,120,48,${(a * 0.55).toFixed(3)})`);
    return;
  }
  if (kind === 2) {
    const s = (3 + 5 * hash(i, 79)) * ui;
    const tall = s * (3.2 + 2.4 * (1 - p));
    blitEmber(ctx, sprites?.streak, x, y, s, tall, a, 0, `rgba(255,150,60,${a.toFixed(3)})`);
    return;
  }
  if (kind === 3) {
    const s = (4 + 7 * hash(i, 79)) * ui;
    blitEmber(ctx, sprites?.spark, x, y, s, s, a, spin, `rgba(255,210,120,${a.toFixed(3)})`);
    return;
  }
  const s = (3.5 + 6 * hash(i, 79)) * ui;
  blitEmber(ctx, sprites?.cinder, x, y, s, s * 0.7, a, spin * 0.6, `rgba(${EMBER[i % EMBER.length]},${a.toFixed(3)})`);
}

function blitEmber(
  ctx: CanvasRenderingContext2D,
  sprite: HTMLCanvasElement | undefined,
  x: number,
  y: number,
  dw: number,
  dh: number,
  alpha: number,
  rot: number,
  fallback: string
): void {
  ctx.globalAlpha = alpha;
  if (sprite) {
    if (rot) {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(rot);
      ctx.drawImage(sprite, -dw / 2, -dh / 2, dw, dh);
      ctx.restore();
    } else {
      ctx.drawImage(sprite, x - dw / 2, y - dh / 2, dw, dh);
    }
  } else {
    ctx.fillStyle = fallback;
    ctx.fillRect(x - dw / 2, y - dh / 2, Math.max(1.2, dw * 0.35), Math.max(1.2, dh * 0.35));
  }
  ctx.globalAlpha = 1;
}

type EmberSprites = {
  core: HTMLCanvasElement;
  halo: HTMLCanvasElement;
  streak: HTMLCanvasElement;
  spark: HTMLCanvasElement;
  cinder: HTMLCanvasElement;
};

let spriteCache: EmberSprites | null = null;

function ensureSprites(): EmberSprites | null {
  if (spriteCache) return spriteCache;
  if (typeof document === "undefined") return null;
  const core = bakeGlow(20, [255, 92, 36], 0.95);
  const halo = bakeGlow(36, [255, 128, 48], 0.55);
  const streak = bakeStreak(10, 36, [255, 150, 64]);
  const spark = bakeSpark(18, [255, 214, 130]);
  const cinder = bakeCinder(16, [255, 78, 32]);
  if (!core || !halo || !streak || !spark || !cinder) return null;
  spriteCache = { core, halo, streak, spark, cinder };
  return spriteCache;
}

function bakeGlow(size: number, color: Rgb, inner: number): HTMLCanvasElement | null {
  const cv = document.createElement("canvas");
  cv.width = size;
  cv.height = size;
  const c = cv.getContext("2d");
  if (!c) return null;
  const g = c.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, `rgba(${color[0]},${color[1]},${color[2]},${inner})`);
  g.addColorStop(0.4, `rgba(${color[0]},${color[1]},${color[2]},${inner * 0.4})`);
  g.addColorStop(1, `rgba(${color[0]},${color[1]},${color[2]},0)`);
  c.fillStyle = g;
  c.fillRect(0, 0, size, size);
  return cv;
}

function bakeStreak(w: number, h: number, color: Rgb): HTMLCanvasElement | null {
  const cv = document.createElement("canvas");
  cv.width = w;
  cv.height = h;
  const c = cv.getContext("2d");
  if (!c) return null;
  const g = c.createLinearGradient(w / 2, 0, w / 2, h);
  g.addColorStop(0, `rgba(${color[0]},${color[1]},${color[2]},0)`);
  g.addColorStop(0.35, `rgba(${color[0]},${color[1]},${color[2]},0.85)`);
  g.addColorStop(1, `rgba(255,220,140,0.15)`);
  c.fillStyle = g;
  c.beginPath();
  c.moveTo(w / 2, 0);
  c.lineTo(w, h);
  c.lineTo(0, h);
  c.closePath();
  c.fill();
  return cv;
}

function bakeSpark(size: number, color: Rgb): HTMLCanvasElement | null {
  const cv = document.createElement("canvas");
  cv.width = size;
  cv.height = size;
  const c = cv.getContext("2d");
  if (!c) return null;
  const m = size / 2;
  const g = c.createRadialGradient(m, m, 0, m, m, m);
  g.addColorStop(0, `rgba(${color[0]},${color[1]},${color[2]},1)`);
  g.addColorStop(0.25, `rgba(${color[0]},${color[1]},${color[2]},0.7)`);
  g.addColorStop(1, `rgba(${color[0]},${color[1]},${color[2]},0)`);
  c.fillStyle = g;
  c.beginPath();
  c.moveTo(m, 0);
  c.lineTo(m + size * 0.08, m - size * 0.08);
  c.lineTo(size, m);
  c.lineTo(m + size * 0.08, m + size * 0.08);
  c.lineTo(m, size);
  c.lineTo(m - size * 0.08, m + size * 0.08);
  c.lineTo(0, m);
  c.lineTo(m - size * 0.08, m - size * 0.08);
  c.closePath();
  c.fill();
  return cv;
}

function bakeCinder(size: number, color: Rgb): HTMLCanvasElement | null {
  const cv = document.createElement("canvas");
  cv.width = size;
  cv.height = size;
  const c = cv.getContext("2d");
  if (!c) return null;
  c.fillStyle = `rgb(${color[0]},${color[1]},${color[2]})`;
  c.beginPath();
  c.moveTo(size * 0.2, size * 0.35);
  c.lineTo(size * 0.55, size * 0.1);
  c.lineTo(size * 0.88, size * 0.4);
  c.lineTo(size * 0.7, size * 0.85);
  c.lineTo(size * 0.22, size * 0.78);
  c.closePath();
  c.fill();
  const g = c.createRadialGradient(size * 0.45, size * 0.4, 0, size * 0.45, size * 0.4, size * 0.5);
  g.addColorStop(0, "rgba(255,220,140,0.7)");
  g.addColorStop(1, "rgba(255,80,30,0)");
  c.fillStyle = g;
  c.fillRect(0, 0, size, size);
  return cv;
}

function naturalSize(src: CanvasImageSource): { w: number; h: number } {
  const s = src as {
    naturalWidth?: number;
    naturalHeight?: number;
    width?: number;
    height?: number;
  };
  const w = s.naturalWidth || s.width || 1;
  const h = s.naturalHeight || s.height || 1;
  return { w: Math.max(1, w), h: Math.max(1, h) };
}

function sample(stops: readonly number[], t: number): number {
  const n = stops.length - 1;
  const x = clamp01(t) * n;
  const i = Math.min(n - 1, x | 0);
  const u = x - i;
  return stops[i] + (stops[i + 1] - stops[i]) * u;
}

function sampleRgb(stops: readonly Rgb[], t: number): Rgb {
  const n = stops.length - 1;
  const x = clamp01(t) * n;
  const i = Math.min(n - 1, x | 0);
  const u = x - i;
  const a = stops[i];
  const b = stops[i + 1];
  return [
    a[0] + (b[0] - a[0]) * u,
    a[1] + (b[1] - a[1]) * u,
    a[2] + (b[2] - a[2]) * u,
  ];
}
