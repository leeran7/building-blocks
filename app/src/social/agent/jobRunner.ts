/**
 * Drives the non-interactive scheduled-job AgentRun kinds (PUBLISH_SWEEP,
 * ANALYTICS_REFRESH, TOKEN_REFRESH_SWEEP, WEEKLY_STRATEGY). Unlike
 * chatRunner.ts these jobs are deterministic and bounded (LIMIT 50/tick,
 * §10 performance notes), so each one runs to completion within a single
 * invocation — the `AgentRun`/`AgentTask` rows exist here purely for
 * observability/audit (AC-58), not because these specific jobs need
 * cross-invocation resumability the way an open-ended chat tool-call chain
 * does (ADR-1).
 */

import { Prisma } from "@prisma/client";
import {
  createAgentRun,
  updateAgentRunStatus,
  createOrGetAgentTask,
  finishAgentTask,
} from "../../db/social/agentRuns";
import { findDueScheduledItems } from "../../db/social/contentItems";
import { publishContentItem } from "../services/publishing";
import { refreshAllAnalytics } from "../services/analyticsIngestion";
import { generateWeeklyStrategy } from "../services/weeklyStrategy";
import { getProvider } from "../providers/registry";
import { getDecryptedTokens, updateAccountTokens, setAccountStatus } from "../../db/social/socialAccounts";
import { writeAuditLog } from "../../db/social/auditLog";
import { prisma } from "../../db/client";

const SYSTEM_INITIATOR_PREFIX = "system:cron:";

export interface PublishSweepSummary {
  claimed: number;
  published: number;
  failed: number;
  rateLimited: number;
}

export async function runPublishSweep(): Promise<PublishSweepSummary> {
  const initiator = `${SYSTEM_INITIATOR_PREFIX}publish-sweep`;
  const run = await createAgentRun({ kind: "PUBLISH_SWEEP", initiatedBySystem: initiator, input: {} });
  await updateAgentRunStatus(run.id, "RUNNING", { startedAt: new Date() });

  const summary: PublishSweepSummary = { claimed: 0, published: 0, failed: 0, rateLimited: 0 };
  const due = await findDueScheduledItems(50);

  let stepIndex = 0;
  for (const item of due) {
    summary.claimed++;
    const { task } = await createOrGetAgentTask({
      agentRunId: run.id,
      stepIndex: stepIndex++,
      toolName: "publish_content",
      contentItemId: item.id,
      taskInput: { contentItemId: item.id },
    });

    const result = await publishContentItem(item.id, initiator);
    if (result.ok) {
      summary.published++;
      await finishAgentTask(task.id, { status: "SUCCEEDED", outputSanitized: result.data });
    } else if (result.reason === "RATE_LIMITED") {
      summary.rateLimited++;
      await finishAgentTask(task.id, { status: "FAILED", errorMessage: result.detail });
    } else {
      summary.failed++;
      await finishAgentTask(task.id, { status: "FAILED", errorMessage: result.detail });
    }
  }

  await updateAgentRunStatus(run.id, "SUCCEEDED", { finishedAt: new Date() });
  return summary;
}

export async function runAnalyticsRefresh(): Promise<{ itemsRefreshed: number; accountsRefreshed: number }> {
  const initiator = `${SYSTEM_INITIATOR_PREFIX}analytics-refresh`;
  const run = await createAgentRun({ kind: "ANALYTICS_REFRESH", initiatedBySystem: initiator, input: {} });
  await updateAgentRunStatus(run.id, "RUNNING", { startedAt: new Date() });

  const { task } = await createOrGetAgentTask({ agentRunId: run.id, stepIndex: 0 });
  try {
    const result = await refreshAllAnalytics(initiator);
    await finishAgentTask(task.id, {
      status: result.errors.length === 0 ? "SUCCEEDED" : "FAILED",
      outputSanitized: result,
      errorMessage: result.errors.length > 0 ? result.errors.join("; ") : null,
    });
    await updateAgentRunStatus(run.id, result.errors.length === 0 ? "SUCCEEDED" : "PARTIAL", { finishedAt: new Date() });
    return { itemsRefreshed: result.itemsRefreshed, accountsRefreshed: result.accountsRefreshed };
  } catch (err) {
    await finishAgentTask(task.id, { status: "FAILED", errorMessage: (err as Error).message });
    await updateAgentRunStatus(run.id, "FAILED", { error: (err as Error).message, finishedAt: new Date() });
    throw err;
  }
}

const TOKEN_REFRESH_WINDOW_MS = 60 * 60 * 1000; // refresh anything expiring within the next hour

