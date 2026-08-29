/**
 * Sanitize a user-supplied post-auth redirect target to prevent open redirects.
 *
 * Only same-origin, absolute *internal paths* are allowed (must start with a
 * single "/" and not "//" or "/\", which browsers treat as protocol-relative /
 * cross-origin). Anything else — full URLs, protocol-relative, backslash tricks,
 * control chars — falls back to a safe default.
 */
export function safeInternalPath(
  raw: string | null | undefined,
  fallback = "/dashboard"
): string {
  if (!raw || typeof raw !== "string") return fallback;
  // Must be an absolute internal path.
  if (raw[0] !== "/") return fallback;
  // Block protocol-relative ("//host") and backslash variants ("/\\host").
  if (raw[1] === "/" || raw[1] === "\\") return fallback;
  // Block control chars / whitespace that could smuggle a scheme.
  // biome-ignore lint: intentional control-char guard
  if (/[\x00-\x1F\x7F]/.test(raw)) return fallback;
  return raw;
}

/** Same-origin relative path under /admin/social only — blocks open redirects after OAuth. */
export function safeSocialAdminPath(
  raw: string | null | undefined,
  fallback = "/admin/social/settings"
): string {
  const path = safeInternalPath(raw, fallback);
  if (!path.startsWith("/admin/social")) return fallback;
  return path;
}
