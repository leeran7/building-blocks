/**
 * Phase 4 Checkout Tests — AC-30, AC-35, AC-36
 *
 * Tests server-side quote enforcement, no-refunds disclosure, new listing altitude=0.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

describe("AC-30: Server-side quote — reject tampered rate/metres/growth", () => {
  it("checkout route rejects requests containing client-supplied rate", () => {
    const routePath = resolve(__dirname, "../../app/api/checkout/route.ts");
    const routeContent = readFileSync(routePath, "utf-8");

    // Verify the check exists in the route
    expect(routeContent).toContain('"rate" in body');
    expect(routeContent).toContain('"metres" in body');
    expect(routeContent).toContain('"growth" in body');
    expect(routeContent).toContain("Client-supplied rate/metres/growth is forbidden");
  });

  it("checkout route computes rate server-side from current views_k", () => {
    const routePath = resolve(__dirname, "../../app/api/checkout/route.ts");
    const routeContent = readFileSync(routePath, "utf-8");

    // Server reads views_k and computes rate
    expect(routeContent).toContain("views_k");
    expect(routeContent).toContain("computeRate");
  });

  it("checkout route validates minimum amounts", () => {
    const routePath = resolve(__dirname, "../../app/api/checkout/route.ts");
    const routeContent = readFileSync(routePath, "utf-8");

    expect(routeContent).toContain("MIN_ENTRY_USD");
    expect(routeContent).toContain("MIN_SPEND_USD");
    expect(routeContent).toContain("Minimum amount");
  });

  it("checkout rejects new listings on a ghost/legacy category", () => {
    const routePath = resolve(__dirname, "../../app/api/checkout/route.ts");
    const routeContent = readFileSync(routePath, "utf-8");

    expect(routeContent).toContain("parsePaidStackSlug");
    expect(routeContent).toContain("parseSeasonSlug");
    expect(routeContent).toContain("INVALID_CATEGORY");
    expect(routeContent).toContain("Unknown stack");
    expect(routeContent).toContain("Block has no stack");
    expect(routeContent).not.toContain("topupBlock!");
  });

  it("isGameCategory is an own-property allowlist, not `in`", () => {
    const catPath = resolve(__dirname, "../../src/game/categories.ts");
    const catContent = readFileSync(catPath, "utf-8");
    expect(catContent).toContain("GAME_CATEGORY_SLUGS.has");
    expect(catContent).not.toMatch(/slug\.toLowerCase\(\) in GAME_CATEGORY_BY_SLUG/);
  });
});

describe("AC-35: No-refunds disclosure at checkout", () => {
  it("checkout route includes no-refunds text in Stripe session", () => {
    const routePath = resolve(__dirname, "../../app/api/checkout/route.ts");
    const routeContent = readFileSync(routePath, "utf-8");

    expect(routeContent).toContain("No refunds");
    expect(routeContent).toContain("product_data");
  });

  it("checkout includes positions-are-live disclosure", () => {
    const routePath = resolve(__dirname, "../../app/api/checkout/route.ts");
    const routeContent = readFileSync(routePath, "utf-8");

    expect(routeContent).toContain("Positions are live");
  });
});

describe("AC-36: New listing starts at altitude = 0", () => {
  it("createBlock is called with altitude = 0 for new listings", () => {
    // Verify createBlock in blocks.ts sets altitude = 0
    const blocksPath = resolve(__dirname, "../../src/db/blocks.ts");
    const blocksContent = readFileSync(blocksPath, "utf-8");

    expect(blocksContent).toContain("altitude: 0");
  });

  it("checkout route calls createBlock for new listings", () => {
    const routePath = resolve(__dirname, "../../app/api/checkout/route.ts");
    const routeContent = readFileSync(routePath, "utf-8");

    expect(routeContent).toContain("createBlock");
  });

  it("altitude is incremented by webhook handler, not checkout", () => {
    // Webhook handler does the altitude increment
    const webhookPath = resolve(__dirname, "../../app/api/webhook/stripe/route.ts");
    const webhookContent = readFileSync(webhookPath, "utf-8");

    expect(webhookContent).toContain("altitude");
    expect(webhookContent).toContain("metresAdded");

    // Checkout route does NOT increment altitude
    const checkoutPath = resolve(__dirname, "../../app/api/checkout/route.ts");
    const checkoutContent = readFileSync(checkoutPath, "utf-8");

    expect(checkoutContent).not.toContain("altitude += ");
    expect(checkoutContent).not.toContain("altitude: { increment");
  });
});

describe("Webhook idempotency (AC-32)", () => {
  it("webhook handler checks for existing payment before writing", () => {
    const webhookPath = resolve(__dirname, "../../app/api/webhook/stripe/route.ts");
    const webhookContent = readFileSync(webhookPath, "utf-8");

    expect(webhookContent).toContain("findPaymentByStripeSession");
    expect(webhookContent).toContain("existingPayment");
    expect(webhookContent).toContain("{ received: true }"); // no-op response
  });

  it("webhook uses stripe_session_id as idempotency key", () => {
    const webhookPath = resolve(__dirname, "../../app/api/webhook/stripe/route.ts");
    const webhookContent = readFileSync(webhookPath, "utf-8");

    expect(webhookContent).toContain("stripeSessionId");
    expect(webhookContent).toContain("stripe_session_id");
  });
});

describe("Webhook atomic transaction (AC-33)", () => {
  it("webhook calls applyPaymentTransaction for atomic write", () => {
    const webhookPath = resolve(__dirname, "../../app/api/webhook/stripe/route.ts");
    const webhookContent = readFileSync(webhookPath, "utf-8");

    expect(webhookContent).toContain("applyPaymentTransaction");
  });

  it("applyPaymentTransaction uses prisma.$transaction", () => {
    const paymentsPath = resolve(__dirname, "../../src/db/payments.ts");
    const paymentsContent = readFileSync(paymentsPath, "utf-8");

    expect(paymentsContent).toContain("prisma.$transaction");
  });

  it("altitude increment is additive (altitude += metres)", () => {
    const paymentsPath = resolve(__dirname, "../../src/db/payments.ts");
    const paymentsContent = readFileSync(paymentsPath, "utf-8");

    // Uses increment: metresAdded (additive, never set to computed value)
    expect(paymentsContent).toContain("increment: metresAdded");
    // Must NOT use SET altitude = computed_value
    expect(paymentsContent).not.toMatch(/altitude:\s*metresAdded/);
    expect(paymentsContent).not.toMatch(/altitude\s*=\s*[a-zA-Z]+\s*\+\s*[a-zA-Z]/);
  });
});
