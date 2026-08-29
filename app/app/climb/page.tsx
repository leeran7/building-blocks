/**
 * Free climb leaderboard — /climb
 *
 * The ONE global free skill leaderboard. Not tied to any paid category stack.
 */

import type { Metadata } from "next";
import { FreeStackShell } from "../../src/components/FreeStackShell";
import { ClimbLeaderboard } from "../../src/components/Climb/ClimbLeaderboard";
import { ClimbPanelIntro } from "../../src/components/Climb/ClimbPanelIntro";
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
    <FreeStackShell section="leaderboard" title="Free climb leaderboard">
      <ClimbPanelIntro title="Free climb leaderboard" />
      <div className="mt-6">
        <ClimbLeaderboard
          climbers={climbers ?? []}
          unavailable={climbers === null}
        />
      </div>
    </FreeStackShell>
  );
}
