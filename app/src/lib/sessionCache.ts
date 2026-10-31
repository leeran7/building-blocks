/**
 * The last value each signed-in view loaded, kept in memory for this tab.
 *
 * A view revisited by in-app navigation paints that value on its first frame
 * and refreshes behind it, instead of mounting a loading row that changes the
 * page's height when the read lands (the jitter between page switches).
 *
 * Scoped to one account: a write for a different uid drops everything first,
 * and a read for any other uid misses, so nothing from the previous account is
 * shown or kept after a switch.
 */

let owner: string | null = null;
const entries = new Map<string, unknown>();

/** The cached value for `key`, or undefined when there is none for this user. */
export function readSessionCache<T>(uid: string | null | undefined, key: string): T | undefined {
  if (!uid || uid !== owner) return undefined;
  return entries.get(key) as T | undefined;
}

export function writeSessionCache<T>(uid: string | null | undefined, key: string, value: T): void {
  if (!uid) return;
  if (uid !== owner) {
    entries.clear();
    owner = uid;
  }
  entries.set(key, value);
}

/** Drops every entry (tests, and anything that must forget the account). */
export function clearSessionCache(): void {
  entries.clear();
  owner = null;
}
