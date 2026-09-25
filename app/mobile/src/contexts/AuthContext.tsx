import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  onAuthChange,
  signInWithApple,
  signInWithGoogle,
  signInWithEmail,
  createAccountWithEmail,
  signOut as fbSignOut,
  type AuthUser,
} from "../lib/firebaseAuth";
import { apiFetch } from "../lib/api";
import { initPushNotifications, unregisterPush } from "../lib/pushNotifications";

interface AuthState {
  user: AuthUser | null;
  loading: boolean;
  isAnonymous: boolean;
  signInApple: () => Promise<void>;
  signInGoogle: () => Promise<void>;
  signInEmail: (email: string, password: string) => Promise<void>;
  createAccount: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const Ctx = createContext<AuthState>({
  user: null,
  loading: true,
  isAnonymous: false,
  signInApple: async () => {},
  signInGoogle: async () => {},
  signInEmail: async () => {},
  createAccount: async () => {},
  signOut: async () => {},
});

/**
 * SPA auth provider. Mirrors the web AuthContext contract but sources state
 * from the Capacitor Firebase plugin. apiFetch obtains a fresh native token on
 * every request; this provider only tracks the auth state (user / loading) and
 * provisions the backend `users` row once per session for non-anonymous users.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const synced = useRef(false);

  useEffect(() => {
    let unsub = () => {};
    onAuthChange(async (u) => {
      setUser(u);
      setLoading(false);
      if (u) {
        if (!synced.current && !u.isAnonymous && u.email) {
          synced.current = true;
          apiFetch("/api/auth/sync", { method: "POST" }).catch(() => {});
          initPushNotifications().catch(() => {});
        }
      } else {
        synced.current = false;
      }
    }).then((u) => {
      unsub = u;
    });
    return () => unsub();
  }, []);

  const signOut = useCallback(async () => {
    await unregisterPush().catch(() => {});
    setUser(null);
    try {
      await fbSignOut();
    } catch {
      // Already locally signed out; the onAuthChange listener reconciles later.
    }
  }, []);

  const value = useMemo<AuthState>(
    () => ({
      user,
      loading,
      isAnonymous: user?.isAnonymous ?? false,
      signInApple: signInWithApple,
      signInGoogle: signInWithGoogle,
      signInEmail: signInWithEmail,
      createAccount: createAccountWithEmail,
      signOut,
    }),
    [user, loading, signOut],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthState {
  return useContext(Ctx);
}
