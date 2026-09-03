/**
 * Drives one AgentRun step for CHAT_TURN runs (ADR-1). Each call to
 * `runNextChatStep()` does AT MOST one LLM round-trip and, if the model
 * requested a tool call, ONE authz-checked tool execution (via
 * dispatch.ts) — then persists an `AgentTask` and returns. The caller
 * (the `/api/social/agent/runs*` routes) is responsible for calling this
 * again while `status` is `RUNNING`/`WAITING_ON_STEP` (AC-58's full
 * transcript is exactly the accumulated `AgentTask` rows).
 */

import { generateText, stepCountIs } from "ai";
import type { ModelMessage, ToolResultPart } from "ai";
import { getLanguageModel } from "./llmClient";
import { buildToolSet } from "./toolRegistry";
import { dispatchTool } from "./dispatch";
import { getBrandProfile } from "../../db/social/brandProfile";
import { getBoundedMemorySummary } from "../services/memory";
import {
  createAgentRun,
  getAgentRun,
  getAgentRunWithTasks,
  getAgentTaskByStep,
  updateAgentRunStatus,
  advanceAgentRunStep,
  createOrGetAgentTask,
  finishAgentTask,
  claimAgentRun,
  releaseAgentRunLock,
} from "../../db/social/agentRuns";
import type { SocialAgentRun, SocialAgentTask } from "@prisma/client";
import type { SocialAgentToolName } from "../types";

export interface ChatStepResult {
  run: SocialAgentRun;
  task: SocialAgentTask | null;
  assistantText?: string;
}

async function buildSystemPrompt(runInput?: { replayUrl?: string }): Promise<string> {
  const [brand, memory] = await Promise.all([getBrandProfile(), getBoundedMemorySummary()]);
  return [
    "You are Doomstack's marketing agent for TikTok, X, and YouTube.",
    "You may only act through the tools provided — there is no other way to read or change data.",
    "Replay → video workflow:",
    "1) When the user provides a climb replay link (/play?r=…), call analyze_climb_replay first.",
    "2) Pick the most intense highlight(s) and write a punchy marketing brief.",
    "3) Call create_content_idea with that brief, generateVideo: true, platforms including TikTok and/or YouTube, and the same replayUrl so visuals match the run.",
    "Never fabricate climb stats — only use numbers returned by analyze_climb_replay.",
    "Never fabricate a metric, post id, or platform capability. If a tool reports something is unsupported or unavailable, say so plainly instead of guessing.",
    "Publishing/scheduling always goes through the schedule_content/publish_content tools — never claim something was published without calling them.",
    runInput?.replayUrl ? `User attached replay: ${runInput.replayUrl}` : "",
    brand ? `Brand: ${brand.name}.${brand.niche ? ` Niche: ${brand.niche}.` : ""}${brand.tone ? ` Tone: ${brand.tone}.` : ""}` : "",
    memory,
  ]
    .filter(Boolean)
    .join("\n");
}

function toToolResultPart(task: Pick<SocialAgentTask, "id" | "toolName" | "outputSanitized" | "status" | "errorMessage">): ToolResultPart {
  const isError = task.status === "FAILED" || task.status === "UNSUPPORTED";
  return {
    type: "tool-result",
    toolCallId: task.id,
    toolName: task.toolName as string,
    output: (isError
      ? { type: "error-json", value: task.outputSanitized ?? { error: task.errorMessage } }
      : { type: "json", value: task.outputSanitized ?? null }) as ToolResultPart["output"],
  };
}

async function reconstructMessages(run: SocialAgentRun, tasks: SocialAgentTask[]): Promise<ModelMessage[]> {
  const input = run.input as { message?: string; replayUrl?: string };
  const userLines = [input.message ?? ""];
  if (input.replayUrl) userLines.push(`Replay: ${input.replayUrl}`);
  const messages: ModelMessage[] = [{ role: "user", content: userLines.filter(Boolean).join("\n") }];

  for (const task of tasks) {
    if (task.toolName) {
      messages.push({
        role: "assistant",
        content: [{ type: "tool-call", toolCallId: task.id, toolName: task.toolName, input: task.input ?? {} }],
      });
      messages.push({ role: "tool", content: [toToolResultPart(task)] });
    } else if (task.outputSanitized && typeof task.outputSanitized === "object" && "assistantText" in task.outputSanitized) {
      const text = (task.outputSanitized as { assistantText?: string }).assistantText ?? "";
      if (text) messages.push({ role: "assistant", content: text });
    }
  }
  return messages;
}

