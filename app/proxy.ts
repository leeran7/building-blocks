/**
 * Next.js Proxy (formerly Edge Middleware) — at project root (not in /app/)
 *
 * Renamed from middleware.ts → proxy.ts for Next.js 16 (the `middleware` file
 * convention is deprecated in favor of `proxy`).
 *
 * Presence-only auth guards (cookie/header existence). Actual token
 * verification happens inside route handlers via requireAuth() /
 * requireSocialAdmin().
 *   1. Dashboard auth guard — redirect /dashboard/** to /auth/signin if no token
 *   2. Social admin UI guard — redirect /admin/social/** likewise
 *
 * (The paid-stacks server-side view-counting concern was removed with that
 * feature.)
 */

import { NextRequest, NextResponse } from "next/server";

export const config = {
  matcher: ["/dashboard/:path*", "/admin/social/:path*"],
};

export default function proxy(request: NextRequest): NextResponse {
  const { pathname } = request.nextUrl;

  const token =
    request.cookies.get("firebaseToken")?.value ||
    request.headers.get("authorization")?.replace("Bearer ", "");

  if (!token) {
    const signinUrl = new URL("/auth/signin", request.url);
    signinUrl.searchParams.set("redirect", pathname);
    return NextResponse.redirect(signinUrl);
  }

  return NextResponse.next();
}
