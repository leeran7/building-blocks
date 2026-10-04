/**
 * Per-avatar climber characters — the registry the sprite engine
 * (climberSprite.ts) reads. Keyed by avatar id (src/lib/avatars.ts).
 *
 * Characters use real art only. Three kinds of live entry:
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
 * A `stick` entry is the vector stick figure in one colour (no sheets); the
 * Green Stick is what every player without a character climbs as.
 *
 * A fourth kind, `tint` (the Wraith sheets recoloured by climberTint.ts), is
 * used for the Wraith colour skins. The 18 paid character skins have their
 * own portrait-faithful art and skull calibration in VOID_SKIN_SHEETS below.
 * Their original Choose Character portraits remain the identity reference.
 */

import { AVATARS, stickColorOf, type AvatarEntry } from "../../lib/avatars";

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
  /**
   * Idle skull height in cell px: from the foot anchor up to the top of the
   * head, not counting horns, ears, crests or a hood. The engine scales it to
   * the stick figure's head top, so the character is a skin over the stick.
   * One scale for every pose.
   */
  readonly refH: number;
  /** Crossfade fraction per cycle frame; see SheetOptions.cycleBlend. */
  readonly cycleBlend: CycleBlend;
}

export interface CycleBlend {
  readonly walk: number;
  readonly climb: number;
}

/**
 * Default fraction of each walk step / climb frame (either side of a
 * boundary) spent crossfading into the neighbouring frame: crisp frames with
 * a short dissolve, right for a cycle drawn as steps of one motion (the
 * Wraith's).
 */
export const CYCLE_BLEND = 0.14;

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

/**
 * The vector stick figure (drawClimber in paintClimbFrame.ts) in one colour.
 * No sheets: the sprite engine draws nothing and the caller draws the figure.
 */
export interface StickCharacter {
  readonly kind: "stick";
  /** "#rrggbb" */
  readonly color: string;
}

export type ClimberCharacter = SheetCharacter | TintCharacter | BaseCharacter | StickCharacter;

export interface SheetOptions {
  /** False when the character ships no climb strip. Default true. */
  readonly climb?: boolean;
  readonly rootX?: number;
  readonly rootY?: number;
  /**
   * Row of the idle cell (cell px from the top) where the skull ends: the top
   * of the head without horns, ears, crests or a hood. Sets refH.
   */
  readonly headTop?: number;
  /**
   * Crossfade fraction per cycle, 0 to 0.5, default CYCLE_BLEND for both. A
   * generated cycle whose frames are six poses rather than steps of one
   * motion cuts between unrelated limb positions 14 times a second; at 0.5 it
   * dissolves continuously instead (crisp at each frame's centre), which
   * reads as limbs moving rather than flickering.
   */
  readonly cycleBlend?: Partial<CycleBlend>;
}

/**
 * A character drawn from its own sheets, named by the contract:
 * /climb/<id>-poses-192.png and /climb/<id>-climb-192.png. The anchor defaults
 * to the pack's: foot root at (256, 460) of a 512 cell, scaled to 192. Pass
 * `headTop` (the skull top, estimated by eye from the idle cell) so the skull
 * sits on the stick figure's head; without it the top of the 380 px idle
 * figure is used.
 */
const clampBlend = (v: number | undefined): number =>
  typeof v === "number" && Number.isFinite(v) ? Math.min(0.5, Math.max(0, v)) : CYCLE_BLEND;

export function sheets(id: string, opts: SheetOptions = {}): SheetCharacter {
  return {
    kind: "sheets",
    poses: `/climb/${id}-poses-${SHEET_CELL}.png`,
    climb: opts.climb === false ? null : `/climb/${id}-climb-${SHEET_CELL}.png`,
    cell: SHEET_CELL,
    rootX: opts.rootX ?? 256 * K,
    rootY: opts.rootY ?? 460 * K,
    refH: (opts.rootY ?? 460 * K) - (opts.headTop ?? (460 - 380) * K),
    cycleBlend: {
      walk: clampBlend(opts.cycleBlend?.walk),
      climb: clampBlend(opts.cycleBlend?.climb),
    },
  };
}

/**
 * Wraith sheets recoloured: `accent` for the lime, optional `body` tone.
 * Used for the Wraith colour skins; character skins have dedicated art.
 */
export function tint(accent: string, body: string | null = null): TintCharacter {
  return { kind: "tint", accent, body };
}

/**
 * The base sheets character: what a `base()` avatar and a character whose own
 * sheets fail to load draw as, and every tint's source.
 */
export const BASE_CHARACTER_ID = "wraith";
export const WRAITH: SheetCharacter = sheets(BASE_CHARACTER_ID, { headTop: 52 }); // skull inside the hood

const BASE: BaseCharacter = Object.freeze({ kind: "base" });

/** An avatar with no art yet: it draws as the plain Wraith. */
export function base(): BaseCharacter {
  return BASE;
}

/** The stick figure in the catalogue colour of `avatarId` (a stick entry in avatars.ts). */
function stickFor(avatarId: string): StickCharacter {
  const color = stickColorOf(avatarId);
  if (color === null) throw new Error(`climberCharacters: ${avatarId} is not a stick figure`);
  return { kind: "stick", color };
}

/** A recolour's two colours, both "#rrggbb" (see TintCharacter). */
export interface RecolorColors {
  readonly accent: string;
  readonly body: string;
}

