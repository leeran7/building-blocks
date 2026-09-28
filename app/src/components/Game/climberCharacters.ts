/**
 * Per-avatar climber characters — the registry the sprite engine
 * (climberSprite.ts) reads. Keyed by avatar id (src/lib/avatars.ts).
 *
 * Two kinds of entry:
 *  - `sheets`: the character has its own art in public/climb/ (see
 *    public/climb/README.md for the sheet layout and anchor contract).
 *  - `tint`: no art yet. The Wraith sheets are recoloured once per character
 *    into an offscreen canvas: the Wraith's lime accent becomes `accent`, and
 *    the dark body greys lean toward `body` (luminance kept).
 *
 * Adding art for a character is one line here: replace its `tint(...)` entry
 * with `sheets("<id>")` and drop `<id>-poses-192.png` (and optionally
 * `<id>-climb-192.png`) into public/climb/. The mobile bundle picks the files
 * up by name (mobile/src/lib/climberSheets.ts); nothing else changes.
 *
 * Tint colours were sampled from each portrait in
 * mobile/src/assets/avatars/<id>.webp: `accent` is the brighter half of the
 * dominant saturated hue (10° bins, grey and near-black/white pixels
 * excluded), `body` the mean of the portrait's dark pixels (lightness < 0.3).
 */

/** Source cell edge (px) of every shipped atlas, and the `-192` in file names. */
export const SHEET_CELL = 192;
const PACK_CELL = 512; // the art pack's original cell, where the anchor was measured
const K = SHEET_CELL / PACK_CELL;

/** The Wraith sheets' lime accent, which a tint recolours. */
export const BASE_ACCENT = "#c6f24d";

export interface SheetCharacter {
  readonly kind: "sheets";
  /** 4×2 poses atlas: idle, run-a, run-b, reach-a / reach-b, falling, celebrate, down. */
  readonly poses: string;
  /** Optional 6×1 back-view climb strip; null = climb uses reach-a/reach-b. */
  readonly climb: string | null;
  /** Cell edge in px. */
  readonly cell: number;
  /** Foot anchor within a cell (px from the cell's top-left). */
  readonly rootX: number;
  readonly rootY: number;
  /** Idle figure height in cell px: one scale for every pose. */
  readonly refH: number;
}

export interface TintCharacter {
  readonly kind: "tint";
  /** "#rrggbb" that replaces the Wraith's lime accent. */
  readonly accent: string;
  /** "#rrggbb" toward which the dark body greys lean; null keeps them grey. */
  readonly body: string | null;
}

export type ClimberCharacter = SheetCharacter | TintCharacter;

export interface SheetOptions {
  /** False when the character ships no climb strip. Default true. */
  readonly climb?: boolean;
  readonly rootX?: number;
  readonly rootY?: number;
  readonly refH?: number;
}

/**
 * A character drawn from its own sheets, named by the contract:
 * /climb/<id>-poses-192.png and /climb/<id>-climb-192.png. The anchor defaults
 * to the pack's: foot root at (256, 460) of a 512 cell, 380 px idle height,
 * scaled to 192.
 */
export function sheets(id: string, opts: SheetOptions = {}): SheetCharacter {
  return {
    kind: "sheets",
    poses: `/climb/${id}-poses-${SHEET_CELL}.png`,
    climb: opts.climb === false ? null : `/climb/${id}-climb-${SHEET_CELL}.png`,
    cell: SHEET_CELL,
    rootX: opts.rootX ?? 256 * K,
    rootY: opts.rootY ?? 460 * K,
    refH: opts.refH ?? 380 * K,
  };
}

/** Wraith sheets recoloured: `accent` for the lime, optional `body` tone. */
export function tint(accent: string, body: string | null = null): TintCharacter {
  return { kind: "tint", accent, body };
}

/** The base character: its sheets are every tint's source and every fallback. */
export const BASE_CHARACTER_ID = "wraith";
export const WRAITH: SheetCharacter = sheets(BASE_CHARACTER_ID);

/**
 * One entry per avatar id. A test pins that the keys match the avatar
 * catalogue exactly and that every colour parses.
 */
export const CLIMBER_CHARACTERS: Readonly<Record<string, ClimberCharacter>> = {
  wraith: WRAITH,
  viking: tint("#f4661c", "#291816"),
  sentinel: tint("#42eff6", "#132026"),
  ibex: tint("#ecba55", "#2e1e12"),
  falcon: tint("#f29842", "#2e1c17"),
  marmot: tint("#eaae74", "#2d1f18"),
  gecko: tint("#b2ef2f", "#202916"),
  panther: tint("#b446f4", "#211529"),
  otter: tint("#3595f2", "#151d2b"),
  raven: tint("#f4b943", "#291c14"),
  lynx: tint("#f23db5", "#2b1822"),
  bison: tint("#f1442a", "#321412"),
  heron: tint("#3b93e6", "#162033"),
  cobra: tint("#1982f5", "#12192f"),
  badger: tint("#be4df4", "#231828"),
  wolf: tint("#f43fba", "#2d1622"),
  kestrel: tint("#4a9fef", "#231c23"),
  mantis: tint("#b3f027", "#152f14"),
  yak: tint("#ea4239", "#311614"),
};

const HEX = /^#([0-9a-f]{6})$/i;

/** [r, g, b] 0–255 for "#rrggbb"; null for anything else (never a default). */
export function parseHexColor(v: string): [number, number, number] | null {
  const m = HEX.exec(v);
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
