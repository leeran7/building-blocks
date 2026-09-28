import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { CLIMBER_CHARACTERS, SHEET_CELL } from "../../src/components/Game/climberCharacters";

/**
 * Every character the registry draws from its own sheets must ship them in
 * public/climb/ at the contract's size (public/climb/README.md): a 4×2 poses
 * atlas and, when declared, a 6×1 climb strip of SHEET_CELL cells. A missing
 * or mis-sized sheet would otherwise only show up as the Wraith fallback.
 */

const PUBLIC = path.join(__dirname, "../../public");

/** Width and height from a PNG's IHDR chunk; null when the bytes are not a PNG. */
function pngSize(buf: Buffer): { w: number; h: number } | null {
  const sig = "89504e470d0a1a0a";
  if (buf.length < 24 || buf.subarray(0, 8).toString("hex") !== sig) return null;
  if (buf.subarray(12, 16).toString("ascii") !== "IHDR") return null;
  return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
}

function sheetSize(url: string): { w: number; h: number } | null {
  return pngSize(readFileSync(path.join(PUBLIC, url)));
}

describe("climber sheet files", () => {
  it("pngSize rejects bytes that are not a PNG", () => {
    expect(pngSize(Buffer.from("not a png at all, just text bytes"))).toBeNull();
    expect(pngSize(readFileSync(path.join(PUBLIC, "climb/volcano-tile.jpg")))).toBeNull();
  });

  it("ships every registered sheet at the contract's size", () => {
    let checked = 0;
    for (const [id, c] of Object.entries(CLIMBER_CHARACTERS)) {
      if (c.kind !== "sheets") continue;
      expect(c.cell, id).toBe(SHEET_CELL);
      expect(sheetSize(c.poses), `${id} poses`).toEqual({ w: 4 * SHEET_CELL, h: 2 * SHEET_CELL });
      if (c.climb) expect(sheetSize(c.climb), `${id} climb`).toEqual({ w: 6 * SHEET_CELL, h: SHEET_CELL });
      checked++;
    }
    expect(checked).toBeGreaterThan(0);
  });

  it("fails for a sheet that is not on disk", () => {
    expect(() => sheetSize("/climb/nobody-poses-192.png")).toThrow();
  });
});
