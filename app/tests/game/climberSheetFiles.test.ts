import { readFileSync } from "node:fs";
import { join } from "node:path";
import { inflateSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { CLIMBER_CHARACTERS } from "../../src/components/Game/climberCharacters";

/**
 * Every registry entry with its own art points at files that exist in
 * public/climb/ with the layout the engine crops: a 4×2 poses atlas and a 6×1
 * climb strip of `cell`-px cells. A missing or mis-sized sheet would 404 or
 * mis-crop in the game, so it fails here instead.
 */

const PUBLIC = join(__dirname, "../../public");
const PNG_SIG = "89504e470d0a1a0a";

/** Width and height from a PNG's IHDR chunk; null when the bytes are not a PNG. */
function pngSize(buf: Buffer): { w: number; h: number } | null {
  if (buf.length < 24 || buf.subarray(0, 8).toString("hex") !== PNG_SIG) return null;
  if (buf.subarray(12, 16).toString("latin1") !== "IHDR") return null;
  return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
}

/**
 * Decode an 8-bit, non-interlaced palette (type 3) or RGBA (type 6) PNG to
 * RGBA bytes: the two forms the climber sheets ship in.
 */
function decodePng(buf: Buffer): { w: number; h: number; rgba: Uint8Array } {
  const size = pngSize(buf);
  if (!size) throw new Error("not a PNG");
  const { w, h } = size;
  const depth = buf[24];
  const type = buf[25];
  if (depth !== 8 || (type !== 3 && type !== 6) || buf[28] !== 0) {
    throw new Error(`unsupported PNG (depth ${depth}, type ${type})`);
  }
  let palette: Buffer = Buffer.alloc(0);
  let trns: Buffer = Buffer.alloc(0);
  const idat: Buffer[] = [];
  for (let at = 8; at < buf.length; ) {
    const len = buf.readUInt32BE(at);
    const kind = buf.subarray(at + 4, at + 8).toString("latin1");
    const data = buf.subarray(at + 8, at + 8 + len);
    if (kind === "PLTE") palette = data;
    else if (kind === "tRNS") trns = data;
    else if (kind === "IDAT") idat.push(data);
    at += 12 + len;
  }
  const bpp = type === 6 ? 4 : 1;
  const stride = w * bpp;
  const raw = inflateSync(Buffer.concat(idat));
  const px = new Uint8Array(stride * h);
  for (let y = 0; y < h; y++) {
    const filter = raw[y * (stride + 1)];
    const src = y * (stride + 1) + 1;
    const row = y * stride;
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? px[row + x - bpp] : 0;
      const b = y > 0 ? px[row - stride + x] : 0;
      const c = x >= bpp && y > 0 ? px[row - stride + x - bpp] : 0;
      let pred = 0;
      if (filter === 1) pred = a;
      else if (filter === 2) pred = b;
      else if (filter === 3) pred = (a + b) >> 1;
      else if (filter === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a);
        const pb = Math.abs(p - b);
        const pc = Math.abs(p - c);
        pred = pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      px[row + x] = (raw[src + x] + pred) & 0xff;
    }
  }
  if (type === 6) return { w, h, rgba: px };
  const rgba = new Uint8Array(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    const k = px[i];
    rgba.set([palette[k * 3], palette[k * 3 + 1], palette[k * 3 + 2], k < trns.length ? trns[k] : 255], i * 4);
  }
  return { w, h, rgba };
}

/** Pixels that differ visibly (any channel by more than 48) between two cells. */
function cellDiff(img: { w: number; rgba: Uint8Array }, cell: number, a: number, b: number): number {
  let n = 0;
  for (let y = 0; y < cell; y++) {
    for (let x = 0; x < cell; x++) {
      const i = (y * img.w + a * cell + x) * 4;
      const j = (y * img.w + b * cell + x) * 4;
      for (let ch = 0; ch < 4; ch++) {
        if (Math.abs(img.rgba[i + ch] - img.rgba[j + ch]) > 48) {
          n++;
          break;
        }
      }
    }
  }
  return n;
}

/**
 * Climb frames closer than this read as a held frame: a strip that repeats a
 * frame (1 = 2) stutters, and one that mirrors its cycle (1 = 5) waves instead
 * of climbing. Every shipped strip clears it by a margin (lowest ~1450); the
 * doubled strips this replaced measured 0 to 630.
 */
const MIN_CLIMB_FRAME_DIFF_PX = 1000;

describe("shipped climber sheets", () => {
  it("pngSize reads a real sheet and rejects non-PNG bytes", () => {
    expect(pngSize(readFileSync(join(PUBLIC, "climb/wraith-poses-192.png")))).toEqual({ w: 768, h: 384 });
    expect(pngSize(readFileSync(join(PUBLIC, "climb/volcano-tile.jpg")))).toBeNull();
    expect(pngSize(Buffer.from("not a png"))).toBeNull();
  });

  it("every character with art has a 4×2 poses atlas and, if declared, a 6×1 climb strip", () => {
    let checked = 0;
    for (const [id, ch] of Object.entries(CLIMBER_CHARACTERS)) {
      if (ch.kind !== "sheets") continue;
      const poses = pngSize(readFileSync(join(PUBLIC, ch.poses)));
      expect(poses, `${id} poses`).toEqual({ w: ch.cell * 4, h: ch.cell * 2 });
      if (ch.climb !== null) {
        const climb = pngSize(readFileSync(join(PUBLIC, ch.climb)));
        expect(climb, `${id} climb`).toEqual({ w: ch.cell * 6, h: ch.cell });
      }
      checked++;
    }
    // The Wraith plus at least one other character ships real art.
    expect(checked).toBeGreaterThan(1);
  });

  it("decodePng and cellDiff see a repeated frame as zero difference", () => {
    const strip = decodePng(readFileSync(join(PUBLIC, "climb/wraith-climb-192.png")));
    expect(strip).toMatchObject({ w: 1152, h: 192 });
    expect(cellDiff(strip, 192, 2, 2)).toBe(0);
    expect(cellDiff(strip, 192, 0, 1)).toBeGreaterThan(MIN_CLIMB_FRAME_DIFF_PX);
    // A strip with a doubled frame (cell 1 copied into cell 2) is caught.
    const doubled = { w: strip.w, rgba: strip.rgba.slice() };
    for (let y = 0; y < 192; y++) {
      const row = y * strip.w * 4;
      doubled.rgba.copyWithin(row + 2 * 192 * 4, row + 192 * 4, row + 2 * 192 * 4);
    }
    expect(cellDiff(doubled, 192, 1, 2)).toBe(0);
  });

  it("no climb strip repeats or mirrors a frame", () => {
    let checked = 0;
    for (const [id, ch] of Object.entries(CLIMBER_CHARACTERS)) {
      if (ch.kind !== "sheets" || ch.climb === null) continue;
      const strip = decodePng(readFileSync(join(PUBLIC, ch.climb)));
      for (let a = 0; a < 6; a++) {
        for (let b = a + 1; b < 6; b++) {
          expect(cellDiff(strip, ch.cell, a, b), `${id} climb frames ${a} and ${b}`).toBeGreaterThan(
            MIN_CLIMB_FRAME_DIFF_PX,
          );
        }
      }
      checked++;
    }
    expect(checked).toBeGreaterThan(1);
  });
});
