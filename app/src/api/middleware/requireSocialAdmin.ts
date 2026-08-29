/**
 * Social-admin authorization guard (R3/ADR-10).
 *
 * This repo's only existing "admin" mechanism is the shared machine
 * ADMIN_TOKEN (requireAdmin.ts) — it has no per-user identity, so it cannot
 * satisfy "record which human approved/published this" (AC-25/AC-50) or back
 * a human-facing chat UI session. This guard layers an env-var allowlist
 * (ADMIN_UIDS / ADMIN_EMAILS) on top of the EXISTING requireAuth() Firebase
 * verification — `User` table is untouched, `ADMIN_TOKEN` stays reserved for
 * machine/cron calls only (see requireSocialCron below).
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth, AuthError } from "../../lib/requireAuth";
import { requireAdmin } from "./requireAdmin";
import type { DecodedIdToken } from "firebase-admin/auth";

function allowlistedUids(): string[] {
  return (process.env.ADMIN_UIDS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function allowlistedEmails(): string[] {
  return (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

export function isSocialAdmin(decoded: Pick<DecodedIdToken, "uid" | "email">): boolean {
  const uids = allowlistedUids();
  const emails = allowlistedEmails();
  if (uids.length === 0 && emails.length === 0) return false; // fail closed: inert until configured
  if (uids.includes(decoded.uid)) return true;
  if (decoded.email && emails.includes(decoded.email.toLowerCase())) return true;
  return false;
}

export class SocialAdminError extends Error {
  readonly response: NextResponse;

  constructor(message: string, code: string, status: number) {
    super(message);
    this.name = "SocialAdminError";
    this.response = NextResponse.json({ error: message, code }, { status });
  }
}

/**
 * Verifies a Firebase ID token AND checks the social-admin allowlist (AC-2).
 * Throws a pre-built 401/403 NextResponse-carrying error on failure — mirrors
 * the existing requireAuth() convention so route handlers can `catch`
 * uniformly.
 */
export async function requireSocialAdmin(request: NextRequest): Promise<DecodedIdToken> {
  let decoded: DecodedIdToken;
  try {
    decoded = await requireAuth(request);
  } catch (err) {
    if (err instanceof AuthError) {
      throw new SocialAdminError(err.message, "UNAUTHORIZED", 401);
    }
    throw err;
  }

  if (!isSocialAdmin(decoded)) {
    throw new SocialAdminError(
      "This account is not authorized for the social media admin area",
      "NOT_SOCIAL_ADMIN",
      403
    );
  }

  return decoded;
}

/**
 * Machine-only guard for /api/social/cron/** routes (AC-4). Deliberately
 * reuses the EXISTING requireAdmin() (ADMIN_TOKEN) unchanged — no second,
 * independent machine secret is introduced (ADR-11). Vercel Cron's
 * Authorization-header auto-injection reads CRON_SECRET; deployments must set
 * CRON_SECRET to the same value as ADMIN_TOKEN.
 */
export function requireSocialCron(request: NextRequest): NextResponse | null {
  return requireAdmin(request);
}
