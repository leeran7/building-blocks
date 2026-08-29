/**
 * Shared request/response plumbing for every `/api/social/**` route —
 * keeps the per-route files focused on their own logic instead of
 * repeating the requireSocialAdmin/error-shape boilerplate 25+ times.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireSocialAdmin, SocialAdminError } from "../middleware/requireSocialAdmin";
import { checkRateLimit, type RateLimitOptions } from "../../lib/rateLimit";
import { sanitizeForResponse } from "../../social/services/safety";
import type { DecodedIdToken } from "firebase-admin/auth";
import type { ToolResult } from "../../social/types";

const REASON_STATUS: Record<string, number> = {
  NOT_FOUND: 404,
  NOT_APPROVED: 409,
  VALIDATION_ERROR: 400,
  FORBIDDEN: 403,
  RATE_LIMITED: 429,
  REAUTH_REQUIRED: 409,
  UNSUPPORTED_BY_PLATFORM: 422,
  PLATFORM_ERROR: 502,
};

/** Maps a service-layer ToolResult onto an HTTP response with a stable, documented status/code per reason. */
export function fromToolResult<T>(result: ToolResult<T>): NextResponse {
  if (result.ok) return jsonOk(result.data);
  return jsonError(result.detail, REASON_STATUS[result.reason] ?? 400, result.reason);
}

export function jsonError(message: string, status: number, code?: string): NextResponse {
  return NextResponse.json({ error: message, ...(code ? { code } : {}) }, { status });
}

export function jsonOk<T>(data: T, init?: ResponseInit): NextResponse {
  return NextResponse.json(sanitizeForResponse(data), init);
}

/**
 * Wraps a route handler with requireSocialAdmin() + uniform error handling
 * (AC-21: every tool call — and every direct API call — runs under the same
 * authorization check). Handlers only need to implement their own logic.
 */
export function withSocialAdmin(
  handler: (request: NextRequest, decoded: DecodedIdToken) => Promise<NextResponse>
) {
  return async (request: NextRequest): Promise<NextResponse> => {
    let decoded: DecodedIdToken;
    try {
      decoded = await requireSocialAdmin(request);
    } catch (err) {
      if (err instanceof SocialAdminError) return err.response;
      return jsonError("Unauthorized", 401);
    }
    try {
      return await handler(request, decoded);
    } catch (err) {
      console.error(`[social-api] ${request.method} ${request.nextUrl.pathname}`, err);
      return jsonError("Internal server error", 500, "INTERNAL_ERROR");
    }
  };
}

/** Same, for dynamic routes with a `params` object (Next 14 App Router — synchronous). */
export function withSocialAdminParams<P>(
  handler: (request: NextRequest, decoded: DecodedIdToken, params: P) => Promise<NextResponse>
) {
  return async (request: NextRequest, ctx: { params: P }): Promise<NextResponse> => {
    let decoded: DecodedIdToken;
    try {
      decoded = await requireSocialAdmin(request);
    } catch (err) {
      if (err instanceof SocialAdminError) return err.response;
      return jsonError("Unauthorized", 401);
    }
    try {
      return await handler(request, decoded, ctx.params);
    } catch (err) {
      console.error(`[social-api] ${request.method} ${request.nextUrl.pathname}`, err);
      return jsonError("Internal server error", 500, "INTERNAL_ERROR");
    }
  };
}

export async function enforceRateLimit(
  request: NextRequest,
  options: Omit<RateLimitOptions, "identifier"> & { identifier: string }
): Promise<NextResponse | null> {
  const rl = await checkRateLimit(options);
  if (!rl.allowed) {
    return jsonError("Too many requests", 429, "RATE_LIMITED");
  }
  return null;
}
