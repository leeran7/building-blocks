/**
 * Free climb leaderboard — /climb
 *
 * The ONE global free skill leaderboard. Not tied to any paid category stack.
 */

import type { Metadata } from "next";
import { FreeStackShell } from "../../src/components/FreeStackShell";
import { ClimbLeaderboard } from "../../src/components/Climb/ClimbLeaderboard";
import { ClimbAbout, ClimbPanelIntro } from "../../src/components/Climb/ClimbPanelIntro";
import { topFreeClimbers } from "../../src/db/climb";
import { buildMetadata } from "../../src/lib/seo";

export const metadata: Metadata = buildMetadata({
  title: "Free Climb Leaderboard — Stack",
  description:
    "The free endless climb leaderboard. Play for practice and bragging rights — your best peak height is your rank.",
  path: "/climb",
});

// Always render on request so a fresh run shows up immediately after save.
// ISR alone left standings stale for up to 30s (plus client router cache) even
// after POST /api/climb/result called revalidatePath — force-dynamic avoids that.
// The landing page stays ISR-cached and is invalidated on save via
// revalidateClimbLeaderboard().
export const dynamic = "force-dynamic";

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
      <ClimbAbout />
    </FreeStackShell>
  );
}
