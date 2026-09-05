/**
 * Public creator username normalisation for /c/[username].
 *
 * A username is chosen by the user (in settings), unique, and public. It is
 * URL-safe and moderated. Pure + deterministic (no DB) so it is unit-testable;
 * uniqueness is enforced separately by the DB unique index.
 */

import { isHatefulName } from "./nameModeration";

export const USERNAME_MIN = 3;
export const USERNAME_MAX = 30;

// Names that would be confusing as a public creator handle. The route lives
// under /c/ so these don't collide with top-level pages, but reserving them
// avoids impersonation of official surfaces.
const RESERVED = new Set([
  "admin",
  "official",
  "support",
  "staff",
  "root",
  "system",
  "moderator",
  "doomstack",
  "theclimb",
]);

export interface UsernameResult {
  valid: boolean;
  username?: string;
  error?: string;
}

/**
 * Normalise + validate a username. Lowercased; letters, digits and underscores
 * only; 3–30 chars; not reserved; not hateful. A leading "@" is tolerated.
 */
export function normalizeUsername(raw: string): UsernameResult {
  const s = (raw ?? "").trim().replace(/^@+/, "").toLowerCase();
  if (!s) return { valid: false, error: "Enter a username" };
  if (s.length < USERNAME_MIN) {
    return { valid: false, error: `Username must be at least ${USERNAME_MIN} characters` };
  }
  if (s.length > USERNAME_MAX) {
    return { valid: false, error: `Username must be at most ${USERNAME_MAX} characters` };
  }
  if (!/^[a-z0-9_]+$/.test(s)) {
    return { valid: false, error: "Use only letters, numbers and underscores" };
  }
  if (RESERVED.has(s)) {
    return { valid: false, error: "That username isn’t available" };
  }
  if (isHatefulName(s)) {
    return { valid: false, error: "That username isn’t allowed" };
  }
  return { valid: true, username: s };
}

/** Suggest a valid default username from a display name (best-effort; may be empty). */
export function suggestUsername(displayName: string | null | undefined): string {
  const base = (displayName ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, USERNAME_MAX);
  const res = normalizeUsername(base);
  return res.valid ? res.username! : "";
}
