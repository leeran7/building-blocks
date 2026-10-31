"use client";

/**
 * SiteFooterAuth -- client island that gates the CTA band on auth state.
 *
 * Shows the full Footer with its "Get started" marketing band to signed-out
 * visitors on marketing pages, and the compact footer (links + legal only)
 * everywhere else and once a user is signed in. Gated on !loading too so the
 * CTA never flashes on authenticated screens before auth resolves.
 */

import { usePathname } from "next/navigation";
import { useAuth } from "../contexts/AuthContext";
import { Footer } from "./LandingPage/Footer";

/**
 * Pages that pitch the game, where "Your move. Their lava." is the next step.
 * Anywhere else (sign-in, legal, error and status pages, the game itself) it
 * would compete with the page's own action, so it is an allow-list: an
 * unknown path (the 404 page) gets the compact footer.
 */
const CTA_PATHS: ReadonlySet<string> = new Set(["/", "/climb", "/duel", "/duel/leaderboard", "/rules"]);

export function showsFooterCta(pathname: string | null): boolean {
  return pathname !== null && CTA_PATHS.has(pathname);
}

export function SiteFooterAuth() {
  const { user, loading } = useAuth();
  const pathname = usePathname();
  return <Footer showCta={!loading && !user && showsFooterCta(pathname)} />;
}
