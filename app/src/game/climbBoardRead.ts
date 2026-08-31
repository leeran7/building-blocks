/**
 * Per-board standings read: a failed query is not an empty list.
 *
 * Landing teasers and /climb empty-state occupancy share this shape so a
 * swallowed `.catch(() => [])` cannot masquerade as "no climbers yet".
 */

import type { ClimbBoard } from "./climbBoard";

export type ClimbBoardRead<T> =
  | { status: "ok"; climbers: T[] }
  | { status: "unavailable" };

export function settledBoardRead<T>(
  result: PromiseSettledResult<T[]>
): ClimbBoardRead<T> {
  if (result.status === "fulfilled") {
    return { status: "ok", climbers: result.value };
  }
  return { status: "unavailable" };
}

export function prepareFreeLeaderboardBoards<T>(
  mobile: PromiseSettledResult<T[]>,
  desktop: PromiseSettledResult<T[]>
): { mobile: ClimbBoardRead<T>; desktop: ClimbBoardRead<T> } {
  return {
    mobile: settledBoardRead(mobile),
    desktop: settledBoardRead(desktop),
  };
}

export function climbLeaderboardFromRead<T>(
  read: ClimbBoardRead<T>,
  board: ClimbBoard
): { climbers: T[]; unavailable: boolean; board: ClimbBoard } {
  if (read.status === "unavailable") {
    return { climbers: [], unavailable: true, board };
  }
  return { climbers: read.climbers, unavailable: false, board };
}

/**
 * Desktop occupancy for AC-17. `null` means the Desktop read/probe failed —
 * fail open toward showing the control after cutover (empty Mobile can look
 * like a wipe).
 */
export function desktopOccupancy<T>(desktop: ClimbBoardRead<T>): boolean | null {
  if (desktop.status === "unavailable") return null;
  return desktop.climbers.length > 0;
}

/**
 * Empty Mobile (successful empty, not unavailable) offers a Desktop control
 * when Desktop has ≥1 climber, or when Desktop occupancy is unknown.
 * Both boards successfully empty → no control.
 */
export function shouldOfferDesktopControl<T>(args: {
  viewing: ClimbBoard;
  mobile: ClimbBoardRead<T>;
  desktopOccupied: boolean | null;
}): boolean {
  if (args.viewing !== "mobile") return false;
  if (args.mobile.status !== "ok") return false;
  if (args.mobile.climbers.length > 0) return false;
  if (args.desktopOccupied === null) return true;
  return args.desktopOccupied;
}
