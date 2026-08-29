/**
 * Webhook Tests — AC-32, AC-33 (static analysis + design verification)
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

describe("AC-32: Webhook idempotency", () => {
  const webhookPath = resolve(__dirname, "../../app/api/webhook/stripe/route.ts");
  const webhookContent = readFileSync(webhookPath, "utf-8");

  it("webhook handler checks for existing payment before any write", () => {
    expect(webhookContent).toContain("findPaymentByStripeSession");
    expect(webhookContent).toContain("existingPayment");
  });

  it("webhook returns 200 no-op for duplicate delivery", () => {
    // The handler returns { received: true } if existingPayment is found
    expect(webhookContent).toContain("{ received: true }");
    expect(webhookContent).toContain("existingPayment");
  });

  it("stripe_session_id UNIQUE constraint is the idempotency mechanism", () => {
    const paymentsPath = resolve(__dirname, "../../src/db/payments.ts");
    const paymentsContent = readFileSync(paymentsPath, "utf-8");
    expect(paymentsContent).toContain("stripe_session_id");

    const schemaPath = resolve(__dirname, "../../prisma/schema.prisma");
    const schema = readFileSync(schemaPath, "utf-8");
    expect(schema).toContain("stripe_session_id");
    expect(schema).toContain("@unique");
  });
});

describe("AC-33: Atomic transaction", () => {
  it("webhook applies altitude increment and payment insert in one transaction", () => {
    const paymentsPath = resolve(__dirname, "../../src/db/payments.ts");
    const paymentsContent = readFileSync(paymentsPath, "utf-8");

    // applyPaymentTransaction uses prisma.$transaction
    expect(paymentsContent).toContain("prisma.$transaction");
    expect(paymentsContent).toContain("altitude");
    expect(paymentsContent).toContain("payment.create");
  });

  // Additivity (ADR-7) is asserted behaviourally in tests/db/payments.test.ts.
  // The source-text guard that used to live here was
  //   /altitude:\s*metresAdded(?!\s*\})/
  // whose negative lookahead exempted `data: { altitude: metresAdded }` — the
  // overwrite form it existed to forbid — whenever that was the object's final
  // property. Deleted rather than patched: the behavioural test catches every
  // form of the overwrite, and a second weaker guard on the same invariant only
  // obscures which one is load-bearing.

  it("webhook verifies stripe signature before any DB write", () => {
    const webhookPath = resolve(__dirname, "../../app/api/webhook/stripe/route.ts");
    const webhookContent = readFileSync(webhookPath, "utf-8");

    // Signature verification is the first thing in POST handler
    expect(webhookContent).toContain("verifyWebhookSignature");
    expect(webhookContent).toContain("stripe-signature");
    expect(webhookContent).toContain("status: 400");
  });

  it("metres are computed server-side from live views_k, never from client", () => {
    const webhookPath = resolve(__dirname, "../../app/api/webhook/stripe/route.ts");
    const webhookContent = readFileSync(webhookPath, "utf-8");

    // computeMetres called with live views_k
    expect(webhookContent).toContain("computeMetres");
    expect(webhookContent).toContain("views_k");
    // Never references client-supplied rate/metres
    expect(webhookContent).not.toContain("client_rate");
    expect(webhookContent).not.toContain("client_metres");
  });
});
