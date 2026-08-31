/**
 * Next.js Edge Middleware — at project root (not in /app/)
 *
 * Handles two concerns:
 * 1. Dashboard auth guard — redirect /dashboard/** to /auth/signin if no token
 * 2. View counting — inject tid cookie and fire-and-forget to internal credit endpoint
 *
 * Auth check is presence-only (cookie/header existence).
 * Actual token verification happens inside route handlers via requireAuth().
 *
 * CRITICAL: View counting is server-side only (AC-9, NFR-S5).
 * No client beacon, no JS fetch to counting endpoints from browser.
 */

import { NextRequest, NextResponse } from "next/server";
import { parsePaidStackSlug } from "./src/game/categories";
import { isBot } from "./src/views/botList";

// Edge-compatible UUID v4 generation
function generateUuid(): string {
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    return crypto.randomUUID();
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export const config = {
  matcher: ["/", "/dashboard/:path*", "/stack/:path*", "/b/:path*"],
};

export default async function middleware(
  request: NextRequest
): Promise<NextResponse> {
  const { pathname } = request.nextUrl;

  // --- Dashboard auth guard (presence-only check) ---
  if (pathname.startsWith("/dashboard")) {
    const token =
      request.cookies.get("firebaseToken")?.value ||
      request.headers.get("authorization")?.replace("Bearer ", "");
    if (!token) {
      // AC-17: Redirect to /auth/signin?redirect=%2Fdashboard
      const signinUrl = new URL("/auth/signin", request.url);
      signinUrl.searchParams.set("redirect", pathname);
      return NextResponse.redirect(signinUrl);
    }
    return NextResponse.next();
  }

  const response = NextResponse.next();

  if (request.method !== "GET") {
    return response;
  }

  const stackSlug = stackSlugFromPath(pathname);
  const recordSlug = recordSlugFromPath(pathname);
  const injectSession = pathname === "/" || stackSlug !== null || recordSlug !== null;
  if (!injectSession) {
    return response;
  }

  // Step 1: Inject / read session cookie (tid)
  let sessionId = request.cookies.get("tid")?.value;
  if (!sessionId) {
    sessionId = generateUuid();
    response.cookies.set("tid", sessionId, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 365, // 365 days
      path: "/",
    });
  }

  // Homepage is marketing — it must not feed a leftover "tech" season.
  // The climb is not in this matcher. Only stack + record pages credit views.
  // Prefetch / RSC must not spend the session's one qualified view.
  if (!stackSlug && !recordSlug) {
    return response;
  }
  if (
    request.headers.get("Next-Router-Prefetch") ||
    request.headers.get("Purpose") === "prefetch"
  ) {
    return response;
  }
  const fetchDest = request.headers.get("sec-fetch-dest");
  if (fetchDest && fetchDest !== "document" && fetchDest !== "empty") {
    return response;
  }

  const ua = request.headers.get("user-agent");
  if (isBot(ua)) {
    return response;
  }

  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    request.headers.get("x-real-ip") ??
    "unknown";

  const baseUrl = request.nextUrl.origin;
  const internalToken = process.env.INTERNAL_TOKEN;
  if (!internalToken) {
    return response;
  }

  const payload: {
    sessionId: string;
    ip: string;
    ua: string;
    ts: number;
    category?: string;
    blockSlug?: string;
  } = {
    sessionId,
    ip,
    ua: ua ?? "",
    ts: Date.now(),
  };
  if (stackSlug) payload.category = stackSlug;
  if (recordSlug) payload.blockSlug = recordSlug;

  fetch(`${baseUrl}/api/internal/credit-view`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Internal-Token": internalToken,
    },
    body: JSON.stringify(payload),
  }).catch(() => {
    // Silent fail — view counting must not block page load
  });

  return response;
}

function stackSlugFromPath(pathname: string): string | null {
  const m = pathname.match(/^\/stack\/([a-z0-9-]+)\/?$/);
  return m ? parsePaidStackSlug(m[1]) : null;
}

function recordSlugFromPath(pathname: string): string | null {
  const m = pathname.match(/^\/b\/([a-z0-9-]+)\/?$/);
  return m?.[1] ?? null;
}
