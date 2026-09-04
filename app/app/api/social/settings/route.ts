/**
 * GET/PUT /api/social/settings — automation/approval-mode policy (§4.4,
 * Epic G, ADR-7). Defaults to ALWAYS_REQUIRE_APPROVAL; AUTO_PUBLISH_TRUSTED
 * only ever applies to items whose (platform, contentType) is explicitly
 * whitelisted.
 */

import { NextRequest } from "next/server";
import { withSocialAdmin, jsonOk, jsonError, enforceRateLimit } from "../../../../src/api/social/routeHelpers";
import { getAutomationSettings, updateAutomationSettings } from "../../../../src/db/social/automationSettings";
import { writeAuditLog } from "../../../../src/db/social/auditLog";

export const runtime = "nodejs";

const VALID_APPROVAL_MODES = ["ALWAYS_REQUIRE_APPROVAL", "AUTO_PUBLISH_TRUSTED", "MANUAL_ONLY"];

export const GET = withSocialAdmin(async (request: NextRequest, decoded) => {
  const limited = await enforceRateLimit(request, {
    namespace: "social:settings:get",
    identifier: decoded.uid,
    max: 60,
    windowSeconds: 60,
    failMode: "open",
  });
  if (limited) return limited;

  const settings = await getAutomationSettings();
  return jsonOk({ approvalMode: settings.approvalMode, autoPublishWhitelist: settings.autoPublishWhitelist });
});

export const PUT = withSocialAdmin(async (request: NextRequest, decoded) => {
  const limited = await enforceRateLimit(request, {
    namespace: "social:settings:put",
    identifier: decoded.uid,
    max: 20,
    windowSeconds: 60,
    failMode: "closed",
  });
  if (limited) return limited;

  let body: { approvalMode?: unknown; autoPublishWhitelist?: unknown };
  try {
    body = await request.json();
  } catch {
    return jsonError("Invalid JSON", 400, "VALIDATION_ERROR");
  }

  if (body.approvalMode !== undefined && !VALID_APPROVAL_MODES.includes(body.approvalMode as string)) {
    return jsonError("Invalid approvalMode", 400, "VALIDATION_ERROR");
  }
  if (body.autoPublishWhitelist !== undefined && !Array.isArray(body.autoPublishWhitelist)) {
    return jsonError("autoPublishWhitelist must be an array", 400, "VALIDATION_ERROR");
  }

  const settings = await updateAutomationSettings({
    approvalMode: body.approvalMode as never,
    autoPublishWhitelist: body.autoPublishWhitelist as never,
    updatedByUid: decoded.uid,
  });

  await writeAuditLog({
    action: "AUTOMATION_SETTINGS_UPDATE",
    result: "SUCCESS",
    initiator: decoded.uid,
    metadata: { approvalMode: settings.approvalMode },
  });

  return jsonOk({ approvalMode: settings.approvalMode, autoPublishWhitelist: settings.autoPublishWhitelist });
});
