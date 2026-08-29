/**
 * Stripe credit-or-not decisions.
 *
 * These used to live only in the webhook route and were "tested" by grepping
 * source text. Deleting the payment_status gate would have left those greps
 * green. Invoke the classifier instead.
 */

import { describe, it, expect } from "vitest";
import { classifyStripeCredit } from "../../src/api/stripeCredit";

function session(
  overrides: {
    id?: string;
    payment_status?: string | null;
    block_id?: string;
    amount_total?: number;
  } = {}
) {
  return {
    id: overrides.id ?? "cs_test_1",
    amount_total: overrides.amount_total ?? 500,
    payment_status: overrides.payment_status ?? "paid",
    metadata:
      overrides.block_id === undefined
        ? { block_id: "b1" }
        : overrides.block_id
          ? { block_id: overrides.block_id }
          : null,
  };
}

describe("classifyStripeCredit: unpaid sessions are not credited", () => {
  it("does not credit checkout.session.completed while payment_status is unpaid", () => {
    const d = classifyStripeCredit(
      "checkout.session.completed",
      session({ payment_status: "unpaid" })
    );
    expect(d.kind).toBe("unpaid");
  });

  it("credits checkout.session.completed when payment_status is paid", () => {
    const d = classifyStripeCredit(
      "checkout.session.completed",
      session({ payment_status: "paid" })
    );
    expect(d).toMatchObject({ kind: "credit", blockId: "b1", amountCents: 500 });
  });

  it("credits async_payment_succeeded once a delayed method settles", () => {
    const d = classifyStripeCredit(
      "checkout.session.async_payment_succeeded",
      session({ payment_status: "paid" })
    );
    expect(d.kind).toBe("credit");
  });

  it("treats no_payment_required as paid (100% off coupons)", () => {
    const d = classifyStripeCredit(
      "checkout.session.completed",
      session({ payment_status: "no_payment_required" })
    );
    expect(d.kind).toBe("credit");
  });
});

describe("classifyStripeCredit: unattributable paid events are dead-lettered", () => {
  it("dead-letters a paid session with no block_id", () => {
    const d = classifyStripeCredit(
      "checkout.session.completed",
      session({ payment_status: "paid", block_id: "" })
    );
    expect(d.kind).toBe("dead_letter");
    if (d.kind === "dead_letter") {
      expect(d.reason).toMatch(/block_id/);
      expect(d.amountCents).toBe(500);
    }
  });

  it("ignores events that never grant altitude", () => {
    expect(classifyStripeCredit("customer.created", session()).kind).toBe(
      "ignore"
    );
  });

  it("dead-letters a paid session with no id", () => {
    const d = classifyStripeCredit(
      "checkout.session.completed",
      session({ id: "", payment_status: "paid" })
    );
    expect(d.kind).toBe("dead_letter");
    if (d.kind === "dead_letter") {
      expect(d.reason).toMatch(/session id/);
    }
  });

  it("dead-letters a signed session with a negative amount", () => {
    const d = classifyStripeCredit(
      "checkout.session.completed",
      session({ payment_status: "paid", amount_total: -500 })
    );
    expect(d.kind).toBe("dead_letter");
    if (d.kind === "dead_letter") {
      expect(d.reason).toMatch(/amount/);
    }
  });
});
