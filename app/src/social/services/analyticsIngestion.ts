/**
 * Analytics ingestion service (Epic K, AC-42..44). Idempotent
 * upsert-per-day; unsupported metrics are stored as `null` + listed in
 * `notAvailableMetrics` — never fabricated (AC-43).
 */

import { prisma } from "../../db/client";
import { getDecryptedTokens, setAccountStatus } from "../../db/social/socialAccounts";
import {
  upsertContentAnalyticsSnapshot,
  upsertAccountAnalyticsSnapshot,
  listContentAnalytics,
  listAccountAnalytics,
} from "../../db/social/analyticsSnapshots";
import { writeAuditLog } from "../../db/social/auditLog";
import { getProvider } from "../providers/registry";
import type { SocialPlatform } from "../types";

export interface AnalyticsRefreshSummary {
  itemsRefreshed: number;
  accountsRefreshed: number;
  errors: string[];
}

export async function refreshAllAnalytics(initiator: string): Promise<AnalyticsRefreshSummary> {
  const errors: string[] = [];
  let itemsRefreshed = 0;
  let accountsRefreshed = 0;

  const accounts = await prisma.socialAccount.findMany({ where: { disconnectedAt: null, status: "CONNECTED" } });

  for (const account of accounts) {
    const tokens = await getDecryptedTokens(account.id);
    if (!tokens) continue;
    const provider = getProvider(account.platform);

    const accountResult = await provider.getAnalytics(tokens.accessToken, {
      since: new Date(Date.now() - 24 * 60 * 60 * 1000),
      until: new Date(),
    });
    if (accountResult.ok) {
      await upsertAccountAnalyticsSnapshot(
        account.id,
        new Date(),
        accountResult.data.followers,
        accountResult.data.notAvailableMetrics
      );
      accountsRefreshed++;
    } else if (accountResult.reason === "REAUTH_REQUIRED") {
      await setAccountStatus(account.id, "REAUTH_REQUIRED");
      errors.push(`${account.platform}/${account.handle}: reauth required`);
    } else {
      errors.push(`${account.platform}/${account.handle}: ${accountResult.detail}`);
    }

    const publishedItems = await prisma.socialContentItem.findMany({
      where: { socialAccountId: account.id, status: "PUBLISHED", deletedAt: null },
      orderBy: { publishedAt: "desc" },
      take: 50, // bounded — most-recently-published items only (§10 performance notes)
    });

    for (const item of publishedItems) {
      if (!item.externalPostId) continue;
      const itemResult = await provider.getAnalytics(tokens.accessToken, {
        externalPostId: item.externalPostId,
        since: item.publishedAt ?? new Date(0),
        until: new Date(),
      });
      if (itemResult.ok) {
        await upsertContentAnalyticsSnapshot(item.id, new Date(), itemResult.data);
        itemsRefreshed++;
      } else if (itemResult.reason !== "UNSUPPORTED_BY_PLATFORM") {
        errors.push(`${item.platform}/${item.id}: ${itemResult.detail}`);
      }
    }
  }

  await writeAuditLog({
    action: "ANALYTICS_REFRESH",
    result: errors.length === 0 ? "SUCCESS" : "FAILURE",
    initiator,
    errorDetail: errors.length > 0 ? errors.join("; ") : null,
    metadata: { itemsRefreshed, accountsRefreshed },
  });

  return { itemsRefreshed, accountsRefreshed, errors };
}

export async function getAnalyticsOverview(platform?: SocialPlatform, from?: Date, to?: Date) {
  const accounts = await prisma.socialAccount.findMany({
    where: { disconnectedAt: null, platform },
  });

  const accountsWithAnalytics = await Promise.all(
    accounts.map(async (account) => ({
      account: { id: account.id, platform: account.platform, handle: account.handle, displayName: account.displayName },
      snapshots: await listAccountAnalytics(account.id, from, to),
    }))
  );

  const items = await prisma.socialContentItem.findMany({
    where: { platform, status: "PUBLISHED", deletedAt: null },
    orderBy: { publishedAt: "desc" },
    take: 100,
  });

  const itemsWithAnalytics = await Promise.all(
    items.map(async (item) => ({
      item: { id: item.id, platform: item.platform, title: item.title, publishedAt: item.publishedAt },
      snapshots: await listContentAnalytics(item.id),
    }))
  );

  return { accounts: accountsWithAnalytics, items: itemsWithAnalytics };
}
