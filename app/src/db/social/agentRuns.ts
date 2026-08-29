/**
 * AgentRun / AgentTask data access — the resumable-step engine (ADR-1).
 * Each AgentRun advances one step per HTTP request or cron tick; AgentTask
 * rows give crash-safety (resume re-enters at `currentStepIndex`, never
 * replays a completed step) and observability (a full transcript per run).
 */

import { prisma } from "../client";
import { sanitizeForStorage } from "../../social/services/safety";
import type { SocialAgentRun, SocialAgentTask } from "@prisma/client";
import type { SocialAgentRunKind, SocialAgentToolName } from "../../social/types";

export async function createAgentRun(input: {
  kind: SocialAgentRunKind;
  initiatedByUid?: string | null;
  initiatedBySystem?: string | null;
  input: Record<string, unknown>;
  isoWeek?: string | null;
  maxSteps?: number;
}): Promise<SocialAgentRun> {
  return prisma.socialAgentRun.create({
    data: {
      kind: input.kind,
      status: "PENDING",
      initiatedByUid: input.initiatedByUid,
      initiatedBySystem: input.initiatedBySystem,
      input: sanitizeForStorage(input.input) as object,
      isoWeek: input.isoWeek,
      maxSteps: input.maxSteps ?? 12,
    },
  });
}

export async function getAgentRun(id: string): Promise<SocialAgentRun | null> {
  return prisma.socialAgentRun.findUnique({ where: { id } });
}

export async function getAgentRunWithTasks(id: string) {
  return prisma.socialAgentRun.findUnique({
    where: { id },
    include: { tasks: { orderBy: { stepIndex: "asc" } } },
  });
}

export async function updateAgentRunStatus(
  id: string,
  status: SocialAgentRun["status"],
  extra?: { error?: string | null; startedAt?: Date; finishedAt?: Date }
): Promise<SocialAgentRun> {
  return prisma.socialAgentRun.update({
    where: { id },
    data: {
      status,
      error: extra?.error,
      startedAt: extra?.startedAt,
      finishedAt: extra?.finishedAt,
    },
  });
}

export async function advanceAgentRunStep(id: string): Promise<SocialAgentRun> {
  return prisma.socialAgentRun.update({
    where: { id },
    data: { currentStepIndex: { increment: 1 } },
  });
}

/** Read-only idempotency check — used BEFORE calling the LLM, so a replayed step never re-invokes it. */
export async function getAgentTaskByStep(agentRunId: string, stepIndex: number): Promise<SocialAgentTask | null> {
  return prisma.socialAgentTask.findUnique({
    where: { social_agent_task_run_step: { agentRunId, stepIndex } },
  });
}

/**
 * Idempotent step creation: `@@unique([agentRunId, stepIndex])` means
 * replaying the same step index returns the already-persisted result instead
 * of re-invoking the LLM/tool — critical for cron-driven jobs that may be
 * re-triggered.
 */
export async function createOrGetAgentTask(input: {
  agentRunId: string;
  stepIndex: number;
  toolName?: SocialAgentToolName | null;
  contentItemId?: string | null;
  taskInput?: Record<string, unknown> | null;
}): Promise<{ task: SocialAgentTask; alreadyExisted: boolean }> {
  const existing = await prisma.socialAgentTask.findUnique({
    where: { social_agent_task_run_step: { agentRunId: input.agentRunId, stepIndex: input.stepIndex } },
  });
  if (existing) return { task: existing, alreadyExisted: true };

  const task = await prisma.socialAgentTask.create({
    data: {
      agentRunId: input.agentRunId,
      stepIndex: input.stepIndex,
      toolName: input.toolName,
      contentItemId: input.contentItemId,
      input: input.taskInput ? (sanitizeForStorage(input.taskInput) as object) : undefined,
      status: "RUNNING",
      startedAt: new Date(),
    },
  });
  return { task, alreadyExisted: false };
}

export async function finishAgentTask(
  id: string,
  input: {
    status: SocialAgentTask["status"];
    outputSanitized?: unknown;
    errorMessage?: string | null;
  }
): Promise<SocialAgentTask> {
  return prisma.socialAgentTask.update({
    where: { id },
    data: {
      status: input.status,
      outputSanitized: input.outputSanitized ? (sanitizeForStorage(input.outputSanitized) as object) : undefined,
      errorMessage: input.errorMessage,
      finishedAt: new Date(),
    },
  });
}

/** Cron-claim lock, same conditional-UPDATE pattern as ContentItem.lockedAt (ADR-1/ADR-3). */
export async function claimAgentRun(id: string): Promise<boolean> {
  const result = await prisma.$executeRaw`
    UPDATE social_agent_runs
    SET "lockedAt" = now()
    WHERE id = ${id}
      AND status IN ('PENDING', 'RUNNING', 'WAITING_ON_STEP')
      AND ("lockedAt" IS NULL OR "lockedAt" < now() - interval '2 minutes')
  `;
  return result > 0;
}

export async function releaseAgentRunLock(id: string): Promise<void> {
  await prisma.socialAgentRun.update({ where: { id }, data: { lockedAt: null } });
}

export async function findRunnableAgentRuns(kind: SocialAgentRunKind, limit = 10): Promise<SocialAgentRun[]> {
  return prisma.socialAgentRun.findMany({
    where: { kind, status: { in: ["PENDING", "RUNNING", "WAITING_ON_STEP"] } },
    orderBy: { createdAt: "asc" },
    take: limit,
  });
}
