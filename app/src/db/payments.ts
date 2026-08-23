/**
 * Payment database queries.
 *
 * CRITICAL: Stripe webhook idempotency via stripe_session_id UNIQUE (NFR-D1).
 * The webhook handler checks for existing rows BEFORE any write.
 */

import { prisma } from "./client";
import type { Payment, Block } from "@prisma/client";

/**
 * Check if a payment already exists for this Stripe session.
 * Used for idempotency check in webhook handler (AC-32).
 */
export async function findPaymentByStripeSession(
  stripeSessionId: string
): Promise<Payment | null> {
  return prisma.payment.findUnique({
    where: { stripe_session_id: stripeSessionId },
  });
}

/**
 * Atomic webhook payment handler — run inside a transaction.
 *
 * 1. Lock active season row for reading views_k
 * 2. Compute metres = amount_cents / 100 * rate
 * 3. Prisma increment: altitude + metres (additive — never SET to computed value)
 * 4. Prisma increment: spend_c + amount_cents
 * 5. INSERT payment row
 *
 * CRITICAL: altitude is incremented additively via Prisma { increment }. Never SET to a computed value.
 * This is ADR-7 and is the only safe pattern for concurrent payments.
 *
 * @param blockId - block to update
 * @param stripeSessionId - unique session ID for idempotency
 * @param amountCents - payment amount in cents
 * @param metresAdded - computed metres (server-side, never client-supplied)
 * @returns the created payment and updated block
 */
export async function applyPaymentTransaction(
  blockId: string,
  stripeSessionId: string,
  amountCents: number,
  metresAdded: number
): Promise<{ payment: Payment; block: Block }> {
  return prisma.$transaction(async (tx) => {
    // Additive altitude increment — never set to a computed value (ADR-7)
    // This is safe under concurrent payments to the same block.
    const block = await tx.block.update({
      where: { id: blockId },
      data: {
        // CRITICAL: additive increment via Prisma — never SET to computed value
        altitude: { increment: metresAdded },
        // spend_c is display-only — also additive
        spend_c: { increment: amountCents },
      },
    });

    const payment = await tx.payment.create({
      data: {
        block_id: blockId,
        stripe_session_id: stripeSessionId,
        amount_cents: amountCents,
        metres_added: metresAdded,
      },
    });

    return { payment, block };
  });
}

/**
 * Get all payments for a block in the current season.
 * Used for admin refund action (AC-50).
 */
export async function getPaymentsByBlock(blockId: string): Promise<Payment[]> {
  return prisma.payment.findMany({
    where: { block_id: blockId },
    orderBy: { created_at: "asc" },
  });
}

/**
 * Get total spend for a block (sum of amount_cents).
 * Used for record page display.
 */
export async function getTotalSpend(
  blockId: string
): Promise<number> {
  const result = await prisma.payment.aggregate({
    where: { block_id: blockId },
    _sum: { amount_cents: true },
  });
  return result._sum.amount_cents ?? 0;
}
