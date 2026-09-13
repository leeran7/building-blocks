/**
 * Native/web sign-in via the Capacitor Firebase Authentication plugin.
 *
 * The plugin drives native Sign in with Apple / Google on device (and the
 * Firebase JS SDK popup in the browser dev preview), so one code path serves
 * both. We import the existing web Firebase init (@app/lib/firebase) for its
 * side effect so the JS SDK is initialized on web.
 *
 * On device this requires the native Firebase config files to be dropped in
 * (see mobile/README) — until then these calls no-op/reject gracefully and the
 * app stays in guest mode.
 */
import "@app/lib/firebase";
import {
  FirebaseAuthentication,
  type User,
} from "@capacitor-firebase/authentication";

export type AuthUser = User;

/** Subscribe to auth state; fires immediately with the current user. */
export async function onAuthChange(
  cb: (user: AuthUser | null) => void,
): Promise<() => void> {
  const current = await FirebaseAuthentication.getCurrentUser().catch(() => ({
    user: null,
  }));
  cb(current.user ?? null);
  const handle = await FirebaseAuthentication.addListener(
    "authStateChange",
    (change) => cb(change.user ?? null),
  );
  return () => {
    void handle.remove();
  };
}

/** Current Firebase ID token (Bearer for the Doomstack API), or null. */
export async function getFreshToken(forceRefresh = false): Promise<string | null> {
  try {
    const { token } = await FirebaseAuthentication.getIdToken({ forceRefresh });
    return token ?? null;
  } catch {
    return null;
  }
}

export async function signInWithApple(): Promise<void> {
  await FirebaseAuthentication.signInWithApple();
}

export async function signInWithGoogle(): Promise<void> {
  await FirebaseAuthentication.signInWithGoogle();
}

export async function signInWithEmail(email: string, password: string): Promise<void> {
  await FirebaseAuthentication.signInWithEmailAndPassword({ email, password });
}

export async function createAccountWithEmail(email: string, password: string): Promise<void> {
  await FirebaseAuthentication.createUserWithEmailAndPassword({ email, password });
}

export async function continueAsGuest(): Promise<void> {
  await FirebaseAuthentication.signInAnonymously();
}

export async function signOut(): Promise<void> {
  await FirebaseAuthentication.signOut();
}
