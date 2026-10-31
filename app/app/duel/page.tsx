import type { Metadata } from "next";
import { headers } from "next/headers";
import { DuelHome } from "../../src/components/Duel/DuelHome";
import { resolveRankedEligibility } from "../../src/lib/rankedEligibility";
import { buildMetadata } from "../../src/lib/seo";

export const metadata: Metadata = buildMetadata({
  title: "1v1 Duels — Doomstack",
  description:
    "Challenge a friend or find a random opponent for a head-to-head climb.",
  path: "/duel",
});

/**
 * Never prerender or cache this page. The region decision below is derived
 * from per-request geo headers; a cached "allowed" render served into a
 * blocked jurisdiction would be a compliance regression. `headers()` already
 * opts the route out of static rendering — this makes it explicit and
 * immune to a future refactor that drops the `headers()` call.
 */
export const dynamic = "force-dynamic";

export default async function DuelPage() {
  // Server-authoritative: resolved at request time so the ranked/chip cards
  // paint with the true decision instead of flashing available → blocked.
  const { allowed } = resolveRankedEligibility(await headers());

  // No <Suspense> here: a fresh boundary with no fallback painted the page
  // blank while DuelHome's code loaded on a client navigation. Without it the
  // navigation keeps the previous page up until /duel is ready, then
  // crossfades. (useSearchParams needs no boundary on a dynamic route.)
  return <DuelHome initialGeoAllowed={allowed} />;
}
