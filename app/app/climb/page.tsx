/**
 * Endless leaderboard — /climb
 *
 * The ONE global free skill leaderboard. Not tied to any paid category stack.
 */

import type { Metadata } from "next";
import { FreeStackShell } from "../../src/components/FreeStackShell";
import { ClimbBoard } from "../../src/components/Climb/ClimbBoard";
import { ClimbAbout, ClimbPanelIntro } from "../../src/components/Climb/ClimbPanelIntro";
import { GameNotes } from "../../src/components/Game/GameNotes";
import { topFreeClimbers } from "../../src/db/climb";
import { buildMetadata } from "../../src/lib/seo";

export const metadata: Metadata = buildMetadata({
  title: "Endless Leaderboard — Doomstack",
  description:
    "The Endless leaderboard. Climb a fresh tower for free and for bragging rights — your best peak height is your rank.",
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
    <FreeStackShell
      section="leaderboard"
      title="Global leaderboard"
      tools={
        <GameNotes stack="Endless" aboutTitle="About Endless">
          <ClimbAbout />
        </GameNotes>
      }
    >
      {/* H1 drops "Endless": the navbar breadcrumb and the eyebrow already
          carry it, so repeating it a third time in the top ~100px was
          redundant. The <title> metadata keeps the full "Endless Leaderboard"
          phrase for search. */}
      <ClimbPanelIntro title="Global leaderboard" />
      <ClimbBoard climbers={climbers ?? []} unavailable={climbers === null} />
    </FreeStackShell>
  );
}
