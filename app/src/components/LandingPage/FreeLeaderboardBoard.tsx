"use client";

/**
 * Landing teaser: top climbers with a mobile/desktop switch. Mobile is the
 * default. Switching tabs does not reload the landing page.
 */

import { useState } from "react";
import Link from "next/link";
import { ClimbLeaderboard } from "../Climb/ClimbLeaderboard";
import { ClimbBoardTabs } from "../Climb/ClimbBoardTabs";
import type { ClimberRank } from "../../db/climb";
import {
  CLIMB_BOARD_BLURB,
  CLIMB_BOARD_LABELS,
  DEFAULT_CLIMB_BOARD,
  climbBoardPath,
  type ClimbBoard,
} from "../../game/climbBoard";

export function FreeLeaderboardBoard({
  mobile,
  desktop,
}: {
  mobile: ClimberRank[];
  desktop: ClimberRank[];
}) {
  const [board, setBoard] = useState<ClimbBoard>(DEFAULT_CLIMB_BOARD);
  const climbers = board === "mobile" ? mobile : desktop;

  return (
    <>
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 mb-6">
        <ClimbBoardTabs active={board} onSelect={setBoard} />
        <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-text-muted">
          {CLIMB_BOARD_BLURB[board]}
        </p>
      </div>

      <ClimbLeaderboard climbers={climbers} board={board} />

      {climbers.length > 0 ? (
        <div className="mt-4 flex justify-end">
          <Link
            href={climbBoardPath(board)}
            className="font-mono text-xs uppercase tracking-[0.14em] text-text-muted hover:text-text-primary whitespace-nowrap transition"
          >
            Full {CLIMB_BOARD_LABELS[board].toLowerCase()} leaderboard →
          </Link>
        </div>
      ) : (
        <p className="text-sm text-text-muted mt-4">
          <Link href="/play" className="text-text-primary underline underline-offset-4 hover:text-signal">
            Play the free climb →
          </Link>
        </p>
      )}
    </>
  );
}
