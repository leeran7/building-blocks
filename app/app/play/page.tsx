/**
 * Free climb play page — /play
 *
 * The standalone free endless climb game. Scores feed the single /climb
 * leaderboard — not any paid category stack.
 */

import type { Metadata } from "next";
import { FreeStackShell } from "../../src/components/FreeStackShell";
import { ClimbPlayClient } from "../../src/components/Game/ClimbPlayClient";

export const metadata: Metadata = {
  title: "Play the Free Climb — Stack",
  description:
    "Endless climb — go as high as you can before the rising lava catches you. Your peak height ranks on the free leaderboard.",
};

export default async function FreePlayPage({
  searchParams,
}: {
  searchParams: Promise<{ r?: string }>;
}) {
  const sp = await searchParams;
  const replayToken = typeof sp.r === "string" && sp.r.length > 0 ? sp.r : null;

  return (
    <FreeStackShell section="play" title="Play the climb">
      <ClimbPlayClient replayToken={replayToken} />
    </FreeStackShell>
  );
}
