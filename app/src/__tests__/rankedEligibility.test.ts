/**
 * resolveRankedEligibility (kill switch + geo allow-list) and the
 * GeoHeaderSource contract of decidePaidDuelGeo.
 *
 * PAID_DUELS_ENABLED is a module-level const in src/config/paidDuel.ts, read
 * once at import time (deliberately not made an injectable parameter, so the
 * kill switch can't be bypassed by a caller). Covering the "disabled" branch
 * therefore needs vi.resetModules() + vi.stubEnv() + a fresh dynamic import of
 * src/lib/rankedEligibility per case. PAID_DUEL_GEO_ENFORCE is read at call
 * time inside decidePaidDuelGeo, so the geo branches need no module reset.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { decidePaidDuelGeo, type GeoHeaderSource } from "../lib/paidDuelGeo";

/** A minimal GeoHeaderSource — deliberately NOT a Request/Headers, to prove
 * decidePaidDuelGeo works against the structural contract that next/headers'
 * headers() satisfies, not just the Fetch API Headers class. */
function headersFrom(values: Record<string, string>): GeoHeaderSource {
  return {
    get(name: string) {
      const key = Object.keys(values).find((k) => k.toLowerCase() === name.toLowerCase());
      return key ? values[key] : null;
    },
  };
}

async function importResolveRankedEligibility(paidDuelsEnabled: "true" | "false") {
  vi.resetModules();
  vi.stubEnv("PAID_DUELS_ENABLED", paidDuelsEnabled);
  const mod = await import("../lib/rankedEligibility");
  return mod.resolveRankedEligibility;
}

describe("decidePaidDuelGeo — GeoHeaderSource contract (shared with next/headers())", () => {
  let prevEnforce: string | undefined;
  beforeEach(() => {
    prevEnforce = process.env.PAID_DUEL_GEO_ENFORCE;
    process.env.PAID_DUEL_GEO_ENFORCE = "true";
  });
  afterEach(() => {
    if (prevEnforce === undefined) delete process.env.PAID_DUEL_GEO_ENFORCE;
    else process.env.PAID_DUEL_GEO_ENFORCE = prevEnforce;
  });

  it("denies a US region not on the allow-list (NY) via a plain object, not a Request", () => {
    const decision = decidePaidDuelGeo(
      headersFrom({ "x-vercel-ip-country": "US", "x-vercel-ip-country-region": "NY" })
    );
    expect(decision.allowed).toBe(false);
    expect(decision.reason).toBe("not_allowlisted");
  });

  it("allows a US region on the allow-list (CA) via the same contract — positive fixture for the guard above", () => {
    const decision = decidePaidDuelGeo(
      headersFrom({ "x-vercel-ip-country": "US", "x-vercel-ip-country-region": "CA" })
    );
    expect(decision.allowed).toBe(true);
    expect(decision.reason).toBeUndefined();
  });

  it("fails closed when the country header is missing", () => {
    const decision = decidePaidDuelGeo(headersFrom({}));
    expect(decision.allowed).toBe(false);
    expect(decision.reason).toBe("missing_geo");
  });
});

describe("resolveRankedEligibility", () => {
  let prevEnforce: string | undefined;

  beforeEach(() => {
    prevEnforce = process.env.PAID_DUEL_GEO_ENFORCE;
    process.env.PAID_DUEL_GEO_ENFORCE = "true";
  });

  afterEach(() => {
    if (prevEnforce === undefined) delete process.env.PAID_DUEL_GEO_ENFORCE;
    else process.env.PAID_DUEL_GEO_ENFORCE = prevEnforce;
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("kill switch off -> disabled, before any geo header is even consulted", async () => {
    const resolveRankedEligibility = await importResolveRankedEligibility("false");
    // A region that WOULD be allowed if the kill switch were the only gate —
    // proves the kill switch short-circuits ahead of the geo decision.
    const result = resolveRankedEligibility(
      headersFrom({ "x-vercel-ip-country": "US", "x-vercel-ip-country-region": "CA" })
    );
    expect(result).toEqual({ allowed: false, reason: "disabled" });
  });

  it("kill switch on + missing country header -> missing_geo (fail-closed)", async () => {
    const resolveRankedEligibility = await importResolveRankedEligibility("true");
    const result = resolveRankedEligibility(headersFrom({}));
    expect(result).toEqual({ allowed: false, reason: "missing_geo" });
  });

  it("kill switch on + US region not on the allow-list (NY) -> not_allowlisted", async () => {
    const resolveRankedEligibility = await importResolveRankedEligibility("true");
    const result = resolveRankedEligibility(
      headersFrom({ "x-vercel-ip-country": "US", "x-vercel-ip-country-region": "NY" })
    );
    expect(result).toEqual({ allowed: false, reason: "not_allowlisted" });
  });

  it("kill switch on + US region on the allow-list (CA) -> allowed, reason null", async () => {
    const resolveRankedEligibility = await importResolveRankedEligibility("true");
    const result = resolveRankedEligibility(
      headersFrom({ "x-vercel-ip-country": "US", "x-vercel-ip-country-region": "CA" })
    );
    expect(result).toEqual({ allowed: true, reason: null });
  });
});
