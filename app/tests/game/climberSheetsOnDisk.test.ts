import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { CLIMBER_CHARACTERS, type SheetCharacter } from "../../src/components/Game/climberCharacters";

/**
 * Every registry entry with its own art points at PNGs that ship in
 * public/climb/ at the contract's layout (public/climb/README.md): a 4×2
 * poses atlas and an optional 6×1 climb strip of 192 px cells.
 */

const PUBLIC = resolve(__dirname, "../../public");

/** Width and height from a PNG's IHDR chunk, or null if it is not a PNG. */
function pngSize(buf: Buffer): { w: number; h: number } | null {
  const sig = "89504e470d0a1a0a";
  if (buf.length < 24 || buf.subarray(0, 8).toString("hex") !== sig) return null;
  if (buf.subarray(12, 16).toString("ascii") !== "IHDR") return null;
  return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
}

function sheetSize(url: string): { w: number; h: number } | null {
  return pngSize(readFileSync(resolve(PUBLIC, `.${url}`)));
}

const withArt = Object.entries(CLIMBER_CHARACTERS).filter(
  (e): e is [string, SheetCharacter] => e[1].kind === "sheets",
);

describe("climber sheets on disk", () => {
  it("covers the Wraith and the Panther, Otter and Raven art", () => {
    const ids = withArt.map(([id]) => id);
    expect(ids).toEqual(expect.arrayContaining(["wraith", "panther", "otter", "raven"]));
  });

  it.each(withArt)("%s ships its poses atlas at 4×2 cells", (_id, c) => {
    expect(sheetSize(c.poses)).toEqual({ w: 4 * c.cell, h: 2 * c.cell });
  });

  it.each(withArt.filter(([, c]) => c.climb !== null))("%s ships its climb strip at 6×1 cells", (_id, c) => {
    expect(sheetSize(c.climb as string)).toEqual({ w: 6 * c.cell, h: c.cell });
  });

  it("pngSize rejects a file that is not a PNG", () => {
    expect(pngSize(readFileSync(resolve(PUBLIC, "climb/volcano-tile.jpg")))).toBeNull();
    expect(pngSize(Buffer.from("not a png at all, just text"))).toBeNull();
  });
});
