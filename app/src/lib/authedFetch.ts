/**
 * Convenience wrapper for fetch calls to internal API routes that require a
 * Firebase auth token. Merges the Authorization header so callers don't repeat
 * the header construction on every call.
 */
export async function authedFetch(
  url: string,
  token: string | null,
  init?: RequestInit
): Promise<Response> {
  return fetch(url, {
    ...init,
    headers: {
      ...init?.headers,
      Authorization: `Bearer ${token ?? ""}`,
    },
  });
}
