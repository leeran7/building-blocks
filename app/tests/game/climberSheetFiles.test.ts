import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { CLIMBER_CHARACTERS, SHEET_CELL } from "../../src/components/Game/climberCharacters";

/**
 * Every `sheets` entry in the live registry points at PNGs that ship in
 * public/climb/ with the atlas layout the engine indexes: 4×2 cells for the
 * poses sheet, 6×1 for the climb strip (public/climb/README.md).
 */

const PUBLIC = join(__dirname, "../../public");
const PNG_SIG = "89504e470d0a1a0a";

/** Width × height from a PNG's IHDR, or null when the bytes are not a PNG. */
function pngSize(buf: Buffer): { w: number; h: number } | null {
  if (buf.length < 24 || buf.subarray(0, 8).toString("hex") !== PNG_SIG) return null;
  if (buf.subarray(12, 16).toString("ascii") !== "IHDR") return null;
  return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
}

function sheetSize(url: string): { w: number; h: number } | null {
  try {
    return pngSize(readFileSync(join(PUBLIC, url)));
  } catch {
    return null;
  }
}

describe("shipped climber sheets", () => {
  it("pngSize rejects bytes that are not a PNG", () => {
    expect(pngSize(Buffer.from("not a png at all, just some text"))).toBeNull();
    expect(pngSize(readFileSync(join(PUBLIC, "logo-1024.jpg")))).toBeNull();
  });

  it("sheetSize is null for a file that does not ship", () => {
    expect(sheetSize("/climb/nobody-poses-192.png")).toBeNull();
  });

  it("every sheets entry has a 4×2 poses atlas and, when listed, a 6×1 climb strip", () => {
    let checked = 0;
    for (const [id, c] of Object.entries(CLIMBER_CHARACTERS)) {
      if (c.kind !== "sheets") continue;
      expect(sheetSize(c.poses), `${id} poses`).toEqual({ w: 4 * c.cell, h: 2 * c.cell });
      if (c.climb) expect(sheetSize(c.climb), `${id} climb`).toEqual({ w: 6 * c.cell, h: c.cell });
      expect(c.cell).toBe(SHEET_CELL);
      checked++;
    }
    expect(checked).toBeGreaterThan(0);
  });
});
