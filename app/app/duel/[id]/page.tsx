import type { Metadata } from "next";
import { DuelRoomLoader } from "../../../src/components/Duel/DuelRoomLoader";
import { buildMetadata } from "../../../src/lib/seo";

export const metadata: Metadata = buildMetadata({
  title: "Duel Room — Doomstack",
  description: "Live 1v1 duel. Climb higher than your opponent before the ground rises.",
  path: "/duel",
});

export default async function DuelRoomPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <DuelRoomLoader duelId={id} />;
}
