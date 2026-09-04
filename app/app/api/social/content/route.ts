/**
 * GET /api/social/content — calendar/queue listing (§4.6, Epics G/H).
 * Dashboard hot path — fails OPEN on rate-limit backend errors (§9).
 */

import { NextRequest } from "next/server";
import { withSocialAdmin, jsonOk, enforceRateLimit } from "../../../../src/api/social/routeHelpers";
import { listContentItems } from "../../../../src/db/social/contentItems";
import { SOCIAL_PLATFORMS } from "../../../../src/social/types";
import type { SocialPlatform, SocialContentStatus } from "../../../../src/social/types";

export const runtime = "nodejs";

const VALID_STATUSES: SocialContentStatus[] = [
  "IDEA",
  "DRAFT",
  "READY_FOR_REVIEW",
  "APPROVED",
  "SCHEDULED",
  "PUBLISHED",
  "REJECTED",
  "FAILED",
];

export const GET = withSocialAdmin(async (request: NextRequest, decoded) => {
  const limited = await enforceRateLimit(request, {
    namespace: "social:content:list",
    identifier: decoded.uid,
    max: 120,
    windowSeconds: 60,
    failMode: "open",
  });
  if (limited) return limited;

  const params = request.nextUrl.searchParams;
  const statusParam = params.get("status");
  const platformParam = params.get("platform");
  const fromParam = params.get("from");
  const toParam = params.get("to");

  const items = await listContentItems({
    status: statusParam && VALID_STATUSES.includes(statusParam as SocialContentStatus) ? (statusParam as SocialContentStatus) : undefined,
    platform: platformParam && (SOCIAL_PLATFORMS as string[]).includes(platformParam) ? (platformParam as SocialPlatform) : undefined,
    from: fromParam ? new Date(fromParam) : undefined,
    to: toParam ? new Date(toParam) : undefined,
    includeDeleted: params.get("includeDeleted") === "true",
  });

  return jsonOk({ items });
});
