import { EPISODE_SIZE, episodeOf } from "../../lib/levels/model";

/**
 * Where everything on the level map sits. The map is the tower: each level is
 * a slab floor, a vertical ladder joins each floor to the next, an episode
 * boundary is a full-width landing, and an altimeter rail runs up the left.
 *
 * Vertical values are px from the map's bottom edge; horizontal values are %
 * of the map's width, so the map holds its shape from 320 to 448 px wide.
 * Every function is closed-form in the level number: no per-level scans.
 */

/** Vertical distance between two floors, px. A multiple of TICK_PITCH. */
export const ROW = 96;
/** Height of a floor slab, px: the whole slab is the tap target (>= 44). */
export const SLAB_H = 48;
/** Clear height between a floor's top and the next floor's underside, px. */
export const LADDER_GAP = ROW - SLAB_H;
/** Height of an episode landing, px. */
export const LANDING_H = 32;
/**
 * Extra room at each episode boundary, px: the landing plus a second ladder
 * gap, so a ladder's height of air sits both under and over the landing.
 */
export const EPISODE_GAP = LANDING_H + LADDER_GAP;
/** Gap between a floor's underside and the row of stars hung under it, px. */
export const STAR_GAP_PX = 6;
/** Size of each star under a floor, px. */
export const STAR_PX = 14;
/** How far a floor's star row reaches below its underside, px. */
export const STAR_DROP_PX = STAR_GAP_PX + STAR_PX;
/**
 * Centre of floor 1 from the map's bottom, px. Its underside (144) and the
 * stars under it (down to 124: STAR_DROP_PX) stay above the Play bar fade's
 * solid stop (112), and its top (192) lands on the altimeter's tick lattice.
 */
export const BOTTOM_PAD = 168;
/**
 * Space above the last shown floor, px: room for the "more floors" fade and
 * label, or for the character on a fully cleared season's top floor. The
 * screen's header is kept clear separately (LevelMapScreen pads the scroll).
 */
export const TOP_PAD = 140;
/** The "you are here" figure's height, feet to the top of the head, CSS px. */
export const FIGURE_PX = 36;
/** The figure's square canvas, CSS px: it stands on the canvas's foot pad. */
export const FIGURE_CANVAS_PX = 56;
/** Altimeter minor tick spacing, px. Must match `.altimeter` in styles.css. */
export const TICK_PITCH = 16;

/** Left edge of the altimeter rail, %. */
export const RAIL_X = 3.5;
/** Length of a floor's (major) tick on the rail, %. Minor ticks are shorter. */
export const RAIL_TICK_W = 4.5;
/** Left limit for slabs and landings, %: everything left of it is the rail's. */
export const SLAB_MIN_X = 13;
/** Right limit for slabs and landings, %. */
export const SLAB_MAX_X = 97;
/** Width of a floor slab, %. */
export const SLAB_W = 38;
/** Width of a ladder, rail to rail, %. */
export const LADDER_W = 5;
/** Distance between two rungs, px. */
export const RUNG_PITCH = 12;

const LEFT_STOP = SLAB_MIN_X + SLAB_W / 2;
const RIGHT_STOP = SLAB_MAX_X - SLAB_W / 2;
const CENTRE_STOP = (LEFT_STOP + RIGHT_STOP) / 2;
/**
 * Slab centres, %, in climbing order: left, centre, right, centre. Neighbours
 * are always one stop apart, so their slabs overlap and a vertical ladder fits.
 */
const STOPS = [LEFT_STOP, CENTRE_STOP, RIGHT_STOP, CENTRE_STOP] as const;

/** Slab centre from the map's bottom edge, px. */
export function pinBottom(level: number): number {
  return BOTTOM_PAD + (level - 1) * ROW + (episodeOf(level) - 1) * EPISODE_GAP;
}

/** Slab centre across the map, % of its width. */
export function pinX(level: number): number {
  return STOPS[(level - 1) % STOPS.length];
}

/** The slab's left and right edges, % of the map's width. */
export function slabRange(level: number): { left: number; right: number } {
  const x = pinX(level);
  return { left: x - SLAB_W / 2, right: x + SLAB_W / 2 };
}

/** The slab's top surface (where a climber stands) from the map's bottom, px. */
export function slabTop(level: number): number {
  return pinBottom(level) + SLAB_H / 2;
}

/** The slab's underside from the map's bottom, px. */
export function slabUnderside(level: number): number {
  return pinBottom(level) - SLAB_H / 2;
}

/**
 * Centre of the ladder from `level` up to `level + 1`, %: the middle of the
 * stretch both slabs cover, so the ladder stands on one and reaches the other.
 */
export function ladderX(level: number): number {
  const below = slabRange(level);
  const above = slabRange(level + 1);
  return (Math.max(below.left, above.left) + Math.min(below.right, above.right)) / 2;
}

/** True when the floor above `level` starts a new episode (a landing sits between). */
export function isEpisodeTop(level: number): boolean {
  return level % EPISODE_SIZE === 0;
}

/** Centre of the landing under `episode`'s first floor, from the map's bottom, px (episode >= 2). */
export function landingBottom(episode: number): number {
  const first = (episode - 1) * EPISODE_SIZE + 1;
  return slabUnderside(first) - LADDER_GAP - LANDING_H / 2;
}

/**
 * The stretches the ladder from `level` to `level + 1` covers, as [from, to]
 * px from the map's bottom: one, or two where a landing interrupts it.
 */
export function ladderSpans(level: number): Array<[number, number]> {
  const from = slabTop(level);
  const to = slabUnderside(level + 1);
  if (!isEpisodeTop(level)) return [[from, to]];
  const landing = landingBottom(episodeOf(level + 1));
  return [
    [from, landing - LANDING_H / 2],
    [landing + LANDING_H / 2, to],
  ];
}

/** Height of a map whose highest shown floor is `topLevel`, px (0 for no floors). */
export function towerHeight(topLevel: number): number {
  return topLevel > 0 ? pinBottom(topLevel) + TOP_PAD : 0;
}
