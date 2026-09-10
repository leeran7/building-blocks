import type { Metadata } from "next";
import { TournamentList } from "../../src/components/Tournament/TournamentList";
import { buildMetadata } from "../../src/lib/seo";

export const metadata: Metadata = buildMetadata({
  title: "Tournaments — The Climb",
  description: "Bracket-style 1v1 competitions with cash prizes.",
  path: "/tournaments",
});

export default function TournamentsPage() {
  return <TournamentList />;
}
