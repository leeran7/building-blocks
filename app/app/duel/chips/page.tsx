import type { Metadata } from "next";
import { headers } from "next/headers";
import { buildMetadata } from "../../../src/lib/seo";
import { ChipDuelLobby } from "../../../src/components/Duel/ChipDuelLobby";
import { resolveRankedEligibility } from "../../../src/lib/rankedEligibility";

export const metadata: Metadata = buildMetadata({
  title: "Chip Duels — Doomstack",
  description:
    "Stake non-cashable chips in a ranked 1v1 duel. Zero-sum — winner takes all.",
  path: "/duel/chips",
});

/**
 * Never prerender or cache this page. The region decision below is derived
 * from per-request geo headers; a cached "allowed" render served into a
 * blocked jurisdiction would be a compliance regression. `headers()` already
 * opts the route out of static rendering — this makes it explicit and
 * immune to a future refactor that drops the `headers()` call.
 */
export const dynamic = "force-dynamic";

export default async function ChipDuelsPage() {
  // Server-authoritative: resolved at request time so the stake picker never
  // renders on an optimistic "available" assumption.
  const { allowed } = resolveRankedEligibility(await headers());

  return <ChipDuelLobby initialGeoAllowed={allowed} />;
}
