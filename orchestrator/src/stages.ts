import type { Handoff, LoopState, Stage } from "./types.js";

export function buildStagePrompt(
  state: LoopState,
  agentPrompt: string,
  priorHandoff: Handoff | null,
): string {
  const prior = priorHandoff ? JSON.stringify(priorHandoff, null, 2) : "none";
  return [
    "You are running as part of an automated closed-loop app build.",
    "",
    `## Goal`,
    state.goal,
    "",
    `## Current stage`,
    state.currentStage,
    "",
    `## Iteration`,
    String(state.iteration),
    "",
    `## Prior handoff`,
    prior,
    "",
    `## Agent definition`,
    agentPrompt,
    "",
    `## Required before finishing`,
    `1. Complete all work for stage "${state.currentStage}"`,
    `2. Write handoff JSON to .cursor/loop/handoffs/${state.currentStage}-<ISO-timestamp>.json`,
    `3. Follow the handoff contract in .cursor/skills/closed-loop/handoffs.md`,
    `4. Set nextStage and loopBackTo appropriately for your stage`,
  ].join("\n");
}

export function resolveNextStage(
  state: LoopState,
  handoff: Handoff,
): { nextStage: Stage | null; paused: boolean; complete: boolean } {
  if (handoff.status === "blocked" || handoff.status === "failed") {
    return { nextStage: null, paused: true, complete: false };
  }

  if (handoff.status === "needs_revision") {
    const target = (handoff.loopBackTo ?? "implementer") as Stage;
    if (state.iteration >= state.maxIterations) {
      return { nextStage: null, paused: true, complete: false };
    }
    return { nextStage: target, paused: false, complete: false };
  }

  if (state.currentStage === "monitor" && handoff.status === "success") {
    return { nextStage: null, paused: false, complete: true };
  }

  const next = (handoff.nextStage ?? defaultNextStage(state.currentStage)) as Stage | undefined;
  return { nextStage: next ?? null, paused: false, complete: false };
}

function defaultNextStage(current: Stage): Stage | undefined {
  const order: Stage[] = [
    "product-spec",
    "architect",
    "implementer",
    "verifier",
    "reviewer",
    "security-reviewer",
    "qa-acceptance",
    "integrator",
    "release",
    "monitor",
  ];
  const idx = order.indexOf(current);
  return idx >= 0 && idx < order.length - 1 ? order[idx + 1] : undefined;
}

export function applyHandoff(state: LoopState, handoff: Handoff): LoopState {
  const { nextStage, paused, complete } = resolveNextStage(state, handoff);

  if (paused) {
    return { ...state, status: "paused" };
  }

  if (complete) {
    return {
      ...state,
      status: "complete",
      completedStages: [...state.completedStages, state.currentStage],
    };
  }

  const needsRevision = handoff.status === "needs_revision";
  return {
    ...state,
    currentStage: nextStage!,
    iteration: needsRevision ? state.iteration + 1 : state.iteration,
    completedStages:
      handoff.status === "success"
        ? [...state.completedStages, handoff.agent as Stage]
        : state.completedStages,
  };
}
