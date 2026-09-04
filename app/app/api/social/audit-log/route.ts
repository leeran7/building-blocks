/**
 * GET /api/social/audit-log (§4.12, Epic N). Newest-first, filterable.
 */

import { NextRequest } from "next/server";
import { withSocialAdmin, jsonOk, enforceRateLimit } from "../../../../src/api/social/routeHelpers";
import { queryAuditLog } from "../../../../src/db/social/auditLog";
import { SOCIAL_PLATFORMS } from "../../../../src/social/types";
import type { SocialPlatform, SocialAuditAction, SocialAuditResult } from "../../../../src/social/types";

export const runtime = "nodejs";

export const GET = withSocialAdmin(async (request: NextRequest, decoded) => {
  const limited = await enforceRateLimit(request, {
    namespace: "social:audit-log",
    identifier: decoded.uid,
    max: 60,
    windowSeconds: 60,
    failMode: "open",
  });
  if (limited) return limited;

  const params = request.nextUrl.searchParams;
  const platformParam = params.get("platform");
  const platform =
    platformParam && (SOCIAL_PLATFORMS as string[]).includes(platformParam)
      ? (platformParam as SocialPlatform)
      : undefined;

  const result = await queryAuditLog({
    platform,
    socialAccountId: params.get("socialAccountId") ?? undefined,
    action: (params.get("action") as SocialAuditAction) ?? undefined,
    result: (params.get("result") as SocialAuditResult) ?? undefined,
    cursor: params.get("cursor") ?? undefined,
    limit: params.get("limit") ? Number(params.get("limit")) : undefined,
  });

  return jsonOk(result);
});
