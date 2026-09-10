/**
 * Geoblocking for Paid 1v1 Battles.
 *
 * Paid duels are a skill-based competition (not gambling), but a handful of US
 * states restrict even skill-money contests. We block those states from every
 * money-moving paid-duel endpoint (buy credits, create paid duel, join paid
 * duel). Region comes from Vercel's edge geo headers.
 *
 * Fail-closed in production: if the region header is missing when enforcement
 * is on, deny — better to block a legitimate player than to let a restricted
 * one through. Local/dev has no such header, so enforcement defaults off there
 * (PAID_DUEL_GEO_ENFORCE).
 */

/** US states where paid skill contests are restricted — blocked from paid duels. */
export const BLOCKED_US_REGIONS = new Set(["AZ", "IA", "LA", "MT", "WA"]);

export interface GeoDecision {
  allowed: boolean;
  country: string | null;
  region: string | null;
  /** Why it was blocked, for logging/telemetry. */
  reason?: "blocked_region" | "missing_geo";
}

function enforcementOn(): boolean {
  // Default ON in production, OFF elsewhere; overridable via env for testing.
  const raw = process.env.PAID_DUEL_GEO_ENFORCE;
  if (raw === "true") return true;
  if (raw === "false") return false;
  return process.env.NODE_ENV === "production";
}

/**
 * Decide whether a request may perform a paid-duel money action.
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

  // For US IPs, fail-closed if the region is missing (can't confirm it's allowed)
  // or if it's an explicitly blocked state.
  if (country === "US") {
    if (!region || BLOCKED_US_REGIONS.has(region.toUpperCase())) {
      return { allowed: false, country, region, reason: "blocked_region" };
    }
  }

  return { allowed: true, country, region };
}
