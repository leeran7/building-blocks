/**
 * applyPaymentTransaction — behavioural tests for ADR-7 (additive altitude).
 *
 * These replace a source-text assertion in tests/api/webhook.test.ts whose
 * negative lookahead, /altitude:\s*metresAdded(?!\s*\})/, exempted the exact
 * dangerous form it existed to forbid: `data: { altitude: metresAdded }` does
 * not match it, so the guard passed on the overwrite it was written to catch.
 *
 * The fake Prisma honours `{ increment }` and plain assignment separately, so
 * an overwrite shows up as wrong data instead of needing a regex to spot it.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { applyPaymentTransaction } from "../../src/db/payments";
import { store, resetStore } from "./fakePrisma";

// Hoisted above the imports by Vitest, so payments.ts binds to the fake.
vi.mock("../../src/db/client", async () => {
  const { fakePrisma } = await import("./fakePrisma");
  return { prisma: fakePrisma };
});

describe("applyPaymentTransaction — additive altitude (ADR-7)", () => {
  beforeEach(() => {
    resetStore();
  });

  it("adds metres to the existing altitude rather than replacing it", async () => {
    store.blocks["b1"] = { id: "b1", altitude: 10, spend_c: 500 };

    await applyPaymentTransaction("b1", "cs_1", 300, 5);

    // An overwrite (altitude: metresAdded) would leave this at 5.
    expect(store.blocks["b1"]!.altitude).toBe(15);
    expect(store.blocks["b1"]!.spend_c).toBe(800);
  });

  it("accumulates across successive payments to the same block", async () => {
    store.blocks["b1"] = { id: "b1", altitude: 10, spend_c: 0 };

    await applyPaymentTransaction("b1", "cs_1", 100, 5);
    await applyPaymentTransaction("b1", "cs_2", 200, 7);

    // Overwrite semantics would leave 7 here, not 22.
    expect(store.blocks["b1"]!.altitude).toBe(22);
    expect(store.blocks["b1"]!.spend_c).toBe(300);
  });

  it("never lowers a block's altitude, even for a zero-metre payment", async () => {
    store.blocks["b1"] = { id: "b1", altitude: 42, spend_c: 0 };

    await applyPaymentTransaction("b1", "cs_1", 200, 0);

    expect(store.blocks["b1"]!.altitude).toBe(42);
  });

  it("does not lose an increment when two payments interleave", async () => {
    store.blocks["b1"] = { id: "b1", altitude: 0, spend_c: 0 };

    await Promise.all([
      applyPaymentTransaction("b1", "cs_1", 100, 3),
      applyPaymentTransaction("b1", "cs_2", 100, 4),
    ]);

    expect(store.blocks["b1"]!.altitude).toBe(7);
  });

  it("uses Prisma increment rather than assignment for both money fields", async () => {
    store.blocks["b1"] = { id: "b1", altitude: 1, spend_c: 1 };

    await applyPaymentTransaction("b1", "cs_1", 250, 9);

    // A plain number on either field is the ADR-7 violation.
    expect(store.updateModes).toEqual([
      { field: "altitude", mode: "increment" },
      { field: "spend_c", mode: "increment" },
    ]);
  });

  it("records the payment row with the server-computed metres", async () => {
    store.blocks["b1"] = { id: "b1", altitude: 0, spend_c: 0 };

    const { payment } = await applyPaymentTransaction("b1", "cs_abc", 500, 12);

    expect(payment.stripe_session_id).toBe("cs_abc");
    expect(payment.amount_cents).toBe(500);
    expect(payment.metres_added).toBe(12);
    expect(store.payments).toHaveLength(1);
  });

  it("runs the block update and the payment insert inside one transaction", async () => {
    store.blocks["b1"] = { id: "b1", altitude: 0, spend_c: 0 };

    await applyPaymentTransaction("b1", "cs_1", 100, 2);

    expect(store.transactionDepth).toBe(1);
    expect(store.wroteOutsideTransaction).toBe(false);
  });
});
