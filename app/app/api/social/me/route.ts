/**
 * GET /api/social/me — admin identity check (§4.1). The frontend calls this
 * once to decide whether to render the /admin/social/** area at all.
 */

import { NextRequest } from "next/server";
import { withSocialAdmin, jsonOk, enforceRateLimit } from "../../../../src/api/social/routeHelpers";

export const runtime = "nodejs";

export const GET = withSocialAdmin(async (request: NextRequest, decoded) => {
  const limited = await enforceRateLimit(request, {
    namespace: "social:me",
    identifier: decoded.uid,
    max: 60,
    windowSeconds: 60,
    failMode: "open",
  });
  if (limited) return limited;

  return jsonOk({ uid: decoded.uid, email: decoded.email ?? null, isSocialAdmin: true });
});
