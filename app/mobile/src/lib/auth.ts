/**
 * Minimal token store for the native client.
 *
 * The game/API layer only needs the current Firebase ID token (as a Bearer).
 * Native sign-in (Apple / Google via Firebase) will call `setIdToken` when the
 * session changes; until that lands the app runs as a guest (token = null),
 * which the backend already tolerates for climb saves.
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
