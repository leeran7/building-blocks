/**
 * Publishing service (Epic I, Epic O — the highest-consequence code path in
 * this feature). Enforces, independently of what any caller (UI, agent tool,
 * cron sweep) claims:
 *   1. The item must be APPROVED-derived (SCHEDULED, having passed through
 *      APPROVED) — AC-53.
 *   2. At-most-once publish via the ADR-3 claim + DB partial-unique-index
 *      backstop — AC-36.
 *   3. Ambiguous failures re-check via checkPostExists before ever retrying
 *      — AC-37.
 *   4. Rate-limit responses back off rather than tight-loop-retrying — AC-39.
 */

import {
  claimContentItemForPublish,
  releaseContentItemLock,
  markContentItemPublished,
  markContentItemFailed,
  getContentItemById,
} from "../../db/social/contentItems";
import {
  nextAttemptNumber,
  createPublicationAttempt,
  finishPublicationAttempt,
  hasSucceededPublication,
} from "../../db/social/publications";
import { getDecryptedTokens, setAccountStatus } from "../../db/social/socialAccounts";
import { writeAuditLog } from "../../db/social/auditLog";
import { getProvider } from "../providers/registry";
import { errResult, okResult, type ToolResult } from "../types";
import type { SocialContentItem } from "@prisma/client";
import type { PublishRequest } from "../providers/types";

export interface PublishOutcome {
  contentItemId: string;
  status: "PUBLISHED" | "FAILED" | "RATE_LIMITED";
  externalPostId?: string;
  reason?: string;
}

/**
 * Attempts to publish exactly one ContentItem. Safe to call concurrently for
 * the same id — only one caller wins the claim; a losing caller gets a
 * `NOT_APPROVED`-shaped no-op rather than a duplicate post.
 */
export async function publishContentItem(
  id: string,
  initiator: string
): Promise<ToolResult<PublishOutcome>> {
  const existing = await getContentItemById(id);
  if (!existing) return errResult("NOT_FOUND", "Content item not found");

  if (existing.status === "PUBLISHED") {
    // Already published — idempotent no-op response, not an error (AC-36).
    return okResult({ contentItemId: id, status: "PUBLISHED", externalPostId: existing.externalPostId ?? undefined });
  }

  if (existing.status !== "SCHEDULED") {
    return errResult("NOT_APPROVED", `publish_content refuses: item is ${existing.status}, not SCHEDULED (AC-53)`);
  }

  // Defense-in-depth: if a prior attempt already recorded SUCCEEDED (e.g. the
  // claim below was somehow bypassed), never attempt a second publish.
  if (await hasSucceededPublication(id)) {
    return okResult({ contentItemId: id, status: "PUBLISHED" });
  }

  const claimed = await claimContentItemForPublish(id);
  if (!claimed) {
    // Someone else holds the claim right now (concurrent cron tick + manual
    // "publish now" click) — this is expected, not an error.
    return errResult("VALIDATION_ERROR", "Item is currently being published by another process; try again shortly");
  }

  try {
    return await doPublish(existing, initiator);
  } finally {
    await releaseContentItemLock(id);
  }
}

async function doPublish(item: SocialContentItem, initiator: string): Promise<ToolResult<PublishOutcome>> {
  if (!item.socialAccountId) {
    await markContentItemFailed(item.id, "No connected social account is attached to this item");
    return errResult("VALIDATION_ERROR", "No social account attached to this item");
  }

  const tokens = await getDecryptedTokens(item.socialAccountId);
  if (!tokens) {
    await setAccountStatus(item.socialAccountId, "REAUTH_REQUIRED");
    await markContentItemFailed(item.id, "Connected account has no valid tokens — reconnection required");
    await writeAuditLog({
      action: "PUBLISH_CONTENT",
      result: "FAILURE",
      initiator,
      platform: item.platform,
      contentItemId: item.id,
      socialAccountId: item.socialAccountId,
      errorDetail: "REAUTH_REQUIRED",
    });
    return errResult("REAUTH_REQUIRED", "The connected social account needs to be reconnected");
  }

  const provider = getProvider(item.platform);
  const attemptNumber = await nextAttemptNumber(item.id);
  const attempt = await createPublicationAttempt({
    contentItemId: item.id,
    socialAccountId: item.socialAccountId,
    attemptNumber,
  });

  const request: PublishRequest = {
    contentType: item.contentType,
    caption: item.caption ?? undefined,
    title: item.title ?? undefined,
    description: item.description ?? undefined,
    hashtags: item.hashtags,
    threadParts: (item.threadParts as unknown as string[] | null) ?? undefined,
    externalAssetId: undefined, // set by caller when an asset upload has completed
  };

  const result = await provider.publish(tokens.accessToken, request);

  if (result.ok) {
    await finishPublicationAttempt(attempt.id, {
      status: "SUCCEEDED",
      externalPostId: result.data.externalPostId,
    });
    const published = await markContentItemPublished(item.id, result.data.externalPostId);
    await writeAuditLog({
      action: "PUBLISH_CONTENT",
      result: "SUCCESS",
      initiator,
      platform: item.platform,
      contentItemId: item.id,
      socialAccountId: item.socialAccountId,
      metadata: { externalPostId: result.data.externalPostId },
    });
    return okResult({ contentItemId: published.id, status: "PUBLISHED", externalPostId: result.data.externalPostId });
  }

  // AC-37: on an ambiguous failure, check whether the post already exists
  // before treating this as a clean failure eligible for retry.
  if (result.reason === "PLATFORM_ERROR") {
    const existsCheck = await provider.checkPostExists(tokens.accessToken, item.id);
    if (existsCheck.ok && existsCheck.data) {
      await finishPublicationAttempt(attempt.id, { status: "SUCCEEDED", errorMessage: "Recovered via checkPostExists after ambiguous error" });
      const published = await markContentItemPublished(item.id, item.id);
      return okResult({ contentItemId: published.id, status: "PUBLISHED" });
    }
  }

  if (result.reason === "RATE_LIMITED") {
    await finishPublicationAttempt(attempt.id, {
      status: "RATE_LIMITED",
      errorMessage: result.detail,
      rateLimitedUntil: result.retryAfterSeconds ? new Date(Date.now() + result.retryAfterSeconds * 1000) : undefined,
    });
    // AC-39: back off — stay SCHEDULED so the next sweep retries later,
    // rather than failing the item outright or retrying in a tight loop.
    await writeAuditLog({
      action: "PUBLISH_CONTENT",
      result: "FAILURE",
      initiator,
      platform: item.platform,
      contentItemId: item.id,
      socialAccountId: item.socialAccountId,
      errorDetail: `RATE_LIMITED: ${result.detail}`,
    });
    return errResult("RATE_LIMITED" as never, result.detail, { retryAfterSeconds: result.retryAfterSeconds });
  }

  if (result.reason === "REAUTH_REQUIRED") {
    await setAccountStatus(item.socialAccountId, "REAUTH_REQUIRED");
  }

  await finishPublicationAttempt(attempt.id, { status: "FAILED", errorCode: result.reason, errorMessage: result.detail });
  await markContentItemFailed(item.id, result.detail);
  await writeAuditLog({
    action: "PUBLISH_CONTENT",
    result: "FAILURE",
    initiator,
    platform: item.platform,
    contentItemId: item.id,
    socialAccountId: item.socialAccountId,
    errorDetail: `${result.reason}: ${result.detail}`,
  });
  return errResult(result.reason === "UNSUPPORTED_BY_PLATFORM" ? "UNSUPPORTED_BY_PLATFORM" : "PLATFORM_ERROR", result.detail);
}
