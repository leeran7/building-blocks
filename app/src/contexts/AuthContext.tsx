"use client";

/**
 * AuthContext — Firebase auth state for the app.
 *
 * Satisfies R-2 (silent token refresh): onIdTokenChanged fires every ~1h
 * when Firebase refreshes the token automatically, keeping the session alive.
 *
 * Exported: useAuth() hook + AuthProvider component.
 * Import only from "use client" components.
 */

import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
} from "react";
import type { User as FirebaseUser } from "firebase/auth";
import { auth } from "../lib/firebase";
import { onIdTokenChanged, signOut as firebaseSignOut } from "firebase/auth";
import { setTokenCookie, clearTokenCookie } from "../lib/authCookie";

interface AuthState {
  user: FirebaseUser | null;
  token: string | null;
  loading: boolean;
  isAnonymous: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthState>({
  user: null,
  token: null,
  loading: true,
  isAnonymous: false,
  signOut: async () => {},
});


export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // onIdTokenChanged fires on: sign-in, sign-out, token refresh (~every 1h)
    const unsubscribe = onIdTokenChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        const idToken = await firebaseUser.getIdToken();
        setUser(firebaseUser);
        setToken(idToken);
        setTokenCookie(idToken); // unblock the /dashboard middleware guard

        // Provision the DB `users` row on EVERY sign-in path (email, Google
        // OAuth, returning session) — not just email/password signup. Anything
        // that foreign-keys to users(id) (climb saves, blocks) fails without it.
        // Anonymous sessions have no email and can't be provisioned; skip them.
        if (!firebaseUser.isAnonymous && firebaseUser.email) {
          fetch("/api/auth/sync", {
            method: "POST",
            headers: { Authorization: `Bearer ${idToken}` },
          }).catch(() => {
            /* best-effort; the climb route also self-heals on save */
          });
        }
      } else {
        setUser(null);
        setToken(null);
        clearTokenCookie();
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const signOut = useCallback(async () => {
    await firebaseSignOut(auth);
    setUser(null);
    setToken(null);
    clearTokenCookie();
  }, []);

  return (
    <AuthContext.Provider value={{ user, token, loading, isAnonymous: user?.isAnonymous ?? false, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  return useContext(AuthContext);
}
