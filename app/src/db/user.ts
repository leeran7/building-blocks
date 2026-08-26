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
    },
    update: {
      emailVerified: input.emailVerified ?? false,
    },
  });
}
