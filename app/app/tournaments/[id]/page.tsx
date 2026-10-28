import type { Metadata } from "next";
import { TournamentDetail } from "../../../src/components/Tournament/TournamentDetail";
import { TOURNAMENTS_COMING_SOON } from "../../../src/config/tournaments";
import { TournamentsComingSoon } from "../../../src/components/Tournament/TournamentsComingSoon";
import { buildMetadata } from "../../../src/lib/seo";

export const metadata: Metadata = buildMetadata({
  title: "Tournament — Doomstack",
  description: "Live tournament bracket.",
  path: "/tournaments",
});

export default async function TournamentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  if (TOURNAMENTS_COMING_SOON) return <TournamentsComingSoon />;
  const { id } = await params;
  return <TournamentDetail tournamentId={id} />;
}
