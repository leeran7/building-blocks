/**
 * OAuth CSRF `state` issuance/verification (AC-7).
 *
 * Deliberately decoupled from every other table: a forged/expired state must
 * fail closed with zero side effects. Single-use — `consumedAt` is set
 * atomically on first (and only) verification via a conditional UPDATE, so a
 * replayed callback with the same `state` can never succeed twice.
 */

import { prisma } from "../../db/client";
import { randomOpaqueId } from "../services/safety";
import type { SocialPlatform } from "../types";

const STATE_TTL_MINUTES = 10;

export async function issueOAuthState(
  platform: SocialPlatform,
  initiatedByUid: string,
  redirectAfter?: string
): Promise<string> {
  const id = randomOpaqueId(32);
  const expiresAt = new Date(Date.now() + STATE_TTL_MINUTES * 60_000);
  await prisma.socialOAuthState.create({
    data: { id, platform, initiatedByUid, redirectAfter, expiresAt },
  });
  return id;
}

export interface VerifiedOAuthState {
  valid: boolean;
  initiatedByUid?: string;
  redirectAfter?: string | null;
}

/**
 * Verifies and consumes a `state` value in one atomic step. A missing,
 * expired, already-consumed, or platform-mismatched state is rejected —
 * never creates or updates any SocialAccount row (AC-7).
 */
export async function verifyAndConsumeOAuthState(
  stateId: string,
  platform: SocialPlatform
): Promise<VerifiedOAuthState> {
  if (!stateId) return { valid: false };

  // Conditional UPDATE: only succeeds if the row exists, matches the
  // platform, hasn't expired, and hasn't already been consumed. This is the
  // same idiom as ContentItem.lockedAt claims (ADR-3) — atomic, no explicit
  // transaction/connection-pinning needed under PgBouncer transaction mode.
  const result = await prisma.$executeRaw`
    UPDATE social_oauth_states
    SET "consumedAt" = now()
    WHERE id = ${stateId}
      AND platform = ${platform}::"SocialPlatform"
      AND "expiresAt" > now()
      AND "consumedAt" IS NULL
  `;

  if (result === 0) return { valid: false };

  const row = await prisma.socialOAuthState.findUnique({ where: { id: stateId } });
  if (!row) return { valid: false };
  return { valid: true, initiatedByUid: row.initiatedByUid, redirectAfter: row.redirectAfter };
}
