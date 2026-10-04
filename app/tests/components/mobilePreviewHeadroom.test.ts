/**
 * CharacterPreview's canvas must have room above the skull for horns, ears
 * and crests, or the card cuts them off (the Void Ibex and Bison on the Shop
 * did). previewSize() budgets PREVIEW_HEADROOM of the figure height for it;
 * this decodes every cell of every character's sheets (the climb's hands
 * reach over the head, and the walk bobs) and measures the art against that
 * budget. The Shop's featured card sizes its one character by hand, so it is
 * measured on its own.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { inflateSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { CLIMBER_CHARACTERS, type SheetCharacter } from "@app/components/Game/climberCharacters";
import { WALK_BOB } from "@app/components/Game/climberSprite";
import { PREVIEW_FOOT_PAD, PREVIEW_HEADROOM, previewSize } from "../../mobile/src/components/CharacterPreview";
import { FEATURED_CHARACTER_ID, FEATURED_FIGURE } from "../../mobile/src/screens/ShopScreen";

const SHEETS = fileURLToPath(new URL("../../public/climb/", import.meta.url));
/** Below this alpha a pixel is anti-aliasing fringe, not art. */
const OPAQUE = 8;

/**
 * The alpha channel of an 8-bit, non-interlaced PNG: RGBA, RGB (opaque), or
 * palette with a tRNS table (what the sheet compiler writes for the Wraith).
 */
function pngAlpha(file: string): { width: number; height: number; alpha: (x: number, y: number) => number } {
  const buf = readFileSync(file);
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error(`${file}: not a PNG`);
  let width = 0;
  let height = 0;
  let depth = 0;
  let colorType = 0;
  let trns: Buffer = Buffer.alloc(0);
  const idat: Buffer[] = [];
  for (let pos = 8; pos < buf.length; ) {
    const len = buf.readUInt32BE(pos);
    const type = buf.toString("ascii", pos + 4, pos + 8);
    const data = buf.subarray(pos + 8, pos + 8 + len);
    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      depth = data[8];
      colorType = data[9];
      if (data[12] !== 0) throw new Error(`${file}: interlaced`);
    } else if (type === "IDAT") {
      idat.push(data);
    } else if (type === "tRNS") {
      trns = data;
    } else if (type === "IEND") {
      break;
    }
    pos += 12 + len;
  }
  const BPP: Record<number, number> = { 2: 3, 3: 1, 6: 4 };
  const bpp = BPP[colorType];
  if (depth !== 8 || bpp === undefined) throw new Error(`${file}: expected 8-bit RGB, RGBA or palette, got depth ${depth} type ${colorType}`);
  const stride = width * bpp;
  const raw = inflateSync(Buffer.concat(idat));
  const px = Buffer.alloc(height * stride);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    const src = y * (stride + 1) + 1;
    const dst = y * stride;
    for (let i = 0; i < stride; i++) {
      const a = i >= bpp ? px[dst + i - bpp] : 0;
      const b = y > 0 ? px[dst - stride + i] : 0;
      const c = y > 0 && i >= bpp ? px[dst - stride + i - bpp] : 0;
      let v = raw[src + i];
      if (filter === 1) v += a;
      else if (filter === 2) v += b;
      else if (filter === 3) v += (a + b) >> 1;
      else if (filter === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a);
        const pb = Math.abs(p - b);
        const pc = Math.abs(p - c);
        v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      } else if (filter !== 0) throw new Error(`${file}: bad filter ${filter} on row ${y}`);
      px[dst + i] = v & 255;
    }
  }
  const alpha = (x: number, y: number): number => {
    const at = y * stride + x * bpp;
    if (colorType === 6) return px[at + 3];
    if (colorType === 3) return px[at] < trns.length ? trns[px[at]] : 255;
    return 255;
  };
  return { width, height, alpha };
}

const isSheet = (c: unknown): c is SheetCharacter => typeof c === "object" && c !== null && "refH" in c;

