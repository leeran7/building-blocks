/**
 * Social-admin allowlist helpers (ADR-10). Extracted so unit tests can
 * import them without initializing Firebase Admin.
 */

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
  if (uids.length === 0 && emails.length === 0) return false;
  if (uids.includes(decoded.uid)) return true;
  if (decoded.email && emails.includes(decoded.email.toLowerCase())) return true;
  return false;
}
