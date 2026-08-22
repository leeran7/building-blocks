import { Agent, CursorAgentError } from "@cursor/sdk";
import {
  applyHandoff,
  buildStagePrompt,
  resolveNextStage,
} from "./stages.js";
import {
  initState,
  latestHandoff,
  loadAgentPrompt,
  readState,
  REPO_ROOT,
  writeState,
  type Handoff,
  type LoopState,
  type Stage,
} from "./types.js";

export interface RunLoopOptions {
  goal: string;
  maxStages?: number;
  apiKey?: string;
  model?: string;
}

export async function runLoop(options: RunLoopOptions): Promise<LoopState> {
  const apiKey = options.apiKey ?? process.env.CURSOR_API_KEY;
  if (!apiKey) {
    throw new Error("CURSOR_API_KEY is required");
  }

  let state = await loadOrInitState(options.goal);
  const maxStages = options.maxStages ?? 50;
  let stagesRun = 0;

  while (state.status === "running" && stagesRun < maxStages) {
    console.log(`\n[loop] stage=${state.currentStage} iteration=${state.iteration}`);

    const agentPrompt = await loadAgentPrompt(state.currentStage);
    const priorHandoff = await latestHandoff(state.currentStage);
    const prompt = buildStagePrompt(state, agentPrompt, priorHandoff);

    const handoff = await runStage(prompt, apiKey, options.model);
    state = applyHandoff(state, handoff);
    await writeState(state);

    console.log(`[loop] handoff status=${handoff.status} summary=${handoff.summary.slice(0, 80)}...`);

    if (state.status !== "running") break;
    stagesRun++;
  }

  return state;
}

async function loadOrInitState(goal: string): Promise<LoopState> {
  try {
    const existing = await readState();
    if (existing.status === "running") return existing;
  } catch {
    // no state yet
  }
  return initState(goal);
}

async function runStage(
  prompt: string,
  apiKey: string,
  model = "composer-2.5",
): Promise<Handoff> {
  try {
    await using agent = await Agent.create({
      apiKey,
      model: { id: model },
      local: { cwd: REPO_ROOT, settingSources: [] },
    });

    const run = await agent.send(prompt);
    const result = await run.wait();

    if (result.status === "error") {
      return errorHandoff(`Run failed: ${result.id}`);
    }

    const handoff = await findLatestHandoffFromRun(stateFromPrompt(prompt));
    if (handoff) return handoff;

    return {
      agent: "unknown",
      status: "success",
      summary: result.result ?? "Stage completed without structured handoff",
      timestamp: new Date().toISOString(),
      nextStage: undefined,
    };
  } catch (err) {
    if (err instanceof CursorAgentError) {
      return errorHandoff(`Startup failed: ${err.message}`);
    }
    throw err;
  }
}

function stateFromPrompt(prompt: string): Stage {
  const match = prompt.match(/## Current stage\n(\S+)/);
  return (match?.[1] ?? "implementer") as Stage;
}

async function findLatestHandoffFromRun(stage: Stage): Promise<Handoff | null> {
  const { readdir, readFile } = await import("node:fs/promises");
  const { join } = await import("node:path");
  const handoffsDir = join(REPO_ROOT, ".cursor", "loop", "handoffs");

  try {
    const files = (await readdir(handoffsDir))
      .filter((f) => f.startsWith(`${stage}-`) && f.endsWith(".json"))
      .sort()
      .reverse();

    if (files.length === 0) return null;
    const raw = await readFile(join(handoffsDir, files[0]), "utf-8");
    return JSON.parse(raw) as Handoff;
  } catch {
    return null;
  }
}

function errorHandoff(message: string): Handoff {
  return {
    agent: "orchestrator",
    status: "failed",
    summary: message,
    timestamp: new Date().toISOString(),
  };
}

export { resolveNextStage, applyHandoff, buildStagePrompt };
