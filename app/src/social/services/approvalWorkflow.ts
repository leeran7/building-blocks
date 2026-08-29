/**
 * Approval workflow service (Epic G). Every transition writes an audit log
 * entry (AC-50) and is the single implementation called by both REST routes
 * AND agent tools (AC-21) — see src/social/agent/dispatch.ts.
 */

import {
  approveContentItem,
  rejectContentItem,
  getContentItemById,
} from "../../db/social/contentItems";
import { writeAuditLog } from "../../db/social/auditLog";
import { errResult, okResult, type ToolResult } from "../types";
import type { SocialContentItem } from "@prisma/client";

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
