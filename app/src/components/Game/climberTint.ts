/**
 * Recolouring the Wraith sheets into another palette, for `tint` characters.
 * Kept for a future recolour feature (e.g. unlockable colour skins, colours in
 * RECOLOR_PALETTE); the live registry uses real art only, so avatars without
 * their own sheets draw as the plain Wraith and never reach this. Pure pixel maths
 * plus one offscreen-canvas render per sheet; climberSprite.ts caches the
 * result per character, so this never runs per frame.
 */

import { BASE_ACCENT, parseHexColor, type TintCharacter } from "./climberCharacters";

/** Accent recolour: pixels within HUE_IN° of the lime hue move fully, none past HUE_OUT°. */
const HUE_IN = 25;
const HUE_OUT = 45;
/** Saturation ramp: greys (below SAT_LO) never count as accent. */
const SAT_LO = 0.15;
const SAT_HI = 0.35;
/** How far the dark body leans toward the body tone (0 = grey, 1 = full). */
export const BODY_MIX = 0.6;

type Hsl = [number, number, number];

function rgbToHsl(r: number, g: number, b: number): Hsl {
  const rr = r / 255;
  const gg = g / 255;
  const bb = b / 255;
  const max = Math.max(rr, gg, bb);
  const min = Math.min(rr, gg, bb);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  if (max === rr) h = (gg - bb) / d + (gg < bb ? 6 : 0);
  else if (max === gg) h = (bb - rr) / d + 2;
  else h = (rr - gg) / d + 4;
  return [h * 60, s, l];
}

function hueToRgb(p: number, q: number, t: number): number {
  let u = t;
  if (u < 0) u += 1;
  if (u > 1) u -= 1;
  if (u < 1 / 6) return p + (q - p) * 6 * u;
  if (u < 1 / 2) return q;
  if (u < 2 / 3) return p + (q - p) * (2 / 3 - u) * 6;
  return p;
}

/** Writes 0–255 rgb for (h°, s, l) into out[0..2]. */
function hslToRgb(h: number, s: number, l: number, out: number[]): void {
  if (s === 0) {
    out[0] = out[1] = out[2] = l * 255;
    return;
  }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const hh = (((h % 360) + 360) % 360) / 360;
  out[0] = hueToRgb(p, q, hh + 1 / 3) * 255;
  out[1] = hueToRgb(p, q, hh) * 255;
  out[2] = hueToRgb(p, q, hh - 1 / 3) * 255;
}

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);
const smoothstep = (a: number, b: number, v: number): number => {
  const t = clamp01((v - a) / (b - a));
  return t * t * (3 - 2 * t);
};
const hueDist = (a: number, b: number): number => {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
};
const luma = (r: number, g: number, b: number): number => 0.2126 * r + 0.7152 * g + 0.0722 * b;

/** A tint definition resolved to numbers once. */
export interface TintSpec {
  readonly base: Hsl;
  readonly accent: Hsl;
  /** Body rgb divided by its luma (a per-channel gain at equal brightness), or null. */
  readonly bodyGain: readonly [number, number, number] | null;
}

/** Numbers for a tint entry; null when a colour does not parse. */
export function tintSpec(def: TintCharacter): TintSpec | null {
  const base = parseHexColor(BASE_ACCENT);
  const accent = parseHexColor(def.accent);
  if (!base || !accent) return null;
  let bodyGain: TintSpec["bodyGain"] = null;
  if (def.body !== null) {
    const body = parseHexColor(def.body);
    if (!body) return null;
    const y = luma(body[0], body[1], body[2]);
    bodyGain = y > 0 ? [body[0] / y, body[1] / y, body[2] / y] : null;
  }
  return { base: rgbToHsl(...base), accent: rgbToHsl(...accent), bodyGain };
}

const px = [0, 0, 0];

/**
 * Recolour RGBA pixels in place (unpremultiplied, as getImageData returns).
 * Lime-hued pixels take the accent's hue, keeping their offset from the lime
 * hue; saturation and lightness scale by accent/lime so shading survives.
 * Everything else leans toward the body tone at equal luma, less so the
 * lighter it is. Alpha is untouched.
 */
export function tintPixels(data: Uint8ClampedArray, spec: TintSpec): void {
  const [bh, bs, bl] = spec.base;
  const [ah, as, al] = spec.accent;
  const gain = spec.bodyGain;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] === 0) continue;
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const [h, s, l] = rgbToHsl(r, g, b);
    const w = (1 - smoothstep(HUE_IN, HUE_OUT, hueDist(h, bh))) * smoothstep(SAT_LO, SAT_HI, s);
    let br = r;
    let bg = g;
    let bb = b;
    if (gain) {
      const y = luma(r, g, b);
      const k = BODY_MIX * (1 - y / 255);
      br = r + (Math.min(255, y * gain[0]) - r) * k;
      bg = g + (Math.min(255, y * gain[1]) - g) * k;
      bb = b + (Math.min(255, y * gain[2]) - b) * k;
    }
    if (w > 0) {
      const l2 = l <= bl ? (l * al) / bl : al + ((l - bl) * (1 - al)) / (1 - bl);
      hslToRgb(ah + (h - bh), clamp01((s * as) / bs), clamp01(l2), px);
      br += (px[0] - br) * w;
      bg += (px[1] - bg) * w;
      bb += (px[2] - bb) * w;
    }
    data[i] = br;
    data[i + 1] = bg;
    data[i + 2] = bb;
  }
}

/**
 * The sheet recoloured into a new offscreen canvas, or null where that is not
 * possible (no DOM, no 2D context, or a canvas the page may not read back).
 */
export function renderTintedSheet(img: HTMLImageElement, spec: TintSpec): HTMLCanvasElement | null {
  if (typeof document === "undefined") return null;
  const w = img.naturalWidth;
  const h = img.naturalHeight;
  if (!(w > 0 && h > 0)) return null;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const g = canvas.getContext("2d", { willReadFrequently: true });
  if (!g) return null;
  try {
    g.drawImage(img, 0, 0);
    const pixels = g.getImageData(0, 0, w, h);
    tintPixels(pixels.data, spec);
    g.putImageData(pixels, 0, 0);
  } catch {
    // Tainted canvas (cross-origin art) or out of memory: draw the Wraith as-is.
    return null;
  }
  return canvas;
}
