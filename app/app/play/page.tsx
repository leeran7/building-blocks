/**
 * Free climb play page — /play
 *
 * The standalone free endless climb game. Scores feed the single /climb
 * leaderboard — not any paid category stack.
 */

import type { Metadata } from "next";
import { FreeStackShell } from "../../src/components/FreeStackShell";
import { ClimbScene } from "../../src/components/Game/ClimbScene";
import { buildFreeTower } from "../../src/game/freeStack";

export const metadata: Metadata = {
  title: "Play the Free Climb — Stack",
  description:
    "Endless free climb — go as high as you can before the rising lava catches you. Your peak height ranks on the free leaderboard.",
};

export default function FreePlayPage() {
  const tower = buildFreeTower();

  return (
    <FreeStackShell section="play" title="Play the climb" compactHeader>
      {/* Controls live in the lobby overlay. A guide below the canvas would
          either push it off-screen or sit in a scroll region the game page
          no longer has — compactHeader locks the stage to the remaining
          viewport so the canvas can grow. */}
      <div className="h-full w-full flex flex-col items-center">
        <ClimbScene tower={tower} categoryLabel="Free climb" />
      </div>
    </FreeStackShell>
  );
}
