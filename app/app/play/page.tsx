/**
 * Free climb play page — /play
 *
 * The standalone free endless climb game. Scores feed the single /climb
 * leaderboard — not any paid category stack.
 */

import type { Metadata } from "next";
import { FreeStackShell } from "../../src/components/FreeStackShell";
import { ClimbPlayClient } from "../../src/components/Game/ClimbPlayClient";
import { getPlayPageMetadata } from "../../src/seo/playMetadata";

export function generateMetadata(): Metadata {
  return getPlayPageMetadata();
}

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
