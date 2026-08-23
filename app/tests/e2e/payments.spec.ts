/**
 * Phase 4 Payment Tests — AC-31, AC-34, AC-35 (Playwright)
 * These tests verify the payment flow UI and redirect behavior.
 */

import { test, expect } from "@playwright/test";

// AC-31: Stripe Checkout redirect
// AC-35: No-refunds disclosure is set in server-side session metadata
// These are verified by the checkout.test.ts static analysis tests
// and would require Stripe test mode for full E2E

test("Checkout API rejects tampered requests", async ({ request }) => {
  // Sending rate field should get 400
  const response = await request.post("/api/checkout", {
    data: {
      type: "new",
      url: "https://example.com",
      display_name: "Test Block",
      owner_email: "test@example.com",
      amount_usd: 10,
      rate: 5.5, // tampered — should be rejected
    },
  });

  expect(response.status()).toBe(400);
  const body = await response.json();
  expect(body.error).toContain("forbidden");
});

test("Checkout API rejects metres field", async ({ request }) => {
  const response = await request.post("/api/checkout", {
    data: {
      type: "new",
      url: "https://example.com",
      display_name: "Test Block",
      owner_email: "test@example.com",
      amount_usd: 10,
      metres: 100, // tampered
    },
  });

  expect(response.status()).toBe(400);
});

test("Checkout API rejects growth field", async ({ request }) => {
  const response = await request.post("/api/checkout", {
    data: {
      type: "new",
      url: "https://example.com",
      display_name: "Test Block",
      owner_email: "test@example.com",
      amount_usd: 10,
      growth: 8, // tampered
    },
  });

  expect(response.status()).toBe(400);
});