export interface TokenRefreshSummary {
  checked: number;
  refreshed: number;
  flaggedReauthRequired: number;
}

export async function runTokenRefreshSweep(): Promise<TokenRefreshSummary> {
  const initiator = `${SYSTEM_INITIATOR_PREFIX}token-refresh-sweep`;
  const run = await createAgentRun({ kind: "TOKEN_REFRESH_SWEEP", initiatedBySystem: initiator, input: {} });
  await updateAgentRunStatus(run.id, "RUNNING", { startedAt: new Date() });

  const summary: TokenRefreshSummary = { checked: 0, refreshed: 0, flaggedReauthRequired: 0 };
  const accounts = await prisma.socialAccount.findMany({
    where: {
      disconnectedAt: null,
      status: "CONNECTED",
      tokenExpiresAt: { lte: new Date(Date.now() + TOKEN_REFRESH_WINDOW_MS) },
    },
  });

  let stepIndex = 0;
  for (const account of accounts) {
    summary.checked++;
    const { task } = await createOrGetAgentTask({ agentRunId: run.id, stepIndex: stepIndex++ });
    const tokens = await getDecryptedTokens(account.id);
    if (!tokens?.refreshToken) {
      await setAccountStatus(account.id, "REAUTH_REQUIRED");
      summary.flaggedReauthRequired++;
      await finishAgentTask(task.id, { status: "FAILED", errorMessage: "No refresh token available" });
      continue;
    }

    const provider = getProvider(account.platform);
    const result = await provider.refreshAccessToken(tokens.refreshToken);
    if (result.ok) {
      await updateAccountTokens(account.id, result.data);
      summary.refreshed++;
      await finishAgentTask(task.id, { status: "SUCCEEDED" });
      await writeAuditLog({ action: "TOKEN_REFRESH", result: "SUCCESS", initiator, platform: account.platform, socialAccountId: account.id });
    } else {
      await setAccountStatus(account.id, "REAUTH_REQUIRED");
      summary.flaggedReauthRequired++;
      await finishAgentTask(task.id, { status: "FAILED", errorMessage: result.detail });
      await writeAuditLog({
        action: "TOKEN_REFRESH",
        result: "FAILURE",
        initiator,
        platform: account.platform,
        socialAccountId: account.id,
        errorDetail: result.detail,
      });
    }
  }

  await updateAgentRunStatus(run.id, "SUCCEEDED", { finishedAt: new Date() });
  return summary;
}

export interface WeeklyStrategyJobResult {
  isoWeek: string;
  created: boolean;
}

/**
 * AC-47: the `agent_run_one_weekly_strategy_per_week` partial unique index
 * (raw-SQL, ADR-3-style backstop) makes a second concurrent invocation for
 * the same ISO week fail at the DB level even if this application-level
 * check were ever bypassed by a bug.
 */
export async function runWeeklyStrategyJob(isoWeek: string, initiator: string): Promise<WeeklyStrategyJobResult> {
  let run;
  try {
    run = await createAgentRun({ kind: "WEEKLY_STRATEGY", initiatedBySystem: initiator, isoWeek, input: { isoWeek } });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return { isoWeek, created: false };
    }
    throw err;
  }

  await updateAgentRunStatus(run.id, "RUNNING", { startedAt: new Date() });
  const { task } = await createOrGetAgentTask({
    agentRunId: run.id,
    stepIndex: 0,
    toolName: "generate_weekly_strategy",
    taskInput: { isoWeek },
  });

  try {
    const result = await generateWeeklyStrategy(isoWeek, initiator);
    await finishAgentTask(task.id, {
      status: "SUCCEEDED",
      outputSanitized: { recommendationId: result.recommendation.id, proposedItemCount: result.proposedItems.length },
    });
    await updateAgentRunStatus(run.id, "SUCCEEDED", { finishedAt: new Date() });
    await writeAuditLog({ action: "WEEKLY_STRATEGY_RUN", result: "SUCCESS", initiator, metadata: { isoWeek } });
    return { isoWeek, created: !result.alreadyExisted };
  } catch (err) {
    await finishAgentTask(task.id, { status: "FAILED", errorMessage: (err as Error).message });
    await updateAgentRunStatus(run.id, "FAILED", { error: (err as Error).message, finishedAt: new Date() });
    await writeAuditLog({
      action: "WEEKLY_STRATEGY_RUN",
      result: "FAILURE",
      initiator,
      errorDetail: (err as Error).message,
      metadata: { isoWeek },
    });
    throw err;
  }
}
