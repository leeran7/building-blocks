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

export function GuestProvider({ onSignIn, children }: { onSignIn: () => void; children: ReactNode }) {
  const value = useMemo(() => ({ onSignIn }), [onSignIn]);
  return <GuestContext.Provider value={value}>{children}</GuestContext.Provider>;
}

/** The guest session, or null for a signed-in player. */
export function useGuest(): GuestValue | null {
  return useContext(GuestContext);
}
