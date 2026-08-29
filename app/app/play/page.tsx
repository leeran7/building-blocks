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
        <p className="text-text-secondary text-sm mt-3 max-w-lg">
          Arrow keys / WASD to move & climb, Space to jump. It gets harder the
          higher you go; your peak height is your score on the{" "}
          <Link href="/climb" className="text-accent underline underline-offset-2">
            free leaderboard
          </Link>
          .
        </p>
      }
    >
      <div className="flex justify-center">
        <ClimbScene tower={tower} categoryLabel="Free climb" />
      </div>
    </FreeStackShell>
  );
}
