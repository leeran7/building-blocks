/**
 * Free climb leaderboard — /climb
 *
 * The ONE global free skill leaderboard. Not tied to any paid category stack.
 */

import type { Metadata } from "next";
import Link from "next/link";
import { FreeStackShell } from "../../src/components/FreeStackShell";
import { ClimbLeaderboard } from "../../src/components/Climb/ClimbLeaderboard";
import { ClimbControlsGuide } from "../../src/components/Game/ClimbControlsGuide";
import { topFreeClimbers } from "../../src/db/climb";

export const metadata: Metadata = {
  title: "Free Climb Leaderboard — Stack",
  description:
    "The free endless climb leaderboard. Play for practice and bragging rights — your best peak height is your rank.",
};

// Without this the page is a static route whose only data comes from an awaited
// DB read, so Next prerenders it at build time and never regenerates it: the
// leaderboard is frozen at whatever the build machine saw. Worse, the read is
// wrapped in a fallback, so a build with no database reachable bakes in an empty
// board and still exits 0 — which is exactly what `next build` does here.
// 30s matches how fast a new personal best should surface; the landing page uses
// 60s for the same reason.
export const revalidate = 30;

export default async function FreeClimbPage() {
  const climbers = await topFreeClimbers(50).catch((err) => {
    // Distinguished from an empty board below, so a failed read is never shown
    // as "no climbers yet".
    console.error("[/climb] leaderboard read failed:", err);
    return null;
  });

  return (
    <FreeStackShell
      section="leaderboard"
      title="Free climb leaderboard"
      meta={
        <div className="mt-3">
          <p className="text-text-secondary text-sm max-w-lg">
            One leaderboard for the free game. Climb the endless stack as high as
            you can before the lava catches you — your best height is your rank.
          </p>
          <div className="mt-4">
            <Link
              href="/play"
              className="inline-flex items-center justify-center rounded-lg bg-accent text-void font-semibold px-6 min-h-[44px] hover:brightness-110 transition"
            >
              Play the climb
            </Link>
          </div>
          <div className="mt-6">
            <ClimbControlsGuide variant="compact" />
          </div>
        </div>
      }
    >
      <ClimbLeaderboard climbers={climbers ?? []} unavailable={climbers === null} />
    </FreeStackShell>
  );
}