/** Every character drawn from its own sheets, with its poses file. */
function sheetCharacters(): Array<[string, SheetCharacter]> {
  return Object.entries(CLIMBER_CHARACTERS).flatMap(([id, c]) => (isSheet(c) ? [[id, c] as [string, SheetCharacter]] : []));
}

/** The topmost row with art in one cell of a sheet, from the cell's top. */
function artTop(png: ReturnType<typeof pngAlpha>, cell: number, col: number, row: number, what: string): number {
  for (let y = 0; y < cell; y++) {
    for (let x = 0; x < cell; x++) {
      if (png.alpha(col * cell + x, row * cell + y) > OPAQUE) return y;
    }
  }
  throw new Error(`${what}: empty cell`);
}

/** The poses sheet: 4 x 2 cells, idle first, then the two walk strides. */
const POSE_CELLS = 8;
const WALK_CELLS = new Set([1, 2]);
/** The climb strip: 6 x 1 cells. */
const CLIMB_CELLS = 6;

/**
 * How far above the skull top this character's art reaches in any pose the
 * preview can show, as a share of its figure height (refH): the walk cells
 * count the mid-stride bob the sprite is drawn with.
 */
function riseAboveSkull(id: string, c: SheetCharacter): number {
  const headTop = c.rootY - c.refH;
  const poses = pngAlpha(`${SHEETS}${id}-poses-192.png`);
  const climb = pngAlpha(`${SHEETS}${id}-climb-192.png`);
  expect(poses.width).toBe(c.cell * 4);
  expect(climb.width).toBe(c.cell * CLIMB_CELLS);
  let rise = -Infinity;
  for (let i = 0; i < POSE_CELLS; i++) {
    const top = artTop(poses, c.cell, i % 4, Math.floor(i / 4), `${id} pose ${i}`);
    rise = Math.max(rise, (headTop - top) / c.refH + (WALK_CELLS.has(i) ? WALK_BOB : 0));
  }
  for (let i = 0; i < CLIMB_CELLS; i++) {
    rise = Math.max(rise, (headTop - artTop(climb, c.cell, i, 0, `${id} climb ${i}`)) / c.refH);
  }
  return rise;
}

describe("preview headroom", () => {
  it("previewSize leaves room for the tallest horns in the registry, and not much more", () => {
    const rises = sheetCharacters().map(([id, c]) => ({ id, ratio: riseAboveSkull(id, c) }));
    expect(rises.length).toBeGreaterThan(10);
    const tallest = rises.reduce((a, b) => (b.ratio > a.ratio ? b : a));
    expect(tallest.ratio, `${tallest.id} rises ${tallest.ratio.toFixed(3)} of its height above its skull`).toBeLessThanOrEqual(PREVIEW_HEADROOM);
    // The budget tracks the art: a lower one would clip, a much higher one wastes card height.
    expect(tallest.ratio).toBeGreaterThan(PREVIEW_HEADROOM - 0.05);
    for (const figurePx of [62, 100, 190, 200]) {
      expect(previewSize(figurePx) - PREVIEW_FOOT_PAD - figurePx).toBeGreaterThanOrEqual(tallest.ratio * figurePx);
    }
  });

  it("the featured card's hand-sized canvas fits the featured character's art", () => {
    const c = CLIMBER_CHARACTERS[FEATURED_CHARACTER_ID];
    if (!isSheet(c)) throw new Error(`${FEATURED_CHARACTER_ID} is not drawn from sheets`);
    const rise = riseAboveSkull(FEATURED_CHARACTER_ID, c) * FEATURED_FIGURE.figurePx;
    expect(rise).toBeGreaterThan(0);
    expect(FEATURED_FIGURE.sizePx - PREVIEW_FOOT_PAD - FEATURED_FIGURE.figurePx).toBeGreaterThanOrEqual(rise);
  });
});
