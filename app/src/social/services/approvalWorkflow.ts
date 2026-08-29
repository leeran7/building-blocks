/**
 * Approval workflow service (Epic G). Every transition writes an audit log
 * entry (AC-50) and is the single implementation called by both REST routes
 * AND agent tools (AC-21) — see src/social/agent/dispatch.ts.
 */

import {
  approveContentItem,
  rejectContentItem,
  getContentItemById,
  submitContentItemForReview,
  autoApproveContentItemFromDraft,
} from "../../db/social/contentItems";
import { getAutomationSettings, isAutoPublishEligible } from "../../db/social/automationSettings";
import { getBrandProfile } from "../../db/social/brandProfile";
import { writeAuditLog } from "../../db/social/auditLog";
import { checkAvoidTerms, validateCaptionLength } from "./safety";
import { errResult, okResult, type ToolResult } from "../types";
import type { SocialContentItem } from "@prisma/client";

function hasPublishableText(item: SocialContentItem): boolean {
  const threadParts = (item.threadParts as unknown as string[] | null) ?? [];
  return Boolean(
    item.caption?.trim() ||
      item.title?.trim() ||
      item.hook?.trim() ||
      item.script?.trim() ||
      threadParts.some((part) => part.trim().length > 0)
  );
}

function collectTextForAvoidCheck(item: SocialContentItem): string {
  const threadParts = (item.threadParts as unknown as string[] | null) ?? [];
  return [item.hook, item.script, item.caption, item.description, item.title, ...threadParts]
    .filter(Boolean)
    .join(" ");
}

export async function submitContentForReview(
  id: string,
  uid: string
): Promise<ToolResult<SocialContentItem>> {
  const existing = await getContentItemById(id);
  if (!existing) return errResult("NOT_FOUND", "Content item not found");

  if (existing.status !== "IDEA" && existing.status !== "DRAFT") {
    return errResult(
      "VALIDATION_ERROR",
      `Cannot submit item in status ${existing.status} — only IDEA or DRAFT items may be submitted`
    );
  }

  if (!canMoveToReadyForReview(existing)) {
    return errResult("VALIDATION_ERROR", "Item contains avoid-listed terms and cannot be submitted for review");
  }

  const brand = await getBrandProfile();
  const avoidCheck = checkAvoidTerms(collectTextForAvoidCheck(existing), brand?.topicsToAvoid ?? []);
  if (avoidCheck.blocked) {
    return errResult(
      "VALIDATION_ERROR",
      `Item contains avoid-listed terms: ${avoidCheck.matchedTerms.join(", ")}`
    );
  }

  if (!hasPublishableText(existing)) {
    return errResult("VALIDATION_ERROR", "Item must include caption, title, hook, script, or thread text before submission");
  }

  const captionCheck = validateCaptionLength(existing.platform, existing.caption ?? existing.description);
  if (!captionCheck.valid) {
    return errResult(
      "VALIDATION_ERROR",
      `Caption is ${captionCheck.length} characters; limit is ${captionCheck.limit} for ${existing.platform}`
    );
  }

  const settings = await getAutomationSettings();
  const autoApprove = isAutoPublishEligible(settings, existing.platform, existing.contentType);
  const updated = autoApprove
    ? await autoApproveContentItemFromDraft(id, uid)
    : await submitContentItemForReview(id);

  if (!updated) {
    return errResult(
      "VALIDATION_ERROR",
      `Cannot submit item in status ${existing.status} — it may be blocked or already submitted`
    );
  }

  await writeAuditLog({
    action: autoApprove ? "AUTO_PUBLISH" : "UPDATE_CONTENT",
    result: "SUCCESS",
    initiator: uid,
    platform: updated.platform,
    contentItemId: updated.id,
    metadata: autoApprove
      ? { transition: "AUTO_APPROVED" }
      : { transition: "READY_FOR_REVIEW" },
  });

  return okResult(updated);
}

export async function approveContent(id: string, uid: string): Promise<ToolResult<SocialContentItem>> {
  const existing = await getContentItemById(id);
  if (!existing) return errResult("NOT_FOUND", "Content item not found");

  const updated = await approveContentItem(id, uid);
  if (!updated) {
    return errResult(
      "VALIDATION_ERROR",
      `Cannot approve item in status ${existing.status} — only READY_FOR_REVIEW items may be approved`
    );
  }

  await writeAuditLog({
    action: "APPROVE_CONTENT",
    result: "SUCCESS",
    initiator: uid,
    platform: updated.platform,
    contentItemId: updated.id,
  });
  return okResult(updated);
}

export async function rejectContent(
  id: string,
  uid: string,
  reason?: string
): Promise<ToolResult<SocialContentItem>> {
  const existing = await getContentItemById(id);
  if (!existing) return errResult("NOT_FOUND", "Content item not found");

  const updated = await rejectContentItem(id, uid, reason);
  if (!updated) {
    return errResult(
      "VALIDATION_ERROR",
      `Cannot reject item in status ${existing.status}`
    );
  }

  await writeAuditLog({
    action: "REJECT_CONTENT",
    result: "SUCCESS",
    initiator: uid,
    platform: updated.platform,
    contentItemId: updated.id,
    metadata: reason ? { reason } : undefined,
  });
  return okResult(updated);
}

/**
 * AC-13: a draft flagged with an avoid-listed term must never be movable to
 * READY_FOR_REVIEW. This is the deterministic gate every "submit for review"
 * action must call.
 */
export function canMoveToReadyForReview(item: Pick<SocialContentItem, "blockedByAvoidTerm">): boolean {
  return !item.blockedByAvoidTerm;
}
