/**
 * AutomationSettings (mutable singleton, Epic G) — approval-mode policy.
 * Defaults to ALWAYS_REQUIRE_APPROVAL; never auto-publishes until an admin
 * explicitly changes this (the user's hard requirement).
 */

import { prisma } from "../client";
import type { SocialAutomationSettings } from "@prisma/client";
import type { SocialApprovalMode } from "../../social/types";

const SINGLETON_ID = "singleton";

export interface AutoPublishWhitelistEntry {
  platform: string;
  contentType: string;
}

export async function getAutomationSettings(): Promise<SocialAutomationSettings> {
  const existing = await prisma.socialAutomationSettings.findUnique({ where: { id: SINGLETON_ID } });
  if (existing) return existing;
  // Materialize the default row on first read so downstream code always has
  // a concrete row to reference (never null-checks approvalMode elsewhere).
  return prisma.socialAutomationSettings.create({
    data: { id: SINGLETON_ID, approvalMode: "ALWAYS_REQUIRE_APPROVAL", autoPublishWhitelist: [] },
  });
}

export async function updateAutomationSettings(input: {
  approvalMode?: SocialApprovalMode;
  autoPublishWhitelist?: AutoPublishWhitelistEntry[];
  updatedByUid: string;
}): Promise<SocialAutomationSettings> {
  await getAutomationSettings(); // ensure row exists
  return prisma.socialAutomationSettings.update({
    where: { id: SINGLETON_ID },
    data: {
      approvalMode: input.approvalMode,
      autoPublishWhitelist: input.autoPublishWhitelist as unknown as object | undefined,
      updatedByUid: input.updatedByUid,
    },
  });
}

export function isAutoPublishEligible(
  settings: Pick<SocialAutomationSettings, "approvalMode" | "autoPublishWhitelist">,
  platform: string,
  contentType: string
): boolean {
  if (settings.approvalMode !== "AUTO_PUBLISH_TRUSTED") return false;
  const whitelist = (settings.autoPublishWhitelist as unknown as AutoPublishWhitelistEntry[]) ?? [];
  return whitelist.some((e) => e.platform === platform && e.contentType === contentType);
}
