/**
 * Geoblocking for money-moving paid features (tournaments, chip purchases).
 *
 * Default-deny allow-list: a jurisdiction is permitted ONLY once it's been
 * explicitly cleared and added below. This intentionally inverts the old
 * block-list posture (which defaulted to allowing every US state except a
 * named few, and allowed every non-US country unconditionally) — pooled/
 * automatic matching and real-money payouts carry different legal exposure
 * than the original private-wager model this was first built for, and no
 * jurisdiction should be treated as safe without an actual legal
 * determination. See loop/learnings.jsonl for the review that prompted this.
 *
 * Starts EMPTY on purpose: nothing is cleared yet. Add a state/country only
 * once counsel has actually signed off on it for the current product
 * structure (tournaments and/or ranked chips) — do not populate this from an
 * unverified state-by-state list.
 *
 * Region comes from Vercel's edge geo headers.
 *
 * Fail-closed in production: if the region header is missing when enforcement
 * is on, deny — better to block a legitimate player than to let an
 * unconfirmed one through. Local/dev has no such header, so enforcement
 * defaults off there (PAID_DUEL_GEO_ENFORCE).
 */

/** US states explicitly cleared for money-moving paid features. Starts empty. */
export const ALLOWED_US_REGIONS = new Set<string>([]);

/** Countries explicitly cleared for money-moving paid features. Starts empty — non-US is denied by default, same as every US state. */
export const ALLOWED_COUNTRIES = new Set<string>([]);

export interface GeoDecision {
  allowed: boolean;
  country: string | null;
  region: string | null;
  /** Why it was denied, for logging/telemetry. */
  reason?: "not_allowlisted" | "missing_geo";
}

function enforcementOn(): boolean {
  // Default ON in production, OFF elsewhere; overridable via env for testing.
  const raw = process.env.PAID_DUEL_GEO_ENFORCE;
  if (raw === "true") return true;
  if (raw === "false") return false;
  return process.env.NODE_ENV === "production";
}

/**
 * Decide whether a request may perform a money-moving paid action.
 * Reads `x-vercel-ip-country` and `x-vercel-ip-country-region` (set by Vercel).
 */
export function assertPaidDuelAllowed(request: Request): GeoDecision {
  const country = request.headers.get("x-vercel-ip-country");
  const region = request.headers.get("x-vercel-ip-country-region");

  if (!enforcementOn()) {
    return { allowed: true, country, region };
  }

  // Fail-closed: no geo signal in a context where we must enforce.
  if (!country) {
    return { allowed: false, country, region, reason: "missing_geo" };
  }

  // US traffic: allowed only if the region is present AND explicitly cleared.
  if (country === "US") {
    if (!region || !ALLOWED_US_REGIONS.has(region.toUpperCase())) {
      return { allowed: false, country, region, reason: "not_allowlisted" };
    }
    return { allowed: true, country, region };
  }

  // Non-US: allowed only if the country is explicitly cleared. No more
  // unconditional pass-through — every jurisdiction is denied until added.
  if (!ALLOWED_COUNTRIES.has(country)) {
    return { allowed: false, country, region, reason: "not_allowlisted" };
  }

  return { allowed: true, country, region };
}
