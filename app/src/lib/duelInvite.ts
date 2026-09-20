/**
 * Duel invite parsing — turn whatever a player pasted into a duel id, or null.
 *
 * Allow-list only: every input that is not provably a duel id (or a SAME-ORIGIN
 * URL whose path is exactly /duel/<id>) returns null. We never fall back to a
 * default or pass the raw string through — the caller builds its route from the
 * RETURNED id, so a pasted `javascript:` or cross-origin URL can never become a
 * navigation target.
 *
 * Absolute URLs are additionally checked against this app's own origin (AC-10).
 * A link on someone else's host is rejected outright rather than mined for an
 * id: downstream code happening to be safe is not a reason to accept untrusted
 * origins here. When the app origin cannot be determined at all, absolute URLs
 * are rejected — never accepted by default.
 *
 * Ids are produced by `nanoid()` in POST /api/duel: 21 chars from
 * [A-Za-z0-9_-]. The bound is kept loose (6–64) so a future id length change
 * doesn't silently reject real links, but the alphabet stays exact.
 */

import { resolveBaseUrl } from "../config/public";

const DUEL_ID = /^[A-Za-z0-9_-]{6,64}$/;
const DUEL_PATH = /^\/duel\/([A-Za-z0-9_-]{6,64})\/?$/;

/**
 * The id from a pasted duel link or bare id, or null if it isn't one.
 *
 * `expectedOrigin` is the only origin an absolute URL may carry. It defaults to
 * this app's origin; pass it explicitly to keep the function pure (tests, SSR).
 * Pass `null` to reject every absolute URL.
 */
export function parseDuelInvite(
  raw: string,
  expectedOrigin: string | null = appOrigin()
): string | null {
  const input = raw.trim();
  if (input.length === 0) return null;

  // Bare id — the most common paste after "share the code".
  if (DUEL_ID.test(input)) return input;

  const path = extractPath(input, expectedOrigin);
  if (path === null) return null;

  const match = DUEL_PATH.exec(path);
  return match ? match[1] : null;
}

/**
 * The path portion of a same-origin http(s) URL or a root-relative path.
 * Anything else (other schemes, other origins, protocol-relative, bare words)
 * is rejected rather than coerced.
 */
function extractPath(input: string, expectedOrigin: string | null): string | null {
  if (input.startsWith("//")) return null;

  if (input.startsWith("/")) {
    // Strip query + hash without constructing a URL against an unknown base.
    return input.split(/[?#]/, 1)[0];
  }

  if (expectedOrigin === null) return null;

  try {
    const url = new URL(input);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    if (url.origin !== expectedOrigin) return null;
    return url.pathname;
  } catch {
    return null;
  }
}

/**
 * This app's own origin: the live origin in the browser, the configured base
 * URL everywhere else (SSR, tests). Returns null — not a wildcard — when the
 * origin is opaque or unparseable, so callers reject instead of guessing.
 */
function appOrigin(): string | null {
  if (typeof window !== "undefined") {
    const { origin } = window.location;
    return origin.length > 0 && origin !== "null" ? origin : null;
  }

  try {
    return new URL(resolveBaseUrl()).origin;
  } catch {
    return null;
  }
}
