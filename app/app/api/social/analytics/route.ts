import { NextRequest } from "next/server";
import { withSocialAdmin, jsonOk, enforceRateLimit } from "../../../../src/api/social/routeHelpers";
import { getAnalyticsOverview } from "../../../../src/social/services/analyticsIngestion";
import { SOCIAL_PLATFORMS } from "../../../../src/social/types";
import type { SocialPlatform } from "../../../../src/social/types";

export const runtime = "nodejs";

export const GET = withSocialAdmin(async (request: NextRequest, decoded) => {
  const limited = await enforceRateLimit(request, {
    namespace: "social:analytics",
    identifier: decoded.uid,
    max: 120,
    windowSeconds: 60,
    failMode: "open",
  });
  if (limited) return limited;

  const params = request.nextUrl.searchParams;
  const platformParam = params.get("platform");
  const platform = platformParam && (SOCIAL_PLATFORMS as string[]).includes(platformParam) ? (platformParam as SocialPlatform) : undefined;
  const from = params.get("from") ? new Date(params.get("from")!) : undefined;
  const to = params.get("to") ? new Date(params.get("to")!) : undefined;

  const overview = await getAnalyticsOverview(platform, from, to);
  return jsonOk(overview);
});
