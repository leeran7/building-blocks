/**
 * Webhook invariants that are still source-shaped (schema uniqueness) plus
 * a pointer to the behavioural suites that replaced the greps.
 *
 * Payment_status gating: tests/api/stripeCredit.test.ts
 * Additive altitude:     tests/db/payments.test.ts
 * Dead-letter row:       tests/db/deadLetter.test.ts
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

describe("stripe_session_id UNIQUE is the idempotency key", () => {
  it("is declared unique on the Payment model", () => {
    const schema = readFileSync(
      resolve(__dirname, "../../prisma/schema.prisma"),
      "utf-8"
    );
    const paymentBlock = schema.slice(
      schema.indexOf("model Payment {"),
      schema.indexOf("model PaymentDeadLetter {")
    );
    expect(paymentBlock).toContain("stripe_session_id");
    expect(paymentBlock).toContain("@unique");
  });
});
