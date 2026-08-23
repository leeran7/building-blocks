/**
 * Admin authentication guard (NFR-S3).
 *
 * All admin routes call this first.
 * Checks: Authorization: Bearer {ADMIN_SECRET}
 *
 * Returns a 401 NextResponse if the token is missing or invalid.
 */

import { NextRequest, NextResponse } from "next/server";

/**
 * Verify admin bearer token.
 * Throws a 401 NextResponse if unauthorised.
 *
 * Usage in API route:
 *   const authError = requireAdmin(request);
 *   if (authError) return authError;
 */
export function requireAdmin(request: NextRequest): NextResponse | null {
  const adminSecret = process.env.ADMIN_SECRET;

  if (!adminSecret) {
    console.error("ADMIN_SECRET is not configured");
    return NextResponse.json({ error: "Admin not configured" }, { status: 500 });
  }

  const authHeader = request.headers.get("authorization");

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return NextResponse.json(
      { error: "Unauthorized: missing Bearer token" },
      { status: 401 }
    );
  }

  const token = authHeader.slice(7); // Remove "Bearer "

  // Constant-time comparison to prevent timing attacks
  if (!constantTimeEqual(token, adminSecret)) {
    return NextResponse.json(
      { error: "Unauthorized: invalid token" },
      { status: 401 }
    );
  }

  return null; // Authorised
}

/**
 * Constant-time string comparison to prevent timing attacks.
 */
function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}
