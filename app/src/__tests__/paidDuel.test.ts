/**
 * Paid features — geoblocking unit tests.
 *
 * The geo allow-list (default-deny) is the primary safety gate for all paid
 * surfaces (tournaments, chip duels). Covers enforcement-on and enforcement-off
 * (dev) modes.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { assertPaidDuelAllowed, ALLOWED_US_REGIONS, ALLOWED_COUNTRIES } from "../lib/paidDuelGeo";

// ── Geoblocking ──────────────────────────────────────────────────────────────

function req(headers: Record<string, string>): Request {
  return new Request("https://example.com/api/duel/paid", { headers });
}

describe("assertPaidDuelAllowed — enforcement on, default-deny allow-list", () => {
  let prev: string | undefined;
  beforeEach(() => {
    prev = process.env.PAID_DUEL_GEO_ENFORCE;
    process.env.PAID_DUEL_GEO_ENFORCE = "true";
  });
  afterEach(() => {
    if (prev === undefined) delete process.env.PAID_DUEL_GEO_ENFORCE;
    else process.env.PAID_DUEL_GEO_ENFORCE = prev;
  });

  it("denies US states that are not on the allow-list (NY, FL, AZ, NV, WA)", () => {
    for (const region of ["NY", "FL", "AZ", "NV", "WA"]) {
      const d = assertPaidDuelAllowed(
        req({ "x-vercel-ip-country": "US", "x-vercel-ip-country-region": region })
      );
      expect(d.allowed).toBe(false);
      expect(d.reason).toBe("not_allowlisted");
    }
  });

  it("allows cleared US states (CA, TX, OH, VA, WI)", () => {
    for (const region of ["CA", "TX", "OH", "VA", "WI"]) {
      const d = assertPaidDuelAllowed(
        req({ "x-vercel-ip-country": "US", "x-vercel-ip-country-region": region })
      );
      expect(d.allowed).toBe(true);
    }
  });

  it("denies US traffic with no region (fail-closed)", () => {
    const d = assertPaidDuelAllowed(req({ "x-vercel-ip-country": "US" }));
    expect(d.allowed).toBe(false);
    expect(d.reason).toBe("not_allowlisted");
  });

  it("fails closed when the country header is missing", () => {
    const d = assertPaidDuelAllowed(req({}));
    expect(d.allowed).toBe(false);
    expect(d.reason).toBe("missing_geo");
  });

  it("denies non-US traffic by default — the country allow-list also starts empty", () => {
    const d = assertPaidDuelAllowed(req({ "x-vercel-ip-country": "GB" }));
    expect(d.allowed).toBe(false);
    expect(d.reason).toBe("not_allowlisted");
  });

  it("allows a denied state once it's explicitly added to the allow-list, and does not allow other denied states", () => {
    ALLOWED_US_REGIONS.add("NY");
    try {
      const cleared = assertPaidDuelAllowed(
        req({ "x-vercel-ip-country": "US", "x-vercel-ip-country-region": "NY" })
      );
      expect(cleared.allowed).toBe(true);

      // AZ is not on the allow-list and was not added above
      const stillDenied = assertPaidDuelAllowed(
        req({ "x-vercel-ip-country": "US", "x-vercel-ip-country-region": "AZ" })
      );
      expect(stillDenied.allowed).toBe(false);
    } finally {
      ALLOWED_US_REGIONS.delete("NY");
    }
  });

  it("allows a country once it's explicitly added to the allow-list, and only that one", () => {
    ALLOWED_COUNTRIES.add("GB");
    try {
      const cleared = assertPaidDuelAllowed(req({ "x-vercel-ip-country": "GB" }));
      expect(cleared.allowed).toBe(true);

      const stillDenied = assertPaidDuelAllowed(req({ "x-vercel-ip-country": "FR" }));
      expect(stillDenied.allowed).toBe(false);
    } finally {
      ALLOWED_COUNTRIES.delete("GB");
    }
  });
});

describe("assertPaidDuelAllowed — enforcement off (dev)", () => {
  let prev: string | undefined;
  beforeEach(() => {
    prev = process.env.PAID_DUEL_GEO_ENFORCE;
    process.env.PAID_DUEL_GEO_ENFORCE = "false";
  });
  afterEach(() => {
    if (prev === undefined) delete process.env.PAID_DUEL_GEO_ENFORCE;
    else process.env.PAID_DUEL_GEO_ENFORCE = prev;
  });

  it("allows even an uncleared region when enforcement is off", () => {
    const d = assertPaidDuelAllowed(
      req({ "x-vercel-ip-country": "US", "x-vercel-ip-country-region": "AZ" })
    );
    expect(d.allowed).toBe(true);
  });
});
