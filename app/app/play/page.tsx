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
    <FreeStackShell section="play" title="Play the climb">
      {/* Controls live in the lobby overlay. A card below the canvas would
          sit in a scroll region the fill panel no longer has — leftover
          height is the canvas budget. */}
      <ClimbScene tower={tower} categoryLabel="Free climb" />
    </FreeStackShell>
  );
}
