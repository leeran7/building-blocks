/**
 * Scheduling service (Epic H/I, AC-30..39). Reschedule always updates the
 * existing ContentItem row in place — there is no separate schedule table to
 * duplicate into (ADR-6), so "never duplicated into a second live schedule"
 * (AC-31) is true by construction.
 */

import { scheduleContentItem, getContentItemById, updateContentItem } from "../../db/social/contentItems";
import { writeAuditLog } from "../../db/social/auditLog";
import { errResult, okResult, type ToolResult } from "../types";
import type { SocialContentItem } from "@prisma/client";

export async function scheduleContent(
  id: string,
  scheduledAt: Date,
  socialAccountId: string,
  uid: string
): Promise<ToolResult<SocialContentItem>> {
  if (scheduledAt.getTime() < Date.now() - 60_000) {
    return errResult("VALIDATION_ERROR", "Scheduled time must be in the future");
  }

  const existing = await getContentItemById(id);
  if (!existing) return errResult("NOT_FOUND", "Content item not found");

  const updated = await scheduleContentItem(id, scheduledAt, socialAccountId);
  if (!updated) {
    // AC-24: publish/schedule refuses to run against anything not APPROVED.
    return errResult("NOT_APPROVED", `Item must be APPROVED to schedule (currently ${existing.status})`);
  }

  await writeAuditLog({
    action: "SCHEDULE_CONTENT",
    result: "SUCCESS",
    initiator: uid,
    platform: updated.platform,
    contentItemId: updated.id,
    socialAccountId,
    metadata: { scheduledAt: scheduledAt.toISOString() },
  });
  return okResult(updated);
}

/** AC-31: drag/drop reschedule — updates the existing row's scheduledAt in place. */
export async function rescheduleContent(
  id: string,
  scheduledAt: Date,
  uid: string
): Promise<ToolResult<SocialContentItem>> {
  const existing = await getContentItemById(id);
  if (!existing) return errResult("NOT_FOUND", "Content item not found");
  if (existing.status !== "SCHEDULED" && existing.status !== "APPROVED") {
    return errResult("VALIDATION_ERROR", `Cannot reschedule an item in status ${existing.status}`);
  }

  const updated = await updateContentItem(id, { scheduledAt });

  await writeAuditLog({
    action: "RESCHEDULE_CONTENT",
    result: "SUCCESS",
    initiator: uid,
    platform: updated.platform,
    contentItemId: updated.id,
    metadata: { scheduledAt: scheduledAt.toISOString(), previousScheduledAt: existing.scheduledAt?.toISOString() },
  });
  return okResult(updated);
}
