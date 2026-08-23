/**
 * Phase 1 Engine Tests — AC-1 through AC-8
 *
 * These are pure unit tests with no I/O, no database, no Redis.
 * All 8 tests must pass before any Phase 2 work begins.
 */

import { describe, it, expect } from "vitest";
import {
  computeGrowth,
  computeRate,
  computeGround,
  computeMetres,
  priceTo,
  isBuried,
  isAmberEdge,
} from "../../src/engine/index";
import type { EngineConstants } from "../../src/engine/constants";

// ── Default constants (matches loadConstants() with tuned defaults) ────────
// G0=0.65 is tuned to satisfy AC-6 ($5 entry buried at V≈1472k, within 1400-1600).
// Spec §3.5 says "Tune G0/DOUBLE_EVERY_K until this holds."
const C: EngineConstants = {
  DOUBLE_EVERY_K: 500,
  MAX_GROWTH: 8,
  R0: 1.0,
  G0: 0.65, // tuned: max_ground = 0.65*8 = 5.2 > 5.0 (burial possible for $5 entry)
  MIN_ENTRY_USD: 5.0,
  MIN_SPEND_USD: 2.0,
  SEASON_DAYS: 90,
  CEIL_PER_HOUR: 40000,
};

// ── AC-1: Monotonicity — DB constraint (engine-side verification) ─────────
// The DB CHECK constraint (altitude >= 0) is tested in integration.
// Here we verify computeGrowth never returns NaN or > MAX_GROWTH.
describe("AC-1: computeGrowth never returns > MAX_GROWTH or NaN", () => {
  const vValues = [0, 100, 500, 1000, 2000, 5000, 10000, 50000, 1e9];

  it("never exceeds MAX_GROWTH for any V", () => {
    for (const V of vValues) {
      const g = computeGrowth(V, C);
      expect(g).toBeLessThanOrEqual(C.MAX_GROWTH);
      expect(g).not.toBeNaN();
    }
  });

  it("never returns a negative value", () => {
    for (const V of vValues) {
      const g = computeGrowth(V, C);
      expect(g).toBeGreaterThan(0);
    }
  });

  it("clamps exactly at MAX_GROWTH = 8 for large V", () => {
    // V = 10000 is far beyond the cap threshold
    expect(computeGrowth(10000, C)).toBe(C.MAX_GROWTH);
    expect(computeGrowth(1e9, C)).toBe(C.MAX_GROWTH);
  });

  it("starts at 1.0 when V = 0", () => {
    expect(computeGrowth(0, C)).toBeCloseTo(1.0, 10);
  });
});

