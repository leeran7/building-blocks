/**
 * GET /api/social/accounts — connected TikTok/X/YouTube accounts (§4.2).
 * Never includes token fields (AC-8) — listSocialAccounts()/toPublicAccount
 * already strip them at the DB-access layer.
 */

import { NextRequest } from "next/server";
import { withSocialAdmin, jsonOk, enforceRateLimit } from "../../../../src/api/social/routeHelpers";
import { listSocialAccounts } from "../../../../src/db/social/socialAccounts";

export const runtime = "nodejs";

export const GET = withSocialAdmin(async (request: NextRequest, decoded) => {
  const limited = await enforceRateLimit(request, {
    namespace: "social:accounts:list",
    identifier: decoded.uid,
    max: 60,
    windowSeconds: 60,
    failMode: "open",
  });
  if (limited) return limited;

  const accounts = await listSocialAccounts();
  return jsonOk({ accounts });
});
