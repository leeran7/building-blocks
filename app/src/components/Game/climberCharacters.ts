/**
 * Per-avatar climber characters — the registry the sprite engine
 * (climberSprite.ts) reads. Keyed by avatar id (src/lib/avatars.ts).
 *
 * Characters use real art only. Two kinds of live entry:
 *  - `sheets`: the character has its own art in public/climb/ (see
 *    public/climb/README.md for the sheet layout and anchor contract).
 *  - `base`: no art yet. The avatar draws as the plain Wraith (same sheets,
 *    same runtime, nothing extra loaded) until its own sheets land.
 *
 * Adding art for a character is one line here: replace its `base()` entry
 * with `sheets("<id>")` and drop `<id>-poses-192.png` (and optionally
 * `<id>-climb-192.png`) into public/climb/. The mobile bundle picks the files
 * up by name (mobile/src/lib/climberSheets.ts); nothing else changes.
 *
 * A third kind, `tint` (the Wraith sheets recoloured by climberTint.ts), is
 * kept for a future recolour feature (e.g. unlockable colour skins). The live
 * registry uses none; RECOLOR_PALETTE holds the colours sampled for it.
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

/** No art of its own: the avatar draws as the plain Wraith. */
export interface BaseCharacter {
  readonly kind: "base";
}

export type ClimberCharacter = SheetCharacter | TintCharacter | BaseCharacter;

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

/**
 * Wraith sheets recoloured: `accent` for the lime, optional `body` tone. Not
 * used by the live registry (real art only); kept for the recolour feature.
 */
export function tint(accent: string, body: string | null = null): TintCharacter {
  return { kind: "tint", accent, body };
}

/** The base character: its sheets are every fallback and every tint's source. */
export const BASE_CHARACTER_ID = "wraith";
export const WRAITH: SheetCharacter = sheets(BASE_CHARACTER_ID);

const BASE: BaseCharacter = Object.freeze({ kind: "base" });

/** An avatar with no art yet: it draws as the plain Wraith. */
export function base(): BaseCharacter {
  return BASE;
}

/**
 * One entry per avatar id. A test pins that the keys match the avatar
 * catalogue exactly and that every `base()` avatar resolves to the Wraith.
 */
export const CLIMBER_CHARACTERS: Readonly<Record<string, ClimberCharacter>> = {
  wraith: WRAITH,
  viking: sheets("viking"),
  sentinel: sheets("sentinel"),
  ibex: sheets("ibex"),
  falcon: base(),
  marmot: base(),
  gecko: base(),
  panther: base(),
  otter: base(),
  raven: base(),
  lynx: sheets("lynx"),
  bison: sheets("bison"),
  heron: sheets("heron"),
  cobra: sheets("cobra"),
  badger: sheets("badger"),
  wolf: sheets("wolf"),
  kestrel: base(),
  mantis: base(),
  yak: base(),
};

/** A recolour's two colours, both "#rrggbb" (see TintCharacter). */
export interface RecolorColors {
  readonly accent: string;
  readonly body: string;
}

/**
 * Data for the future recolour feature (e.g. unlockable colour skins); NOT
 * read by the registry above or the sprite engine. Pass an entry to
 * `tint(accent, body)` to build a recoloured Wraith.
 *
 * Colours were sampled from each portrait in
 * mobile/src/assets/avatars/<id>.webp: `accent` is the brighter half of the
 * dominant saturated hue (10° bins, grey and near-black/white pixels
 * excluded), `body` the mean of the portrait's dark pixels (lightness < 0.3).
 */
export const RECOLOR_PALETTE: Readonly<Record<string, RecolorColors>> = {
  viking: { accent: "#f4661c", body: "#291816" },
  sentinel: { accent: "#42eff6", body: "#132026" },
  ibex: { accent: "#ecba55", body: "#2e1e12" },
  falcon: { accent: "#f29842", body: "#2e1c17" },
  marmot: { accent: "#eaae74", body: "#2d1f18" },
  gecko: { accent: "#b2ef2f", body: "#202916" },
  panther: { accent: "#b446f4", body: "#211529" },
  otter: { accent: "#3595f2", body: "#151d2b" },
  raven: { accent: "#f4b943", body: "#291c14" },
  lynx: { accent: "#f23db5", body: "#2b1822" },
  bison: { accent: "#f1442a", body: "#321412" },
  heron: { accent: "#3b93e6", body: "#162033" },
  cobra: { accent: "#1982f5", body: "#12192f" },
  badger: { accent: "#be4df4", body: "#231828" },
  wolf: { accent: "#f43fba", body: "#2d1622" },
  kestrel: { accent: "#4a9fef", body: "#231c23" },
  mantis: { accent: "#b3f027", body: "#152f14" },
  yak: { accent: "#ea4239", body: "#311614" },
};

const HEX = /^#([0-9a-f]{6})$/i;

/** [r, g, b] 0–255 for "#rrggbb"; null for anything else (never a default). */
export function parseHexColor(v: string): [number, number, number] | null {
  const m = HEX.exec(v);
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
