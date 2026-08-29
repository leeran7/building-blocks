/**
 * POST /api/social/reports/weekly/generate — the "run it now" button (§4.11).
 * Calls the SAME jobRunner function the cron route calls, with the same
 * isoWeek idempotency (AC-47).
 */

import { withSocialAdmin, jsonOk, enforceRateLimit } from "../../../../../../src/api/social/routeHelpers";
import { runWeeklyStrategyJob } from "../../../../../../src/social/agent/jobRunner";
import { currentIsoWeek } from "../../../../../../src/social/isoWeek";

export const runtime = "nodejs";

export const POST = withSocialAdmin(async (request, decoded) => {
  const limited = await enforceRateLimit(request, {
    namespace: "social:reports:weekly:generate",
    identifier: decoded.uid,
    max: 5,
    windowSeconds: 60,
    failMode: "closed",
  });
  if (limited) return limited;

  let body: { isoWeek?: unknown } = {};
  try {
    body = await request.json();
  } catch {
    // isoWeek defaults to the current ISO week
  }
  const isoWeek = typeof body.isoWeek === "string" && body.isoWeek ? body.isoWeek : currentIsoWeek();

  const result = await runWeeklyStrategyJob(isoWeek, decoded.uid);
  return jsonOk(result);
});
