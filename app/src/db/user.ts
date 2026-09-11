/**
 * User provisioning — the single write path for the `users` table.
 *
 * A `users` row must exist before anything that foreign-keys to it can be
 * written (blocks, climb records/runs, payments). Firebase is the identity
 * source of truth; this upsert mirrors the verified Firebase identity into our
 * DB. It is idempotent and safe to call on every authenticated request.
 */

import { prisma } from "./client";
import { CHIP_TO_CENTS_RATIO } from "../config/chipPackages";

const SIGNUP_CHIP_GRANT_CHIPS = 5;

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
      play_credits_cents: SIGNUP_CHIP_GRANT_CHIPS * CHIP_TO_CENTS_RATIO,
    },
    update: {
      emailVerified: input.emailVerified ?? false,
    },
  });
}

/**
 * Placeholder row for a "guest:<nanoid>" duel participant. Guests have no
 * Firebase account and no persistent profile (stats/wallet code explicitly
 * skips anything "guest:"-prefixed), but `duels.player1_id`/`player2_id`
 * still foreign-key to `users(id)`, so a row must exist to write the join.
 * The synthesized email uses the `.invalid` TLD (RFC 2606) to make clear
 * it's not a deliverable address. No credits are granted — the row exists
 * only to satisfy the FK, never to unlock wallet/credit surfaces.
 */
export async function ensureGuestUser(guestId: string): Promise<void> {
  await prisma.user.upsert({
    where: { id: guestId },
    create: {
      id: guestId,
      email: `${guestId}@guest.invalid`,
      emailVerified: false,
      play_credits_cents: 0,
    },
    update: {},
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