/**
 * Each character's colours: the fallback tint for a Void skin missing from
 * VOID_SKIN_SHEETS (none today), and data for a future recolour feature.
 * Pass an entry to `tint(accent, body)` to build a recoloured Wraith.
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

/**
 * The Void climb strips are six generated poses re-sequenced into a loop
 * (scripts/climber-art), not steps of one motion, so they dissolve
 * continuously; their walk strides are matched contact poses like the
 * Wraith's and keep the default.
 */
export const VOID_BLEND: Partial<CycleBlend> = Object.freeze({ climb: 0.5 });

/**
 * Every character's Void skin, with its own sheets in public/climb/
 * (`<id>-void-poses-192.png` and `-climb-192.png`) and its sheet options.
 * Skull tops exclude crests, ears and horns; calibrated from the approved
 * normalized idle cells. The Wraith's colour skins are tints, not listed here.
 */
export const VOID_SKIN_SHEETS: Readonly<Record<string, SheetOptions>> = {
  "kestrel-void": { headTop: 52, cycleBlend: VOID_BLEND },
  "lynx-void": { headTop: 46, cycleBlend: VOID_BLEND },
  "raven-void": { headTop: 50, cycleBlend: VOID_BLEND },
  "panther-void": { headTop: 39, cycleBlend: VOID_BLEND },
  "wolf-void": { headTop: 54, cycleBlend: VOID_BLEND },
  "otter-void": { headTop: 43, cycleBlend: VOID_BLEND },
  "heron-void": { headTop: 52, cycleBlend: VOID_BLEND },
  "yak-void": { headTop: 49, cycleBlend: VOID_BLEND },
  "mantis-void": { headTop: 55, cycleBlend: VOID_BLEND },
  "cobra-void": { headTop: 27, cycleBlend: VOID_BLEND },
  "badger-void": { headTop: 30, cycleBlend: VOID_BLEND },
  "falcon-void": { headTop: 49, cycleBlend: VOID_BLEND },
  "marmot-void": { headTop: 48, cycleBlend: VOID_BLEND },
  "bison-void": { headTop: 48, cycleBlend: VOID_BLEND },
  "ibex-void": { headTop: 55, cycleBlend: VOID_BLEND },
  "sentinel-void": { headTop: 48, cycleBlend: VOID_BLEND },
  "viking-void": { headTop: 35, cycleBlend: VOID_BLEND },
  "gecko-void": { headTop: 27, cycleBlend: VOID_BLEND },
};

/** The near-black a tinted skin leans its body greys toward. */
const VOID_BODY = "#0e0e12";
/** A skin with neither its own colour nor a palette entry: the Void Walker's purple. */
const FALLBACK_SKIN_ACCENT = "#9b5cff";

/**
 * A skin's registry entry: its own sheets when VOID_SKIN_SHEETS lists it,
 * else a tinted Wraith. The Wraith's colour skins tint to their catalogue
 * colour; a Void skin without sheets would tint to its palette accent.
 */
function voidSkin(skin: AvatarEntry, characterId: string): ClimberCharacter {
  const art = Object.prototype.hasOwnProperty.call(VOID_SKIN_SHEETS, skin.id) ? VOID_SKIN_SHEETS[skin.id] : null;
  if (art !== null) return sheets(skin.id, art);
  const palette = Object.prototype.hasOwnProperty.call(RECOLOR_PALETTE, characterId) ? RECOLOR_PALETTE[characterId] : null;
  return tint(skin.skinColor ?? palette?.accent ?? FALLBACK_SKIN_ACCENT, VOID_BODY);
}

/**
 * One entry per avatar id. A test pins that the keys match the avatar
 * catalogue exactly and that every `base()` avatar resolves to the Wraith.
 * Null, unknown and retired ids draw as the Green Stick (DEFAULT_STICK_ID).
 */
export const CLIMBER_CHARACTERS: Readonly<Record<string, ClimberCharacter>> = {
  wraith: WRAITH,
  gecko: sheets("gecko", { headTop: 36 }),
  "stick-green": stickFor("stick-green"),
  "stick-ember": stickFor("stick-ember"),
  "stick-amber": stickFor("stick-amber"),
  "stick-sky": stickFor("stick-sky"),
  "stick-violet": stickFor("stick-violet"),
  "stick-pink": stickFor("stick-pink"),
  kestrel: sheets("kestrel", { headTop: 28 }),
  lynx: sheets("lynx", { headTop: 45 }),
  raven: sheets("raven", { headTop: 50 }),
  panther: sheets("panther", { headTop: 45 }),
  wolf: sheets("wolf", { headTop: 42 }),
  otter: sheets("otter", { headTop: 38 }),
  heron: sheets("heron", { headTop: 50 }),
  yak: sheets("yak", { headTop: 33 }),
  mantis: sheets("mantis", { headTop: 27 }),
  cobra: sheets("cobra", { headTop: 38 }),
  badger: sheets("badger", { headTop: 30 }),
  falcon: sheets("falcon", { headTop: 33 }),
  marmot: sheets("marmot", { headTop: 33 }),
  bison: sheets("bison", { headTop: 40 }),
  ibex: sheets("ibex", { headTop: 38 }),
  sentinel: sheets("sentinel", { headTop: 40 }),
  viking: sheets("viking", { headTop: 32 }),
  ...Object.fromEntries(
    AVATARS.flatMap((a) => (a.skinOf === undefined ? [] : [[a.id, voidSkin(a, a.skinOf)] as const]))
  ),
};

const HEX = /^#([0-9a-f]{6})$/i;

/** [r, g, b] 0–255 for "#rrggbb"; null for anything else (never a default). */
export function parseHexColor(v: string): [number, number, number] | null {
  const m = HEX.exec(v);
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
