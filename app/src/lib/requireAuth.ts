/**
 * Server-side auth helper for route handlers.
 *
 * Extracts the Bearer token from the Authorization header, verifies it with
 * Firebase Admin, and returns the decoded token. Throws a structured 401
 * response if the token is missing or invalid.
 *
 * Usage in route handlers:
 *   const decoded = await requireAuth(request);
 *   // decoded.uid is the verified Firebase UID
 */

import { NextRequest, NextResponse } from "next/server";
import { verifyIdToken } from "./firebaseAdmin";
import type { DecodedIdToken } from "firebase-admin/auth";

export class AuthError extends Error {
  readonly response: NextResponse;

  constructor(message: string, code: string, status: number) {
    super(message);
    this.name = "AuthError";
    this.response = NextResponse.json(
      { error: message, code },
      { status }
    );
  }
}

/**
 * Extract and verify the Bearer token from the Authorization header.
 *
 * @param request - incoming Next.js request
 * @returns decoded Firebase token
 * @throws AuthError with a pre-built 401 NextResponse if auth fails
 */
export async function requireAuth(request: NextRequest): Promise<DecodedIdToken> {
  const authHeader = request.headers.get("authorization");
  const token = authHeader?.startsWith("Bearer ")
    ? authHeader.slice(7).trim()
    : null;

  if (!token) {
    throw new AuthError(
      "Missing or malformed Authorization header",
      "UNAUTHORIZED",
      401
    );
  }

  try {
    return await verifyIdToken(token);
  } catch (err) {
    // Log at error level without exposing internals to the client
    console.error("[requireAuth] Token verification failed:", err);
    throw new AuthError("Invalid or expired token", "UNAUTHORIZED", 401);
  }
}
