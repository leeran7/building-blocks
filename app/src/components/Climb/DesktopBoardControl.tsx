/**
 * Control that opens the Desktop skill board from an empty Mobile empty-state.
 * Accessible name includes "Desktop". Minimum 44×44. Signal fill — not
 * text-muted as the only affordance.
 */

import Link from "next/link";
import { climbBoardPath } from "../../game/climbBoard";

export const DESKTOP_BOARD_CONTROL_MIN_PX = 44;
export const DESKTOP_BOARD_CONTROL_LABEL = "View Desktop leaderboard";

const CONTROL_CLASS =
  "inline-flex items-center justify-center px-4 rounded-full bg-signal text-void font-semibold text-sm hover:brightness-110 focus-visible:ring-2 focus-visible:ring-signal focus-visible:ring-offset-2 focus-visible:ring-offset-void";

export function DesktopBoardControl({
  onSelectDesktop,
}: {
  /** Landing: stay on `/` and select the Desktop tab. Omit to link to Desktop /climb. */
  onSelectDesktop?: () => void;
}) {
  const style = {
    minHeight: DESKTOP_BOARD_CONTROL_MIN_PX,
    minWidth: DESKTOP_BOARD_CONTROL_MIN_PX,
  };
  if (onSelectDesktop) {
    return (
      <button
        type="button"
        className={CONTROL_CLASS}
        style={style}
        onClick={onSelectDesktop}
      >
        {DESKTOP_BOARD_CONTROL_LABEL}
      </button>
    );
  }
  return (
    <Link href={climbBoardPath("desktop")} className={CONTROL_CLASS} style={style}>
      {DESKTOP_BOARD_CONTROL_LABEL}
    </Link>
  );
}
