"use client";

/**
 * Landing teaser: top climbers with a mobile/desktop switch. Mobile is the
 * default. Switching tabs does not reload the landing page.
 */

import { useState } from "react";
import Link from "next/link";
import { ClimbLeaderboard } from "../Climb/ClimbLeaderboard";
import { ClimbBoardTabs } from "../Climb/ClimbBoardTabs";
import { DesktopBoardControl } from "../Climb/DesktopBoardControl";
import type { ClimberRank } from "../../db/climb";
import {
  CLIMB_BOARD_BLURB,
  CLIMB_BOARD_LABELS,
  DEFAULT_CLIMB_BOARD,
  climbBoardPath,
  type ClimbBoard,
} from "../../game/climbBoard";
import {
  climbLeaderboardFromRead,
  desktopOccupancy,
  shouldOfferDesktopControl,
  type ClimbBoardRead,
} from "../../game/climbBoardRead";

export function FreeLeaderboardBoard({
  mobile,
  desktop,
}: {
  mobile: ClimbBoardRead<ClimberRank>;
  desktop: ClimbBoardRead<ClimberRank>;
}) {
  const [board, setBoard] = useState<ClimbBoard>(DEFAULT_CLIMB_BOARD);
  const selected = board === "mobile" ? mobile : desktop;
  const list = climbLeaderboardFromRead(selected, board);
  const offerDesktop = shouldOfferDesktopControl({
    viewing: board,
    mobile,
    desktopOccupied: desktopOccupancy(desktop),
  });

  return (
    <>
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 mb-6">
        <ClimbBoardTabs active={board} onSelect={setBoard} />
        <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-text-muted">
          {CLIMB_BOARD_BLURB[board]}
        </p>
      </div>

      <ClimbLeaderboard
        climbers={list.climbers}
        unavailable={list.unavailable}
        board={list.board}
        emptyAction={
          offerDesktop ? (
            <DesktopBoardControl onSelectDesktop={() => setBoard("desktop")} />
          ) : undefined
        }
      />

      <TeaserFooter unavailable={list.unavailable} count={list.climbers.length} board={board} />
    </>
  );
}

function TeaserFooter({
  unavailable,
  count,
  board,
}: {
  unavailable: boolean;
  count: number;
  board: ClimbBoard;
}) {
  if (unavailable) return null;
  if (count > 0) {
    return (
      <div className="mt-4 flex justify-end">
        <Link
          href={climbBoardPath(board)}
          className="font-mono text-xs uppercase tracking-[0.14em] text-text-muted hover:text-text-primary whitespace-nowrap transition"
        >
          Full {CLIMB_BOARD_LABELS[board].toLowerCase()} leaderboard →
        </Link>
      </div>
    );
  }
  return (
    <p className="text-sm text-text-muted mt-4">
      <Link href="/play" className="text-text-primary underline underline-offset-4 hover:text-signal">
        Play the free climb →
      </Link>
    </p>
  );
}
