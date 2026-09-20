import type { Metadata } from "next";
import { headers } from "next/headers";
import { TournamentList } from "../../src/components/Tournament/TournamentList";
import { resolveRankedEligibility } from "../../src/lib/rankedEligibility";
import { buildMetadata } from "../../src/lib/seo";

export const metadata: Metadata = buildMetadata({
  title: "Tournaments — Doomstack",
  description: "Bracket-style 1v1 competitions with cash prizes.",
  path: "/tournaments",
});

/**
 * Never prerender or cache this page. The region decision below is derived
 * from per-request geo headers; a cached "allowed" render served into a
 * blocked jurisdiction would be a compliance regression. `headers()` already
 * opts the route out of static rendering — this makes it explicit and
 * immune to a future refactor that drops the `headers()` call.
 */
export const dynamic = "force-dynamic";

export default async function TournamentsPage() {
  // Server-authoritative: resolved at request time so the entry-fee picker and
  // "Join queue" never render on an optimistic "available" assumption.
  const { allowed } = resolveRankedEligibility(await headers());

  return <TournamentList initialGeoAllowed={allowed} />;
}
