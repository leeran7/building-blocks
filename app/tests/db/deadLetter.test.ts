/**
 * Payment dead-letter persistence.
 *
 * F-4's 200-ack is necessary so Stripe stops retrying a deterministic miss,
 * but a console.error is not a queue. recordDeadLetter writes a row the
 * webhook acknowledges after.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { recordDeadLetter } from "../../src/db/payments";
import { store, resetStore } from "./fakePrisma";

vi.mock("../../src/db/client", async () => {
  const { fakePrisma } = await import("./fakePrisma");
  return { prisma: fakePrisma };
});

describe("recordDeadLetter", () => {
  beforeEach(() => {
    resetStore();
  });

  it("persists the session, amount, and reason so the payment can be replayed", async () => {
    await recordDeadLetter({
      eventType: "checkout.session.completed",
      stripeSessionId: "cs_dead_1",
      amountCents: 1200,
      reason: "missing block_id",
    });

    expect(store.deadLetters).toEqual([
      {
        stripe_session_id: "cs_dead_1",
        event_type: "checkout.session.completed",
        amount_cents: 1200,
        reason: "missing block_id",
      },
    ]);
  });
});
