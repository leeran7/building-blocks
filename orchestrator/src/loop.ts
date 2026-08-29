import { Agent, CursorAgentError } from "@cursor/sdk";
import { applyHandoff, buildStagePrompt } from "./stages.js";
import { combineHandoffs, missingHandoff, stagesToDispatch } from "./team.js";
import { loadLearningsExcerpt, runRetro } from "./retro.js";
import { loadRepoContextExcerpt } from "./context.js";
import {
  initState,
  latestHandoff,
  latestUpstreamHandoff,
  loadAgentPrompt,
  readState,
  writeState,
  LOOP_DIR,
  REPO_ROOT,
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
  let pendingFeedback: Handoff | null = await latestUpstreamHandoff(state);

  while (state.status === "running" && stagesRun < maxStages) {
    const toRun = stagesToDispatch(state.currentStage);
    console.log(
      `\n[loop] stage=${state.currentStage} dispatch=[${toRun.join(",")}] iteration=${state.iteration}`,
    );

    const startedAt = new Date().toISOString();
    const prior = pendingFeedback ?? (await latestUpstreamHandoff(state));
    const learnings = await loadLearningsExcerpt(LOOP_DIR);
    const repoContext = await loadRepoContextExcerpt(REPO_ROOT);

    const runOne = async (stage: Stage): Promise<Handoff> => {
      const agentPrompt = await loadAgentPrompt(stage);
      const prompt = buildStagePrompt(state, agentPrompt, prior, {
        stage,
        learnings,
        repoContext,
      });
      return runAgent(stage, prompt, apiKey, options.model, startedAt);
    };

    const handoffs =
      toRun.length > 1
        ? await Promise.all(toRun.map((stage) => runOne(stage)))
        : [await runOne(toRun[0])];

    await runRetro(LOOP_DIR, handoffs, state.iteration);

    const handoff = combineHandoffs(handoffs);
    state = applyHandoff(state, handoff, toRun);
    await writeState(state);

    pendingFeedback = handoff;
    console.log(
      `[loop] handoff status=${handoff.status} dispatched=[${state.dispatched.join(",")}] summary=${handoff.summary.slice(0, 80)}...`,
    );

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

async function runAgent(
  stage: Stage,
  prompt: string,
  apiKey: string,
  model = "composer-2.5",
  startedAt: string,
): Promise<Handoff> {
  try {
    await using agent = await Agent.create({
      apiKey,
      model: { id: model },
      local: { cwd: REPO_ROOT, settingSources: ["project"] },
    });

    const run = await agent.send(prompt);
    const result = await run.wait();
    const handoff = await latestHandoff(stage, { notBefore: startedAt });
    if (handoff) return handoff;

    if (result.status === "error") {
      return errorHandoff(stage, `Run failed: ${result.id}`);
    }

    return missingHandoff(stage);
  } catch (err) {
    if (err instanceof CursorAgentError) {
      return errorHandoff(stage, `Startup failed: ${err.message}`);
    }
    throw err;
  }
}

function errorHandoff(stage: Stage, message: string): Handoff {
  return {
    agent: stage,
    status: "failed",
    summary: message,
    timestamp: new Date().toISOString(),
  };
}

export { applyHandoff, buildStagePrompt, resolveNextStage } from "./stages.js";
export { combineHandoffs, clampNextStage, stagesToDispatch } from "./team.js";
