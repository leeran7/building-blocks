/**
 * POST /api/social/content/generate — Content Studio (§4.5, Epic D).
 * All-or-nothing: on any generation failure, zero ContentItems are created
 * (AC-16 — generateContentForPlatforms() enforces this in a transaction).
 */

import { NextRequest } from "next/server";
import { withSocialAdmin, jsonOk, jsonError, enforceRateLimit } from "../../../../../src/api/social/routeHelpers";
import { generateContentForPlatforms, ContentGenerationError } from "../../../../../src/social/services/contentGeneration";
import { SOCIAL_PLATFORMS } from "../../../../../src/social/types";
import type { SocialPlatform } from "../../../../../src/social/types";
import { prisma } from "../../../../../src/db/client";

export const runtime = "nodejs";

// Idempotency-Key support (§4.5): a repeated key within 5 minutes returns
// the original batch instead of generating (and billing for) a second one.
const IDEMPOTENCY_WINDOW_MS = 5 * 60 * 1000;
const idempotencyCache = new Map<string, { at: number; promptBatchId: string }>();

export const POST = withSocialAdmin(async (request: NextRequest, decoded) => {
  const limited = await enforceRateLimit(request, {
    namespace: "social:content:generate",
    identifier: decoded.uid,
    max: 10,
    windowSeconds: 60,
    failMode: "closed",
  });
  if (limited) return limited;

  let body: { prompt?: unknown; platforms?: unknown };
  try {
    body = await request.json();
  } catch {
    return jsonError("Invalid JSON", 400, "VALIDATION_ERROR");
  }

  if (typeof body.prompt !== "string" || !body.prompt.trim()) {
    return jsonError("prompt is required", 400, "VALIDATION_ERROR");
  }
  if (!Array.isArray(body.platforms) || body.platforms.length === 0) {
    return jsonError("platforms must be a non-empty array", 400, "VALIDATION_ERROR");
  }
  const platforms = body.platforms as unknown[];
  if (!platforms.every((p) => typeof p === "string" && (SOCIAL_PLATFORMS as string[]).includes(p))) {
    return jsonError("platforms contains an unknown value", 400, "VALIDATION_ERROR");
  }

  const idempotencyKey = request.headers.get("Idempotency-Key");
  if (idempotencyKey) {
    const cached = idempotencyCache.get(`${decoded.uid}:${idempotencyKey}`);
    if (cached && Date.now() - cached.at < IDEMPOTENCY_WINDOW_MS) {
      const items = await prisma.socialContentItem.findMany({ where: { promptBatchId: cached.promptBatchId } });
      return jsonOk({ promptBatchId: cached.promptBatchId, items });
    }
  }

  try {
    const result = await generateContentForPlatforms({
      prompt: body.prompt,
      platforms: platforms as SocialPlatform[],
      createdByUid: decoded.uid,
    });
    if (idempotencyKey) {
      idempotencyCache.set(`${decoded.uid}:${idempotencyKey}`, { at: Date.now(), promptBatchId: result.promptBatchId });
    }
    return jsonOk(result);
  } catch (err) {
    if (err instanceof ContentGenerationError) {
      return jsonError(err.message, 422, "GENERATION_FAILED");
    }
    throw err;
  }
});
