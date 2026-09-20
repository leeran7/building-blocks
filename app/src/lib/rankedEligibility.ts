/**
 * Ranked (paid-duel) eligibility for a single request — kill switch + geo
 * allow-list folded into one answer.
 *
 * This is the SINGLE source of the "may this visitor see ranked/chip features"
 * decision. The edge probe route (`GET /api/geo/ranked`) and the `/duel` and
 * `/duel/chips` server components both call it, so the first server-rendered
 * paint already carries the true decision — there is no optimistic
 * "available" default for the client to correct afterwards.
 *
 * Deliberately takes a `GeoHeaderSource` rather than a `Request`: a route
 * handler passes `request.headers`, a server component passes the object from
 * `next/headers` `headers()`. Both satisfy the same `get(name)` contract.
 *
 * Edge-runtime safe: no Node-only APIs and no `next/*` imports, because
 * `/api/geo/ranked` runs with `runtime = "edge"`.
 *
 * Fail-closed: the kill switch is checked first and the geo decision below it
 * already denies on a missing region header when enforcement is on. There is
 * no parameter to bypass either — a caller cannot pass in its own "enabled".
 */

import { decidePaidDuelGeo, type GeoHeaderSource } from "./paidDuelGeo";
import { PAID_DUELS_ENABLED } from "../config/paidDuel";

/** Why ranked features are unavailable. `null` when they are available. */
export type RankedIneligibleReason = "disabled" | "not_allowlisted" | "missing_geo";

export interface RankedEligibility {
  allowed: boolean;
  reason: RankedIneligibleReason | null;
}

/**
 * Resolve ranked eligibility from request headers. The shape is also the JSON
 * body of `GET /api/geo/ranked`, so the client revalidation path and the
 * server render agree by construction.
 */
export function resolveRankedEligibility(headers: GeoHeaderSource): RankedEligibility {
  // Master kill switch — paid surfaces ship dark. Checked before geo so a
  // disabled deployment never depends on a geo header being present.
  if (!PAID_DUELS_ENABLED) {
    return { allowed: false, reason: "disabled" };
  }

  const geo = decidePaidDuelGeo(headers);
  return { allowed: geo.allowed, reason: geo.reason ?? null };
}
