/**
 * GET/PATCH/DELETE /api/social/content/:id (§4.6). PATCH is a generic field
 * edit; a `scheduledAt` change is routed through rescheduleContent() so
 * AC-31's "updates in place, never duplicated" guarantee and its audit log
 * entry are never bypassed by a raw field PATCH. DELETE is a soft delete
 * only — it never touches a platform-side post (ADR-9).
 */

import {
  withSocialAdminParams,
  jsonOk,
  jsonError,
  fromToolResult,
  enforceRateLimit,
} from "../../../../../src/api/social/routeHelpers";
import { getContentItemWithRelations, getContentItemById, updateContentItem, softDeleteContentItem } from "../../../../../src/db/social/contentItems";
import { rescheduleContent } from "../../../../../src/social/services/scheduling";
import { writeAuditLog } from "../../../../../src/db/social/auditLog";

export const runtime = "nodejs";

const EDITABLE_FIELDS = ["title", "hook", "script", "caption", "description", "hashtags", "cta", "visualDirection"] as const;

export const GET = withSocialAdminParams<{ id: string }>(async (request, decoded, params) => {
  const limited = await enforceRateLimit(request, {
    namespace: "social:content:get",
    identifier: decoded.uid,
    max: 120,
    windowSeconds: 60,
    failMode: "open",
  });
  if (limited) return limited;

  const item = await getContentItemWithRelations(params.id);
  if (!item) return jsonError("Content item not found", 404, "NOT_FOUND");
  return jsonOk(item);
});

export const PATCH = withSocialAdminParams<{ id: string }>(async (request, decoded, params) => {
  // Entire route fails closed — it can touch scheduling, not worth
  // splitting rate-limit behavior per field.
  const limited = await enforceRateLimit(request, {
    namespace: "social:content:patch",
    identifier: decoded.uid,
    max: 60,
    windowSeconds: 60,
    failMode: "closed",
  });
  if (limited) return limited;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return jsonError("Invalid JSON", 400, "VALIDATION_ERROR");
  }

  const existing = await getContentItemById(params.id);
  if (!existing) return jsonError("Content item not found", 404, "NOT_FOUND");

  if (typeof body.scheduledAt === "string") {
    const socialAccountId = typeof body.socialAccountId === "string" ? body.socialAccountId : undefined;
    const result = await rescheduleContent(params.id, new Date(body.scheduledAt), decoded.uid, socialAccountId);
    return fromToolResult(result);
  }

  const patch: Record<string, unknown> = {};
  for (const field of EDITABLE_FIELDS) {
    if (body[field] !== undefined) patch[field] = body[field];
  }
  if (Object.keys(patch).length === 0) {
    return jsonError("No editable fields provided", 400, "VALIDATION_ERROR");
  }

  const updated = await updateContentItem(params.id, patch);
  await writeAuditLog({
    action: "UPDATE_CONTENT",
    result: "SUCCESS",
    initiator: decoded.uid,
    platform: updated.platform,
    contentItemId: updated.id,
    metadata: { fields: Object.keys(patch) },
  });
  return jsonOk(updated);
});

export const DELETE = withSocialAdminParams<{ id: string }>(async (request, decoded, params) => {
  const limited = await enforceRateLimit(request, {
    namespace: "social:content:delete",
    identifier: decoded.uid,
    max: 20,
    windowSeconds: 60,
    failMode: "closed",
  });
  if (limited) return limited;

  let body: { confirm?: unknown } = {};
  try {
    body = await request.json();
  } catch {
    // missing body is treated as unconfirmed below
  }
  if (body.confirm !== true) {
    return jsonError("Explicit confirm: true is required to delete a content item", 400, "VALIDATION_ERROR");
  }

  const existing = await getContentItemById(params.id);
  if (!existing) return jsonError("Content item not found", 404, "NOT_FOUND");

  const updated = await softDeleteContentItem(params.id);
  await writeAuditLog({
    action: "DELETE_CONTENT",
    result: "SUCCESS",
    initiator: decoded.uid,
    platform: existing.platform,
    contentItemId: params.id,
  });

  return jsonOk({ id: params.id, deletedAt: updated.deletedAt });
});
