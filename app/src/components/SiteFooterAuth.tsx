"use client";

/**
 * SiteFooterAuth -- client island that gates the CTA band on auth state.
 *
 * Shows the full Footer with its "Get started" marketing band to signed-out
 * visitors, and the compact footer (links + legal only) once a user is signed
 * in. Gated on !loading too so the CTA never flashes on authenticated screens
 * before auth resolves.
 */

import { useAuth } from "../contexts/AuthContext";
import { Footer } from "./LandingPage/Footer";

export function SiteFooterAuth() {
  const { user, loading } = useAuth();
  return <Footer showCta={!loading && !user} />;
}
