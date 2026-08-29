/**
 * Webhook POST behaviour.
 *
 * classifyStripeCredit is the decision function; these tests drive the route
 * so a future unwind (inlining "credit every completed session") cannot stay
 * green. Signature verification is stubbed; the money side effects are mocked.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("../../src/api/stripe", () => ({
  verifyWebhookSignature: vi.fn(),
}));

vi.mock("../../src/db/payments", () => ({
  findPaymentByStripeSession: vi.fn(),
  applyPaymentTransaction: vi.fn(),
  recordDeadLetter: vi.fn(),
}));

vi.mock("../../src/db/blocks", () => ({
  getBlockById: vi.fn(),
  getRankedBlocks: vi.fn(),
  updatePeakRank: vi.fn(),
}));

vi.mock("../../src/db/seasons", () => ({
  getOrCreateActiveSeason: vi.fn(),
}));

import { verifyWebhookSignature } from "../../src/api/stripe";
import {
  applyPaymentTransaction,
  findPaymentByStripeSession,
  recordDeadLetter,
} from "../../src/db/payments";
import { getBlockById, getRankedBlocks } from "../../src/db/blocks";
import { getOrCreateActiveSeason } from "../../src/db/seasons";
import { POST } from "../../app/api/webhook/stripe/route";
import type Stripe from "stripe";

function signedEvent(
  paymentStatus: string | null,
  metadata: { block_id?: string; category?: string } | null,
  extras: { id?: string; amount_total?: number | null; type?: string } = {}
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
        payment_status: paymentStatus,
        metadata,
      },
    },
  } as unknown as Stripe.Event;
}

async function postWebhook(): Promise<Response> {
  return POST(
    new NextRequest("http://localhost/api/webhook/stripe", {
      method: "POST",
      headers: { "stripe-signature": "t=1,v1=test" },
      body: "{}",
    })
  );
}

describe("POST /api/webhook/stripe", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(findPaymentByStripeSession).mockResolvedValue(null);
    vi.mocked(recordDeadLetter).mockResolvedValue(undefined);
    vi.mocked(applyPaymentTransaction).mockResolvedValue({
      payment: {} as never,
      block: { id: "b1", altitude: 10 } as never,
    });
    vi.mocked(getRankedBlocks).mockResolvedValue([]);
    vi.mocked(getOrCreateActiveSeason).mockResolvedValue({
      id: "s1",
      views_k: 0,
      category: "indie-games",
    } as never);
  });

  it("does not credit an unpaid checkout.session.completed", async () => {
    vi.mocked(verifyWebhookSignature).mockReturnValue(
      signedEvent("unpaid", { block_id: "b1" })
    );

    const res = await postWebhook();
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.credited).toBe(false);
    expect(applyPaymentTransaction).not.toHaveBeenCalled();
    expect(recordDeadLetter).not.toHaveBeenCalled();
  });

  it("dead-letters a paid session with no block_id and still returns 200", async () => {
    vi.mocked(verifyWebhookSignature).mockReturnValue(
      signedEvent("paid", null)
    );

    const res = await postWebhook();
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.dead_lettered).toBe(true);
    expect(applyPaymentTransaction).not.toHaveBeenCalled();
    expect(recordDeadLetter).toHaveBeenCalledWith(
      expect.objectContaining({
        stripeSessionId: "cs_test_1",
        amountCents: 500,
        reason: expect.stringMatching(/block_id/),
      })
    );
  });

  it("credits a paid session against the live season, not a client rate", async () => {
    vi.mocked(verifyWebhookSignature).mockReturnValue(
      signedEvent("paid", { block_id: "b1", category: "indie-games" })
    );
    vi.mocked(getBlockById).mockResolvedValue({
      id: "b1",
      category: "indie-games",
    } as never);

    const res = await postWebhook();
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.received).toBe(true);
    expect(body.credited).toBeUndefined();
    expect(recordDeadLetter).not.toHaveBeenCalled();
    expect(getOrCreateActiveSeason).toHaveBeenCalledWith("indie-games");
    expect(applyPaymentTransaction).toHaveBeenCalledTimes(1);
    const [, sessionId, amountCents] = vi.mocked(applyPaymentTransaction).mock
      .calls[0]!;
    expect(sessionId).toBe("cs_test_1");
    expect(amountCents).toBe(500);
  });
});
