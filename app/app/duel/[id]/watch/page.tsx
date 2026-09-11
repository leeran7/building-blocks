import type { Metadata } from "next";
import { DuelWatch } from "../../../../src/components/Duel/DuelWatch";
import { buildMetadata } from "../../../../src/lib/seo";

export const metadata: Metadata = buildMetadata({
  title: "Duel Replay — Doomstack",
  description: "Watch both climbers race the same tower in a 1v1 duel replay.",
  path: "/duel",
});

export default async function DuelWatchPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <DuelWatch duelId={id} />;
}