export async function createChatRun(
  uid: string,
  message: string,
  conversationId?: string,
  replayUrl?: string
): Promise<ChatStepResult> {
  const run = await createAgentRun({
    kind: "CHAT_TURN",
    initiatedByUid: uid,
    input: { message, conversationId, replayUrl },
  });
  await updateAgentRunStatus(run.id, "RUNNING", { startedAt: new Date() });
  return runNextChatStep(run.id, uid);
}

export async function runNextChatStep(runId: string, uid: string): Promise<ChatStepResult> {
  const claimed = await claimAgentRun(runId);
  if (!claimed) {
    const run = await getAgentRun(runId);
    if (!run) throw new Error("Agent run not found");
    return { run, task: null };
  }

  try {
    const withTasks = await getAgentRunWithTasks(runId);
    if (!withTasks) throw new Error("Agent run not found");
    const { tasks, ...run } = withTasks;

    if (run.initiatedByUid && run.initiatedByUid !== uid) {
      throw new Error("You do not have access to this agent run");
    }

    if (run.status === "SUCCEEDED" || run.status === "FAILED") {
      return { run, task: tasks[tasks.length - 1] ?? null };
    }
    if (run.currentStepIndex >= run.maxSteps) {
      const failed = await updateAgentRunStatus(runId, "FAILED", {
        error: "Maximum step count exceeded",
        finishedAt: new Date(),
      });
      return { run: failed, task: null };
    }

    const stepIndex = run.currentStepIndex;

    // Replay-safety (AC-58): a retried HTTP request for a step already
    // completed must never re-invoke the LLM or re-run a tool.
    const existing = await getAgentTaskByStep(runId, stepIndex);
    if (existing && existing.status !== "PENDING" && existing.status !== "RUNNING") {
      return { run, task: existing };
    }

    const [system, messages] = await Promise.all([
      buildSystemPrompt(run.input as { replayUrl?: string }),
      reconstructMessages(run, tasks),
    ]);

    const result = await generateText({
      model: getLanguageModel(),
      system,
      messages,
      tools: buildToolSet(),
      stopWhen: stepCountIs(1), // ADR-1: exactly one model round-trip per invocation, never chained here
    });

    if (result.toolCalls.length > 0) {
      const call = result.toolCalls[0];
      const { task } = await createOrGetAgentTask({
        agentRunId: runId,
        stepIndex,
        toolName: call.toolName as SocialAgentToolName,
        taskInput: call.input as Record<string, unknown>,
      });
      const dispatchResult = await dispatchTool(call.toolName, call.input, { uid });
      const finished = await finishAgentTask(task.id, {
        status: dispatchResult.status,
        outputSanitized: dispatchResult.output,
        errorMessage: dispatchResult.errorMessage,
      });
      await advanceAgentRunStep(runId);
      const running = await updateAgentRunStatus(runId, "WAITING_ON_STEP");
      return { run: running, task: finished };
    }

    const { task } = await createOrGetAgentTask({ agentRunId: runId, stepIndex });
    const finished = await finishAgentTask(task.id, {
      status: "SUCCEEDED",
      outputSanitized: { assistantText: result.text },
    });
    await advanceAgentRunStep(runId);
    const succeeded = await updateAgentRunStatus(runId, "SUCCEEDED", { finishedAt: new Date() });
    return { run: succeeded, task: finished, assistantText: result.text };
  } catch (err) {
    const failed = await updateAgentRunStatus(runId, "FAILED", {
      error: (err as Error).message,
      finishedAt: new Date(),
    });
    return { run: failed, task: null };
  } finally {
    await releaseAgentRunLock(runId);
  }
}
