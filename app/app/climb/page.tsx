/**
 * Free climb leaderboard — /climb
 *
 * Two boards (mobile default, desktop via ?board=desktop). Not tied to any
 * paid category stack. Touch and keyboard play do not share a ranking.
 */

import type { Metadata } from "next";
import { FreeStackShell } from "../../src/components/FreeStackShell";
import { ClimbLeaderboard } from "../../src/components/Climb/ClimbLeaderboard";
import { ClimbBoardTabs } from "../../src/components/Climb/ClimbBoardTabs";
import { ClimbPanelIntro } from "../../src/components/Climb/ClimbPanelIntro";
import { topFreeClimbers } from "../../src/db/climb";
import {
  CLIMB_BOARD_BLURB,
  CLIMB_BOARD_LABELS,
  DEFAULT_CLIMB_BOARD,
  parseClimbBoard,
  type ClimbBoard,
} from "../../src/game/climbBoard";

// Always render on request so a fresh run shows up immediately after save.
// ISR alone left standings stale for up to 30s (plus client router cache) even
// after POST /api/climb/result called revalidatePath — force-dynamic avoids that.
// The landing page stays ISR-cached and is invalidated on save via
// revalidateClimbLeaderboard().
export const dynamic = "force-dynamic";

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<{ board?: string }>;
}): Promise<Metadata> {
  const board = await boardFromSearchParams(searchParams);
  const label = CLIMB_BOARD_LABELS[board];
  return {
    title: `${label} Climb Leaderboard — Stack`,
    description: `The ${label.toLowerCase()} free endless climb leaderboard. Touch and keyboard are ranked separately. Mobile is the default.`,
  };
}

export default async function FreeClimbPage({
  searchParams,
}: {
  searchParams: Promise<{ board?: string }>;
}) {
  const board = await boardFromSearchParams(searchParams);
  const climbers = await topFreeClimbers(50, board).catch((err) => {
    // Distinguished from an empty board below, so a failed read is never shown
    // as "no climbers yet".
    console.error("[/climb] leaderboard read failed:", err);
    return null;
  });

  return (
    <FreeStackShell section="leaderboard" title={`${CLIMB_BOARD_LABELS[board]} climb leaderboard`}>
      <ClimbPanelIntro title="Free climb leaderboard" />
      <div className="mt-6">
        <ClimbBoardTabs active={board} />
        <p className="mt-3 font-mono text-[11px] uppercase tracking-[0.16em] text-text-muted">
          {CLIMB_BOARD_BLURB[board]}
        </p>
        <div className="mt-4">
          <ClimbLeaderboard
            climbers={climbers ?? []}
            unavailable={climbers === null}
            board={board}
          />
        </div>
      </div>
    </FreeStackShell>
  );
}

async function boardFromSearchParams(
  searchParams: Promise<{ board?: string }>
): Promise<ClimbBoard> {
  const sp = await searchParams;
  return parseClimbBoard(sp.board) ?? DEFAULT_CLIMB_BOARD;
}
