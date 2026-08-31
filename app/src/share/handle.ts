/**
 * Public handle for share cards. Never email, never a string matching /@/.
 */

import { climberDisplay, climberHandle } from "../lib/handle";

export function shareHandle(
  userId: string | null | undefined,
  displayName: string | null | undefined
): string | null {
  if (userId == null || userId === "") return null;
  const handle = climberDisplay(userId, displayName);
  if (/@/.test(handle)) return climberHandle(userId);
  return handle;
}

/** Last-line redaction if a DTO handle still looks like an email. */
export function redactShareHandle(handle: string | null): string | null {
  if (handle == null) return null;
  if (/@/.test(handle)) return null;
  return handle;
}
