import { getStripe } from "./stripe";
import { prisma } from "../db/client";

/**
 * Create a Stripe Connect Express account for a user who needs to receive
 * tournament prize payouts. Returns the account id if one already exists.
 */
export async function getOrCreateConnectAccount(userId: string): Promise<string> {
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: { stripe_connect_account_id: true, email: true },
  });

  if (user.stripe_connect_account_id) return user.stripe_connect_account_id;

  const stripe = getStripe();
  const account = await stripe.accounts.create({
    type: "express",
    email: user.email,
    metadata: { user_id: userId },
    capabilities: {
      transfers: { requested: true },
    },
  });

  await prisma.user.update({
    where: { id: userId },
    data: { stripe_connect_account_id: account.id },
  });

  return account.id;
}

/**
 * Generate an Account Link for the user to complete Express onboarding.
 * The user is redirected to Stripe's hosted onboarding flow and back.
 */
export async function createOnboardingLink(
  accountId: string,
  returnUrl: string,
  refreshUrl: string
): Promise<string> {
  const stripe = getStripe();
  const link = await stripe.accountLinks.create({
    account: accountId,
    type: "account_onboarding",
    return_url: returnUrl,
    refresh_url: refreshUrl,
  });
  return link.url;
}

/**
 * Check whether a Connect Express account has completed onboarding and is
 * eligible to receive payouts.
 */
export async function isPayoutReady(accountId: string): Promise<boolean> {
  const stripe = getStripe();
  const account = await stripe.accounts.retrieve(accountId);
  return account.payouts_enabled === true;
}

/**
 * Disburse a prize to a connected Express account via a Transfer. The funds
 * move from the platform's Stripe balance to the connected account. Returns
 * the transfer id for tracking.
 */
export async function createPrizeTransfer(
  connectedAccountId: string,
  amountCents: number,
  tournamentId: string,
  entryId: string
): Promise<string> {
  const stripe = getStripe();
  const transfer = await stripe.transfers.create({
    amount: amountCents,
    currency: "usd",
    destination: connectedAccountId,
    metadata: {
      tournament_id: tournamentId,
      entry_id: entryId,
      type: "tournament_prize",
    },
  });
  return transfer.id;
}

/**
 * Create a Stripe Checkout session for a tournament entry fee.
 */
export async function createEntryFeeCheckout(opts: {
  userId: string;
  tournamentId: string;
  tournamentName: string;
  entryFeeCents: number;
  successUrl: string;
  cancelUrl: string;
}): Promise<string> {
  const stripe = getStripe();
  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    currency: "usd",
    line_items: [
      {
        price_data: {
          currency: "usd",
          unit_amount: opts.entryFeeCents,
          product_data: { name: `Entry: ${opts.tournamentName}` },
        },
        quantity: 1,
      },
    ],
    metadata: {
      type: "tournament_entry",
      user_id: opts.userId,
      tournament_id: opts.tournamentId,
    },
    success_url: opts.successUrl,
    cancel_url: opts.cancelUrl,
  });
  return session.url!;
}
