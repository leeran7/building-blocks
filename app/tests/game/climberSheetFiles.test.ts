import { readFileSync } from "node:fs";
import { join } from "node:path";
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
});
