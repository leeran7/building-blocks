"use client";

/**
 * NavbarAuth -- client island for the auth-dependent section of the Navbar.
 *
 * Renders the loading skeleton, the signed-in AccountMenu, or the
 * Sign in / Get started links depending on auth state. Extracted so the
 * Navbar shell (logo, static nav links) can remain a server component.
 */

import Link from "next/link";
import { useAuth } from "../contexts/AuthContext";
import { AccountMenu } from "./AccountMenu";
import { SIGNIN_HREF, SIGNUP_HREF } from "./navLinks";

const PILL =
  "inline-flex items-center justify-center rounded-full px-4 min-h-[38px] text-sm font-semibold tracking-tight transition-[filter,transform,scale] hover:brightness-110 active:scale-[0.98] focus-visible:outline-hidden";
const GHOST =
  "inline-flex items-center justify-center px-3 min-h-[38px] font-mono text-xs uppercase tracking-[0.14em] text-text-muted hover:text-text-primary transition-colors";

export function NavbarAuth() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div
        className="h-9 w-40 rounded-full bg-elevated animate-pulse"
        aria-hidden="true"
      />
    );
  }

  if (user) {
    return <AccountMenu />;
  }

  return (
    <>
      <Link href={SIGNIN_HREF} className={GHOST}>
        Sign in
      </Link>
      <Link href={SIGNUP_HREF} className={`${PILL} bg-signal text-void`}>
        Get started
      </Link>
    </>
  );
}
