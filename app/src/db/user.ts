/**
 * User provisioning — the single write path for the `users` table.
 *
 * A `users` row must exist before anything that foreign-keys to it can be
 * written (blocks, climb records/runs, payments). Firebase is the identity
 * source of truth; this upsert mirrors the verified Firebase identity into our
 * DB. It is idempotent and safe to call on every authenticated request.
 */

import { prisma } from "./client";

export interface EnsureUserInput {
  /** Firebase UID — becomes users.id. */
  id: string;
  /** Verified email from the Firebase token (required — users.email is NOT NULL/unique). */
  email: string;
  emailVerified?: boolean;
}

/**
 * Create the user row if missing, or refresh emailVerified on every sign-in.
 * Returns nothing — callers only need the side effect (row exists afterward).
 */
export async function ensureUser(input: EnsureUserInput): Promise<void> {
  await prisma.user.upsert({
    where: { id: input.id },
    create: {
      id: input.id,
      email: input.email,
      emailVerified: input.emailVerified ?? false,
      play_credits_cents: 500,
    },
    update: {
      emailVerified: input.emailVerified ?? false,
    },
  });
}

/**
 * Record the user's 18+ attestation the first time they take a paid-duel action.
 * Idempotent: only stamps when currently null, so the earliest confirmation is
 * preserved as an audit record.
 */
export async function recordAgeConfirmation(userId: string): Promise<void> {
  await prisma.user.updateMany({
    where: { id: userId, age_confirmed_at: null },
    data: { age_confirmed_at: new Date() },
  });
}
