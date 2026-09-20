/**
 * Duel invite parsing — turn whatever a player pasted into a duel id, or null.
 *
 * Allow-list only: every input that is not provably a duel id (or a URL whose
 * path is exactly /duel/<id>) returns null. We never fall back to a default or
 * pass the raw string through — the caller builds its route from the RETURNED
 * id, so a pasted `javascript:` or cross-origin URL can never become a
 * navigation target.
 *
 * Ids are produced by `nanoid()` in POST /api/duel: 21 chars from
 * [A-Za-z0-9_-]. The bound is kept loose (6–64) so a future id length change
 * doesn't silently reject real links, but the alphabet stays exact.
 */

const DUEL_ID = /^[A-Za-z0-9_-]{6,64}$/;
const DUEL_PATH = /^\/duel\/([A-Za-z0-9_-]{6,64})\/?$/;

/** The id from a pasted duel link or bare id, or null if it isn't one. */
export function parseDuelInvite(raw: string): string | null {
  const input = raw.trim();
  if (input.length === 0) return null;

  // Bare id — the most common paste after "share the code".
  if (DUEL_ID.test(input)) return input;

  const path = extractPath(input);
  if (path === null) return null;

  const match = DUEL_PATH.exec(path);
  return match ? match[1] : null;
}

/**
 * The path portion of an absolute http(s) URL or a root-relative path.
 * Anything else (other schemes, protocol-relative, bare words) is rejected
 * rather than coerced.
 */
function extractPath(input: string): string | null {
  if (input.startsWith("//")) return null;

  if (input.startsWith("/")) {
    // Strip query + hash without constructing a URL against an unknown base.
    return input.split(/[?#]/, 1)[0];
  }

  try {
    const url = new URL(input);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url.pathname;
  } catch {
    return null;
  }
}
