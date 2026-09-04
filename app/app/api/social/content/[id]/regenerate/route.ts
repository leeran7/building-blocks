/**
 * POST /api/social/content/:id/regenerate — AC-33: same id, `version`
 * incremented, history preserved via the AgentTask/audit trail rather than
 * a new row. Regenerates whichever field(s) the caller specifies (defaults
 * to all text fields the item already has set).
 */

import { withSocialAdminParams, jsonOk, jsonError, fromToolResult, enforceRateLimit } from "../../../../../../src/api/social/routeHelpers";
import { regenerateContentField, ContentGenerationError, type RegeneratableField } from "../../../../../../src/social/services/contentGeneration";
import { getContentItemById } from "../../../../../../src/db/social/contentItems";

export const runtime = "nodejs";

const ALL_FIELDS: RegeneratableField[] = ["script", "caption", "title", "description"];

export const POST = withSocialAdminParams<{ id: string }>(async (request, decoded, params) => {
  const limited = await enforceRateLimit(request, {
    namespace: "social:content:regenerate",
    identifier: decoded.uid,
    max: 15,
    windowSeconds: 60,
    failMode: "closed",
  });
  if (limited) return limited;

  let body: { field?: unknown; instructions?: unknown } = {};
  try {
    body = await request.json();
  } catch {
    // no body — regenerate every field the item currently has set
  }

  const existing = await getContentItemById(params.id);
  if (!existing) return jsonError("Content item not found", 404, "NOT_FOUND");

  const instructions = typeof body.instructions === "string" ? body.instructions : undefined;
  const requestedField = typeof body.field === "string" ? (body.field as RegeneratableField) : undefined;
  if (requestedField && !ALL_FIELDS.includes(requestedField)) {
    return jsonError("Invalid field", 400, "VALIDATION_ERROR");
  }

  const fields = requestedField ? [requestedField] : ALL_FIELDS.filter((f) => existing[f]);
  if (fields.length === 0) {
    return jsonError("Item has no regeneratable fields set", 400, "VALIDATION_ERROR");
  }

  try {
    let lastResult = await regenerateContentField(params.id, fields[0], instructions, decoded.uid);
    if (!lastResult.ok) return fromToolResult(lastResult);
    for (let i = 1; i < fields.length; i++) {
      lastResult = await regenerateContentField(params.id, fields[i], instructions, decoded.uid);
      if (!lastResult.ok) return fromToolResult(lastResult);
    }
    return jsonOk(lastResult.data);
  } catch (err) {
    if (err instanceof ContentGenerationError) return jsonError(err.message, 422, "GENERATION_FAILED");
    throw err;
  }
});
