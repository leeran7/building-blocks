/**
 * Stripe payment dead-letter queue.
 *
 * Shared by every Stripe webhook path (currently credits top-ups): when a
 * captured payment cannot be attributed, we persist a replayable row here and
 * still return 200 — Stripe must not retry a deterministic miss. Logs are the
 * alert; this row is the system of record.
 */

import { prisma } from "./client";

/**
 * Persist an unattributable captured payment so it can be replayed.
 */
export async function recordDeadLetter(input: {
  eventType: string;
  stripeSessionId: string;
  amountCents: number;
  reason: string;
}): Promise<void> {
  await prisma.paymentDeadLetter.create({
    data: {
      stripe_session_id: input.stripeSessionId,
      event_type: input.eventType,
      amount_cents: input.amountCents,
      reason: input.reason,
    },
  });
}
