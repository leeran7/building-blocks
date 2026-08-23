/**
 * Next.js Edge Middleware — at project root (not in /app/)
 *
 * Runs on every GET request to /.
 * 1. Inject tid session cookie (UUID v4) if missing
 * 2. Fire-and-forget to internal view-count route
 *
 * CRITICAL: View counting is server-side only (AC-9, NFR-S5).
 * No client beacon, no JS fetch to counting endpoints from browser.
 */

import { NextRequest, NextResponse } from "next/server";

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

// Bot UA patterns (edge-compatible — no require())
const BOT_PATTERNS = [
  "googlebot", "bingbot", "slurp", "duckduckbot", "baiduspider",
  "yandexbot", "facebookexternalhit", "twitterbot", "linkedinbot",
  "whatsapp", "telegrambot", "applebot", "headlesschrome", "headless",
  "phantomjs", "selenium", "puppeteer", "playwright", "webdriver",
  "automation", "crawler", "spider", "scraper", "robot", "uptimerobot",
  "pingdom", "prerender", "rendertron", "slackbot", "discordbot",
];

function isBotUa(ua: string | null | undefined): boolean {
  if (!ua || ua.trim() === "") return true;
  const lower = ua.toLowerCase();
  return BOT_PATTERNS.some((p) => lower.includes(p));
}

export const config = {
  matcher: ["/"],
};

export default async function middleware(
  request: NextRequest
): Promise<NextResponse> {
  const response = NextResponse.next();

  // Only count views for the homepage (GET /)
  if (
    request.method !== "GET" ||
    request.nextUrl.pathname !== "/"
  ) {
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

  // Step 2: Early bot filter (edge — no Redis needed)
  const ua = request.headers.get("user-agent");
  if (isBotUa(ua)) {
    return response;
  }

  // Steps 3-6: Fire-and-forget to internal credit endpoint
  // Internal route runs in Node.js (has Prisma + Redis access)
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    request.headers.get("x-real-ip") ??
    "unknown";

  const baseUrl = request.nextUrl.origin;
  const internalToken = process.env.INTERNAL_TOKEN;
  if (!internalToken) {
    // Fail closed — misconfigured server must not credit views
    return response;
  }

  // Non-blocking fire-and-forget
  fetch(`${baseUrl}/api/internal/credit-view`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Internal-Token": internalToken,
    },
    body: JSON.stringify({ sessionId, ip, ua: ua ?? "", ts: Date.now() }),
  }).catch(() => {
    // Silent fail — view counting must not block page load
  });

  return response;
}
