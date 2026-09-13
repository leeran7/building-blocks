/**
 * Minimal token store for the native client.
 *
 * The game/API layer only needs the current Firebase ID token (as a Bearer).
 * Native sign-in (Apple / Google via Firebase) calls `setIdToken` when the
 * session changes. Before sign-in the token is null and the auth gate keeps the
 * player on the Sign In screen, so no API calls are made unauthenticated.
 */
let currentToken: string | null = null;

export function setIdToken(token: string | null): void {
  currentToken = token;
}

export function getIdToken(): string | null {
  return currentToken;
}

export function isSignedIn(): boolean {
  return currentToken !== null;
}
