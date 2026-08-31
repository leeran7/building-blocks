/**
 * Generic /play metadata. Ignores `?r=` — unique cards live on `/r/{id}` only.
 * Must not import decodeRunReplay.
 */

import type { Metadata } from "next";

export function getPlayPageMetadata(): Metadata {
  return {
    title: "Play the Free Climb — Stack",
    description:
      "Endless climb — go as high as you can before the rising lava catches you. Your peak height ranks on the free leaderboard.",
  };
}
