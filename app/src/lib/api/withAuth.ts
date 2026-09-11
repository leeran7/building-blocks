import { NextRequest, NextResponse } from "next/server";
import { requireAuth, AuthError } from "../requireAuth";

type Handler = (request: NextRequest, uid: string) => Promise<NextResponse>;

/**
 * Wraps an API route handler with Firebase auth validation.
 * Returns 401 if the token is missing or invalid.
 */
export function withAuth(handler: Handler): (request: NextRequest) => Promise<NextResponse> {
  return async (request: NextRequest) => {
    let uid: string;
    try {
      const decoded = await requireAuth(request);
      uid = decoded.uid;
    } catch (err) {
      if (err instanceof AuthError) return err.response;
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return handler(request, uid);
  };
}
