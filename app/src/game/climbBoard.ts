/**
 * Free-climb leaderboard boards.
 *
 * Mobile (coarse pointer, full-bleed canvas) and desktop (keyboard, locked
 * 9:16) are not the same game: a taller fill-stage sees further up the tower.
 * Scores are ranked on separate boards. Mobile is the default **view**
 * (`/climb` with no query) and default **omit-POST write**. Historical
 * untagged rows cut over to desktop — the insert default is not history
 * policy.
 */

export const CLIMB_BOARD_ORDER = ["mobile", "desktop"] as const;

export type ClimbBoard = (typeof CLIMB_BOARD_ORDER)[number];

export const DEFAULT_CLIMB_BOARD: ClimbBoard = "mobile";

export const CLIMB_BOARD_LABELS: Record<ClimbBoard, string> = {
  mobile: "Mobile",
  desktop: "Desktop",
};

export const CLIMB_BOARD_BLURB: Record<ClimbBoard, string> = {
  mobile: "Touch · full-bleed stage",
  desktop: "Keyboard · 9:16 stage",
};

const CLIMB_BOARDS: Record<ClimbBoard, true> = {
  mobile: true,
  desktop: true,
};

/**
 * Allow-list parser. Unknown / non-string values return null — callers on a
 * write path must 400, not coerce. Omitted fields are the caller's problem
 * (product default is mobile).
 */
export function parseClimbBoard(raw: unknown): ClimbBoard | null {
  if (typeof raw !== "string") return null;
  if (!Object.hasOwn(CLIMB_BOARDS, raw)) return null;
  return raw as ClimbBoard;
}

/** `/climb` for mobile so the default board has a clean URL. */
export function climbBoardPath(board: ClimbBoard): string {
  return board === DEFAULT_CLIMB_BOARD ? "/climb" : `/climb?board=${board}`;
}

/** Map the play surface (coarse pointer = touch fill-stage) onto a board. */
export function climbBoardFromPointer(coarsePointer: boolean): ClimbBoard {
  return coarsePointer ? "mobile" : "desktop";
}
