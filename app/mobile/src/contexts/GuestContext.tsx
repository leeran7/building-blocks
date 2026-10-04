import { createContext, useContext, useMemo, type ReactNode } from "react";

/**
 * Present only inside GuestShell: the shared level and training screens read
 * it to hide account-only parts and to send a guest to sign in.
 */
interface GuestValue {
  /** Leave guest mode for the Sign In screen. */
  onSignIn: () => void;
}

const GuestContext = createContext<GuestValue | null>(null);

/** Where the guest's level map lives (guest home keeps "/"). */
export const GUEST_MAP_PATH = "/levels";

export function GuestProvider({ onSignIn, children }: { onSignIn: () => void; children: ReactNode }) {
  const value = useMemo(() => ({ onSignIn }), [onSignIn]);
  return <GuestContext.Provider value={value}>{children}</GuestContext.Provider>;
}

/** The guest session, or null for a signed-in player. */
export function useGuest(): GuestValue | null {
  return useContext(GuestContext);
}

/** The level map's path: "/" (home) for an account, GUEST_MAP_PATH for a guest. */
export function useMapPath(): string {
  return useGuest() ? GUEST_MAP_PATH : "/";
}
