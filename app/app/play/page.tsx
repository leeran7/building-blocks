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
    "Endless free climb — go as high as you can before the rising lava catches you. Your peak height ranks on the free leaderboard.",
};

export default function FreePlayPage() {
  const tower = buildFreeTower();

  return (
    <FreeStackShell
      section="play"
      title="Play the climb"
      meta={
        <div className="mt-3 space-y-4 max-w-lg">
          <p className="text-text-secondary text-sm">
            Endless climb — go as high as you can. Your peak height is your score on
            the{" "}
            <Link href="/climb" className="text-accent underline underline-offset-2">
              free leaderboard
            </Link>
            .
          </p>
          <ClimbControlsGuide />
        </div>
      }
    >
      <div className="flex justify-center">
        <ClimbScene tower={tower} categoryLabel="Free climb" />
      </div>
    </FreeStackShell>
  );
}
