/**
 * Paid 1v1 Battles — unit tests for the money-safety primitives.
 *
 * Covers the pure, deterministic pieces that don't need a database: the stake
 * bucket split (play-first), payout math, the stake allow-list, and geoblocking.
 *
 * NOT covered here: the transactional DB helpers (stakeInTx / joinPaidDuel /
 * createPaidRoom / settlePayoutInTx / claimRefundInTx) and the DB-level
 * one-open-paid-room-per-user constraint. This repo's src/db/* unit tests run
 * against a hand-built in-memory Prisma fake (tests/db/fakePrisma.ts), which
 * has no row-locking or unique-constraint semantics — extending it would test
 * the fake, not the actual concurrency guarantee. Real coverage for those
 * paths needs an integration test against a live Postgres (CI already
 * provisions one for `tower_test`; the test harness doesn't yet wire vitest to
 * it). Tracked as a follow-up, not silently assumed to exist.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { splitStake } from "../db/credits";
import { duelPayoutCents, DUEL_RAKE } from "../db/duel";
import { isValidStakeCents, STAKE_TIERS_CENTS } from "../config/paidDuel";
import { assertPaidDuelAllowed, BLOCKED_US_REGIONS } from "../lib/paidDuelGeo";

// ── Stake split (PLAY first, then WINNINGS) ────────────────────────────────

describe("splitStake — debit order & sufficiency", () => {
  it("spends play credits first, leaving winnings untouched when they cover it", () => {
    const r = splitStake(1000, 500, 300);
    expect(r).toEqual({ ok: true, playDebited: 300, winningsDebited: 0 });
  });

  it("spills into winnings only after play is exhausted", () => {
    const r = splitStake(200, 500, 300);
    expect(r).toEqual({ ok: true, playDebited: 200, winningsDebited: 100 });
  });

  it("uses winnings entirely when there are no play credits", () => {
    const r = splitStake(0, 500, 500);
    expect(r).toEqual({ ok: true, playDebited: 0, winningsDebited: 500 });
  });

  it("reports the shortfall when the combined balance is too low", () => {
    const r = splitStake(100, 50, 500);
    expect(r).toEqual({ ok: false, shortfallCents: 350 });
  });

  it("allows spending the exact combined balance", () => {
    const r = splitStake(100, 400, 500);
    expect(r).toEqual({ ok: true, playDebited: 100, winningsDebited: 400 });
  });

  it("never debits more than the stake across both buckets", () => {
    for (const stake of [100, 200, 500, 1000]) {
      const r = splitStake(700, 700, stake);
      if (r.ok) expect(r.playDebited + r.winningsDebited).toBe(stake);
    }
  });
});

// ── Payout math (pot = 2×stake, 10% rake) ──────────────────────────────────

describe("duelPayoutCents — rake & rounding", () => {
  it("pays 90% of the pot for each tier", () => {
    expect(duelPayoutCents(100)).toBe(180); // pot 200 → 180
    expect(duelPayoutCents(200)).toBe(360);
    expect(duelPayoutCents(500)).toBe(900);
    expect(duelPayoutCents(1000)).toBe(1800);
  });

  it("floors fractional cents (never over-pays)", () => {
    // pot = 2*333 = 666; 90% = 599.4 → floor 599
    expect(duelPayoutCents(333)).toBe(599);
  });

  it("keeps a positive rake for the platform on every tier", () => {
    for (const stake of STAKE_TIERS_CENTS) {
      const pot = stake * 2;
      const payout = duelPayoutCents(stake);
      expect(payout).toBeLessThan(pot);
      expect(pot - payout).toBe(Math.ceil(pot * DUEL_RAKE));
    }
  });
});

// ── Stake allow-list ───────────────────────────────────────────────────────

describe("isValidStakeCents — server-authoritative tiers", () => {
  it("accepts exactly the configured tiers", () => {
    expect(isValidStakeCents(100)).toBe(true);
    expect(isValidStakeCents(200)).toBe(true);
    expect(isValidStakeCents(500)).toBe(true);
    expect(isValidStakeCents(1000)).toBe(true);
  });

  it("rejects anything off the allow-list", () => {
    expect(isValidStakeCents(0)).toBe(false);
    expect(isValidStakeCents(150)).toBe(false);
    expect(isValidStakeCents(300)).toBe(false);
    expect(isValidStakeCents(999)).toBe(false);
    expect(isValidStakeCents(-100)).toBe(false);
  });
});

// ── Geoblocking ──────────────────────────────────────────────────────────────

function req(headers: Record<string, string>): Request {
  return new Request("https://example.com/api/duel/paid", { headers });
}

describe("assertPaidDuelAllowed — enforcement on", () => {
  let prev: string | undefined;
  beforeEach(() => {
    prev = process.env.PAID_DUEL_GEO_ENFORCE;
    process.env.PAID_DUEL_GEO_ENFORCE = "true";
  });
  afterEach(() => {
    if (prev === undefined) delete process.env.PAID_DUEL_GEO_ENFORCE;
    else process.env.PAID_DUEL_GEO_ENFORCE = prev;
  });

  it("blocks each restricted US state", () => {
    for (const region of BLOCKED_US_REGIONS) {
      const d = assertPaidDuelAllowed(
        req({ "x-vercel-ip-country": "US", "x-vercel-ip-country-region": region })
      );
      expect(d.allowed).toBe(false);
      expect(d.reason).toBe("blocked_region");
    }
  });

  it("allows a permitted US state", () => {
    const d = assertPaidDuelAllowed(
      req({ "x-vercel-ip-country": "US", "x-vercel-ip-country-region": "NY" })
    );
    expect(d.allowed).toBe(true);
  });

  it("blocks US traffic with no region (fail-closed)", () => {
    const d = assertPaidDuelAllowed(req({ "x-vercel-ip-country": "US" }));
    expect(d.allowed).toBe(false);
    expect(d.reason).toBe("blocked_region");
  });

  it("fails closed when the country header is missing", () => {
    const d = assertPaidDuelAllowed(req({}));
    expect(d.allowed).toBe(false);
    expect(d.reason).toBe("missing_geo");
  });

  it("allows non-US traffic at MVP", () => {
    const d = assertPaidDuelAllowed(req({ "x-vercel-ip-country": "GB" }));
    expect(d.allowed).toBe(true);
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

  it("allows even a restricted region when enforcement is off", () => {
    const d = assertPaidDuelAllowed(
      req({ "x-vercel-ip-country": "US", "x-vercel-ip-country-region": "AZ" })
    );
    expect(d.allowed).toBe(true);
  });
});