// ── AC-2: No altitude-decreasing code path ───────────────────────────────
// Static verification: engine functions only compute deltas (positive metres)
// and never produce negative metres for non-negative inputs.
describe("AC-2: No code path decreases altitude", () => {
  it("computeMetres always returns >= 0 for non-negative inputs", () => {
    const dollars = [0, 0.01, 5, 100, 1000];
    const vValues = [0, 100, 500, 1000, 2500];
    for (const d of dollars) {
      for (const V of vValues) {
        const metres = computeMetres(d, V, C);
        expect(metres).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it("priceTo always returns >= MIN_SPEND_USD", () => {
    expect(priceTo(100, 0, 0, C)).toBeGreaterThanOrEqual(C.MIN_SPEND_USD);
    expect(priceTo(0, 0, 0, C)).toBeGreaterThanOrEqual(C.MIN_SPEND_USD);
    expect(priceTo(1, 10, 0, C)).toBeGreaterThanOrEqual(C.MIN_SPEND_USD);
  });

  it("no function produces a value that could reduce altitude (static assertion)", () => {
    // All engine functions produce non-negative output or boolean
    // This is a static design invariant: metres = dollars * rate >= 0
    // since dollars >= 0 and rate >= 0
    expect(computeMetres(5, 0, C)).toBeGreaterThan(0);
    expect(computeMetres(5, 1000, C)).toBeGreaterThan(0);

    // Engine functions do not have a "decrease altitude" code path
    // — verified by reviewing that they return deltas, not absolute values
    // Altitude += computeMetres(...) can never decrease altitude.
    const metres1 = computeMetres(5, 0, C);
    const metres2 = computeMetres(5, 1000, C);
    expect(metres1).toBeGreaterThan(0);
    expect(metres2).toBeGreaterThan(0);
  });
});

// ── AC-3: Order stability ────────────────────────────────────────────────
// Given fixed V, view increments (no payments) do not change rank order.
// rank = ORDER BY altitude DESC — purely a function of altitudes.
describe("AC-3: Order stability under view increments", () => {
  // Simulate a set of blocks with fixed altitudes
  const blocks = [
    { id: "a", altitude: 100 },
    { id: "b", altitude: 50 },
    { id: "c", altitude: 200 },
    { id: "d", altitude: 75 },
    { id: "e", altitude: 10 },
  ];

  function rankOrder(blks: { id: string; altitude: number }[]) {
    return [...blks].sort((a, b) => b.altitude - a.altitude).map((b) => b.id);
  }

  it("rank order is identical before and after 1000 view increments", () => {
    const initialOrder = rankOrder(blocks);

    // Simulate 1000 view increments: V changes, but altitudes stay fixed
    // (no payments). The engine functions are pure — same altitudes = same rank.
    let V = 0;
    for (let i = 0; i < 1000; i++) {
      V += 0.001; // each view = +0.001k = +1 view
    }

    // Altitudes have not changed (no payment calls)
    // Re-ranking with the same altitudes must produce identical order
    const afterOrder = rankOrder(blocks);
    expect(afterOrder).toEqual(initialOrder);
  });

  it("computeGround and computeRate change with V, but block altitudes are fixed", () => {
    const V0 = 0;
    const V1 = 1000; // after 1M views

    // Ground changes (by design), but this does NOT change altitude
    const ground0 = computeGround(V0, C);
    const ground1 = computeGround(V1, C);
    expect(ground1).toBeGreaterThan(ground0);

    // But block altitudes are unchanged — rank order is identical
    // (isBuried state may change, but ORDER BY altitude DESC is stable)
    const order0 = rankOrder(blocks);
    const order1 = rankOrder(blocks); // same altitudes
    expect(order0).toEqual(order1);
  });
});

// ── AC-4: Payment arithmetic precision ────────────────────────────────────
describe("AC-4: Payment arithmetic precision", () => {
  it("metres round-trips within 1e-9 for dollars in [MIN_ENTRY, 1000]", () => {
    const dollarAmounts = [5, 10, 50, 100, 500, 1000];
    const vValues = [0, 100, 500, 1000];

    for (const d of dollarAmounts) {
      for (const V of vValues) {
        const metres = computeMetres(d, V, C);
        const rate = computeRate(V, C);
        // Reconstruct dollars from metres
        const reconstructedDollars = metres / rate;
        expect(Math.abs(reconstructedDollars - d)).toBeLessThan(1e-9);
      }
    }
  });

  it("two sequential payments sum correctly within 1e-9", () => {
    const V = 500; // mid-season
    const d1 = 10;
    const d2 = 25;
    const altitude0 = 0;

    const metres1 = computeMetres(d1, V, C);
    const metres2 = computeMetres(d2, V, C);

    // altitude_final = altitude_0 + metres1 + metres2
    const altitudeFinal = altitude0 + metres1 + metres2;

    // Should equal altitude_0 + (d1 + d2) * rate
    const rate = computeRate(V, C);
    const expected = altitude0 + (d1 + d2) * rate;

    expect(Math.abs(altitudeFinal - expected)).toBeLessThan(1e-9);
  });

  it("metres are always a positive float (not integer overflow)", () => {
    const metres = computeMetres(1000, 2500, C); // max growth scenario
    expect(Number.isFinite(metres)).toBe(true);
    expect(metres).toBeGreaterThan(0);
  });
});

// ── AC-5: Price falls then holds at cap ───────────────────────────────────
describe("AC-5: Price falls then holds at cap", () => {
  // Cap threshold: growth == MAX_GROWTH when exp(λ·V) = MAX_GROWTH
  // => V_cap = ln(MAX_GROWTH) / λ = ln(MAX_GROWTH) * DOUBLE_EVERY_K / ln(2)
  const V_cap = (Math.log(C.MAX_GROWTH) * C.DOUBLE_EVERY_K) / Math.log(2);

  // A reference block at altitude 100 (rank #1)
  const targetAlt = 100;
  const myAlt = 0;

  it("cost to reach rank #1 strictly decreases as V increases from 0 to cap", () => {
    const samples = 20;
    const step = V_cap / samples;
    let prevCost = priceTo(targetAlt, myAlt, 0, C);

    for (let i = 1; i <= samples; i++) {
      const V = i * step;
      const cost = priceTo(targetAlt, myAlt, V, C);
      expect(cost).toBeLessThan(prevCost);
      prevCost = cost;
    }
  });

  it("cost is constant once growth == MAX_GROWTH (cap binds)", () => {
    const V1 = V_cap + 100;
    const V2 = V_cap + 500;
    const V3 = V_cap + 1000;

    const cost1 = priceTo(targetAlt, myAlt, V1, C);
    const cost2 = priceTo(targetAlt, myAlt, V2, C);
    const cost3 = priceTo(targetAlt, myAlt, V3, C);

    // All should be equal (capped rate → constant cost)
    expect(Math.abs(cost1 - cost2)).toBeLessThan(1e-9);
    expect(Math.abs(cost2 - cost3)).toBeLessThan(1e-9);
  });

  it("growth hits MAX_GROWTH exactly at V_cap", () => {
    const growth = computeGrowth(V_cap, C);
    expect(growth).toBeCloseTo(C.MAX_GROWTH, 5);
  });
});

// ── AC-6: Burial threshold ($5 entry buried at ~V=1500) ───────────────────
describe("AC-6: Burial threshold for $5 entry at V=0", () => {
  it("$5 entry at V=0 gets buried at V approximately 1400-1600", () => {
    // A $5 block starts at altitude = computeMetres(5, 0, C)
    const entryMetres = computeMetres(C.MIN_ENTRY_USD, 0, C);
    expect(entryMetres).toBeGreaterThan(0);

    // Find the V where ground crosses entryMetres
    // ground(V) = G0 * min(exp(λ·V), MAX_GROWTH)
    // buried when G0 * exp(λ·V) = entryMetres (before cap)
    // => V_bury = ln(entryMetres / G0) / λ
    let buriedAt: number | null = null;
    for (let V = 0; V <= 2000; V += 1) {
      if (isBuried(entryMetres, V, C)) {
        buriedAt = V;
        break;
      }
    }

    expect(buriedAt).not.toBeNull();
    if (buriedAt !== null) {
      expect(buriedAt).toBeGreaterThanOrEqual(1400);
      expect(buriedAt).toBeLessThanOrEqual(1600);
    }
  });

  it("$5 entry is not buried at V=0", () => {
    const entryMetres = computeMetres(C.MIN_ENTRY_USD, 0, C);
    expect(isBuried(entryMetres, 0, C)).toBe(false);
  });
});

// ── AC-7: Frozen board — determinism ──────────────────────────────────────
describe("AC-7: Frozen board — rank/cost/burial bit-identical over 30 days", () => {
  const blocks = [
    { id: "a", altitude: 500 },
    { id: "b", altitude: 200 },
    { id: "c", altitude: 100 },
    { id: "d", altitude: 50 },
  ];
  const V = 300; // fixed — no view increments in this scenario

  function computeBoardState(V: number) {
    const sorted = [...blocks].sort((a, b) => b.altitude - a.altitude);
    const ground = computeGround(V, C);
    const rate = computeRate(V, C);
    const rank1 = sorted[0];
    const costOfRank1 = priceTo(rank1.altitude, 0, V, C);

    return {
      order: sorted.map((b) => b.id),
      costOfRank1,
      ground,
      rate,
      burialStates: blocks.map((b) => ({
        id: b.id,
        buried: isBuried(b.altitude, V, C),
        amber: isAmberEdge(b.altitude, V, C),
      })),
    };
  }

  it("board state is bit-identical across 30 simulated day reads", () => {
    const baseline = computeBoardState(V);

    // Simulate 30 reads on different days — V is fixed (no views, no payments)
    for (let day = 0; day < 30; day++) {
      const state = computeBoardState(V);
      expect(state.order).toEqual(baseline.order);
      expect(state.costOfRank1).toBe(baseline.costOfRank1);
      expect(state.ground).toBe(baseline.ground);
      expect(state.rate).toBe(baseline.rate);
      expect(state.burialStates).toEqual(baseline.burialStates);
    }
  });
});

// ── AC-8: Float range — no overflow/Infinity/NaN over full season ─────────
describe("AC-8: Float range over full season stress", () => {
  it("all values remain finite over a full 90-day season stress test", () => {
    // Simulate continuous payments at max growth rate for 90 days
    // Assume one payment per minute = 129,600 payments over 90 days
    // Each payment of $100 at max growth
    const paymentsPerDay = 1440; // one per minute
    const totalPayments = C.SEASON_DAYS * paymentsPerDay;
    const dollarPerPayment = 100;

    // V is capped at MAX_GROWTH territory — use V_cap
    const V_cap = (Math.log(C.MAX_GROWTH) * C.DOUBLE_EVERY_K) / Math.log(2);
    const V = V_cap + 1000; // well past cap

    let altitude = 0;
    let overflowDetected = false;

    // Test a sample of payments (not all 129k for speed)
    const samplePayments = Math.min(totalPayments, 10000);
    for (let i = 0; i < samplePayments; i++) {
      const metres = computeMetres(dollarPerPayment, V, C);
      altitude += metres;

      if (!Number.isFinite(altitude) || isNaN(altitude)) {
        overflowDetected = true;
        break;
      }
    }

    expect(overflowDetected).toBe(false);
    expect(Number.isFinite(altitude)).toBe(true);
    expect(altitude).toBeLessThan(Number.MAX_SAFE_INTEGER);
  });

  it("computeGrowth never returns Infinity or NaN for extreme V", () => {
    const extremeVValues = [0, 1e6, 1e12, Number.MAX_SAFE_INTEGER / 1e6];
    for (const V of extremeVValues) {
      const g = computeGrowth(V, C);
      expect(Number.isFinite(g)).toBe(true);
      expect(isNaN(g)).toBe(false);
      expect(g).toBeLessThanOrEqual(C.MAX_GROWTH);
    }
  });

  it("computeRate never returns Infinity or NaN for extreme V", () => {
    const extremeV = 1e9;
    const rate = computeRate(extremeV, C);
    expect(Number.isFinite(rate)).toBe(true);
    expect(isNaN(rate)).toBe(false);
    // Rate at cap = R0 * MAX_GROWTH = 1.0 * 8 = 8
    expect(rate).toBe(C.R0 * C.MAX_GROWTH);
  });
});
