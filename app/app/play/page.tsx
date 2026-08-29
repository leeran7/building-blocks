/**
 * Free climb play page — /play
 *
 * Full-phone play surface. Scores feed the single /climb leaderboard —
 * not any paid category stack.
 */

import type { Metadata, Viewport } from "next";
import Link from "next/link";
import { ClimbScene } from "../../src/components/Game/ClimbScene";
import { PlayViewport } from "../../src/components/Game/PlayViewport";
import { buildFreeTower } from "../../src/game/freeStack";

export const metadata: Metadata = {
  title: "Play the Free Climb — Stack",
  description:
    "Endless free climb — go as high as you can before the rising lava catches you. Your peak height ranks on the free leaderboard.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  themeColor: "#0a0a0c",
};

export default function FreePlayPage() {
  const tower = buildFreeTower();

  return (
    <PlayViewport>
      <h1 className="sr-only">Play the climb</h1>
      <ClimbScene
        tower={tower}
        categoryLabel="Free climb"
        leading={
          <Link
            href="/climb"
            className="inline-flex min-h-[32px] items-center rounded-full px-2.5 font-mono text-[10px] uppercase tracking-[0.12em] text-text-secondary hover:text-signal"
          >
            Ranks
          </Link>
        }
      />
    </PlayViewport>
  );
}
