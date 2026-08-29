/**
 * Free climb play page — /play
 *
 * The standalone free endless climb game. Scores feed the single /climb
 * leaderboard — not any paid category stack.
 */

import type { Metadata } from "next";
import Link from "next/link";
import { FreeStackShell } from "../../src/components/FreeStackShell";
import { ClimbScene } from "../../src/components/Game/ClimbScene";
import { ClimbControlsGuide } from "../../src/components/Game/ClimbControlsGuide";
import { buildFreeTower } from "../../src/game/freeStack";

export const metadata: Metadata = {
  title: "Play the Free Climb — Stack",
  description:
    "Endless climb — go as high as you can before the rising lava catches you. Your peak height ranks on the free leaderboard.",
};

export default function FreePlayPage() {
  const tower = buildFreeTower();

  return (
    <FreeStackShell section="play" title="Play the climb">
      {/* The guide sits below the game: above it, it pushed the canvas down and
          cost it the vertical space it sizes itself from. Header title/meta live
          in the tab band no longer, so this card is not competing with chrome. */}
      <div className="flex flex-col items-center gap-6">
        <ClimbScene tower={tower} categoryLabel="Free climb" />
        <div className="w-full max-w-lg">
          <p className="text-text-secondary text-sm mb-4 text-center">
            Endless climb — go as high as you can. Your peak height is your score
            on the{" "}
            <Link href="/climb" className="text-accent underline underline-offset-2">
              free leaderboard
            </Link>
            .
          </p>
          <ClimbControlsGuide />
        </div>
      </div>
    </FreeStackShell>
  );
}
