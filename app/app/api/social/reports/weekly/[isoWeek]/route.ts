import { withSocialAdminParams, jsonOk, jsonError, enforceRateLimit } from "../../../../../../src/api/social/routeHelpers";
import { getWeeklyRecommendation } from "../../../../../../src/db/social/aiRecommendations";

export const runtime = "nodejs";

export const GET = withSocialAdminParams<{ isoWeek: string }>(async (request, decoded, params) => {
  const limited = await enforceRateLimit(request, {
    namespace: "social:reports:weekly:get",
    identifier: decoded.uid,
    max: 60,
    windowSeconds: 60,
    failMode: "open",
  });
  if (limited) return limited;

  const recommendation = await getWeeklyRecommendation(decodeURIComponent(params.isoWeek));
  if (!recommendation) return jsonError("No report for that ISO week yet", 404, "NOT_FOUND");
  return jsonOk(recommendation);
});
