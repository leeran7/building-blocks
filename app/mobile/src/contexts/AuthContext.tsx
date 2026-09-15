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
  getFreshToken,
  signInWithApple,
  signInWithGoogle,
  signInWithEmail,
  createAccountWithEmail,
  signOut as fbSignOut,
  type AuthUser,
} from "../lib/firebaseAuth";
import { setIdToken } from "../lib/auth";
import { apiFetch } from "../lib/api";

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
 * from the Capacitor Firebase plugin. On every auth change it refreshes the ID
 * token into the shared token store (so apiFetch attaches the Bearer) and
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
        const token = await getFreshToken();
        setIdToken(token);
        if (!synced.current && !u.isAnonymous && u.email && token) {
          synced.current = true;
          // Best-effort DB provisioning; the climb save self-heals otherwise.
          apiFetch("/api/auth/sync", { method: "POST" }).catch(() => {});
        }
      } else {
        setIdToken(null);
        synced.current = false;
      }
    }).then((u) => {
      unsub = u;
    });
    return () => unsub();
  }, []);

  const signOut = useCallback(async () => {
    // Sign out optimistically: drop the local session first so the UI returns to
    // the auth gate immediately (critical for account delete — the row is
    // already gone server-side), then let the Firebase SDK sign-out settle in
    // the background. Nulling the token first also means a rejected fbSignOut()
    // (e.g. offline) can never leave a live cached token behind.
    setIdToken(null);
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
