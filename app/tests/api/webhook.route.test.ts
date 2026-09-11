/**
 * Webhook POST behaviour.
 *
 * The only funded flow is prepaid-credit top-ups (metadata.type ===
 * "credits_topup"), settled to the PLAY bucket. These tests drive the route so
 * a future unwind (crediting a session that wasn't actually paid, or crediting
 * a non-credits session) cannot stay green. Signature verification is stubbed;
 * the money side effects are mocked.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("../../src/api/stripe", () => ({
  verifyWebhookSignature: vi.fn(),
}));

vi.mock("../../src/db/credits", () => ({
  addPurchasedCredits: vi.fn(),
}));

vi.mock("../../src/db/deadLetter", () => ({
  recordDeadLetter: vi.fn(),
}));

import { verifyWebhookSignature } from "../../src/api/stripe";
import { addPurchasedCredits } from "../../src/db/credits";
import { recordDeadLetter } from "../../src/db/deadLetter";
import { POST } from "../../app/api/webhook/stripe/route";
import type Stripe from "stripe";

function signedEvent(
  paymentStatus: string | null,
  metadata: { type?: string; user_id?: string } | null,
  extras: {
    id?: string;
    amount_total?: number | null;
    type?: string;
    currency?: string;
  } = {}
): Stripe.Event {
  return {
    id: "evt_test",
    object: "event",
    type: extras.type ?? "checkout.session.completed",
    data: {
      object: {
        id: extras.id ?? "cs_test_1",
        object: "checkout.session",
        amount_total: extras.amount_total === undefined ? 500 : extras.amount_total,
        currency: extras.currency ?? "usd",
        payment_status: paymentStatus,
        metadata,
      },
    },
  } as unknown as Stripe.Event;
}

function request(): NextRequest {
  return new NextRequest("http://localhost/api/webhook/stripe", {
    method: "POST",
    headers: { "stripe-signature": "t=1,v1=test" },
    body: "{}",
  });
}

const mockVerify = vi.mocked(verifyWebhookSignature);
const mockAddCredits = vi.mocked(addPurchasedCredits);
const mockDeadLetter = vi.mocked(recordDeadLetter);

beforeEach(() => {
  vi.clearAllMocks();
  mockAddCredits.mockResolvedValue({ outcome: "credited" } as never);
});

describe("POST /api/webhook/stripe", () => {
  it("rejects a request with no stripe-signature header (400)", async () => {
    const req = new NextRequest("http://localhost/api/webhook/stripe", {
      method: "POST",
      body: "{}",
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    expect(mockAddCredits).not.toHaveBeenCalled();
  });

  it("rejects an invalid signature (400) and never credits", async () => {
    mockVerify.mockImplementation(() => {
      throw new Error("bad signature");
    });
    const res = await POST(request());
    expect(res.status).toBe(400);
    expect(mockAddCredits).not.toHaveBeenCalled();
  });

  it("credits a paid credits_topup to the buyer's PLAY bucket", async () => {
    mockVerify.mockReturnValue(
      signedEvent("paid", { type: "credits_topup", user_id: "user_1" }, { amount_total: 1000 })
    );
    const res = await POST(request());
    expect(res.status).toBe(200);
    expect(mockAddCredits).toHaveBeenCalledWith("user_1", "cs_test_1", 100000);
  });

  it("does not credit a credits_topup that was not actually paid", async () => {
    mockVerify.mockReturnValue(
      signedEvent("unpaid", { type: "credits_topup", user_id: "user_1" })
    );
    const res = await POST(request());
    expect(res.status).toBe(200);
    expect(mockAddCredits).not.toHaveBeenCalled();
  });

  it("dead-letters a paid credits_topup with no user_id", async () => {
    mockVerify.mockReturnValue(
      signedEvent("paid", { type: "credits_topup" }, { amount_total: 1000 })
    );
    const res = await POST(request());
    expect(res.status).toBe(200);
    expect(mockAddCredits).not.toHaveBeenCalled();
    expect(mockDeadLetter).toHaveBeenCalledOnce();
  });

  it("ignores a non-credits session without crediting", async () => {
    mockVerify.mockReturnValue(signedEvent("paid", { user_id: "user_1" }));
    const res = await POST(request());
    expect(res.status).toBe(200);
    expect(mockAddCredits).not.toHaveBeenCalled();
    expect(mockDeadLetter).not.toHaveBeenCalled();
  });
});
