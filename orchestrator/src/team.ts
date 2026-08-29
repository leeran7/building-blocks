import type { Handoff, HandoffStatus, LoopState, Stage } from "./types.js";
import { REQUIRED_SEQUENCE, REQUIRED_TEAM } from "./types.js";

export { REQUIRED_SEQUENCE, REQUIRED_TEAM };

export const SPECIALIST_NAMES = [
  "frontend",
  "backend",
  "data",
  "mobile",
  "performance",
  "compliance",
  "cost",
] as const;

export const OPTIONAL_AFTER: Partial<Record<Stage, Stage[]>> = {
  architect: ["design-ux"],
  integrator: ["devops", "docs"],
};

export const PARALLEL_WITH: Partial<Record<Stage, Stage[]>> = {
  reviewer: ["security-reviewer"],
};

const STATUS_RANK: Record<HandoffStatus, number> = {
  success: 1,
  needs_revision: 2,
  blocked: 3,
  failed: 4,
};

export function stagesToDispatch(current: Stage): Stage[] {
  const extra = PARALLEL_WITH[current] ?? [];
  return [current, ...extra];
}

export function nextInSequence(current: Stage): Stage | null {
  if (current === "design-ux") return "implementer";
  if (current === "devops" || current === "docs") return "release";
  if (current === "debugger") return "implementer";
  if (current === "security-reviewer") return "qa-acceptance";
  const idx = REQUIRED_SEQUENCE.indexOf(current);
  if (idx === -1) return "implementer";
  if (idx >= REQUIRED_SEQUENCE.length - 1) return null;
  return REQUIRED_SEQUENCE[idx + 1] ?? null;
}

export function clampNextStage(
  current: Stage,
  requested: string | undefined,
): Stage | null {
  const forced = nextInSequence(current);
  const optional = OPTIONAL_AFTER[current] ?? [];

  if (requested && optional.includes(requested as Stage)) {
    return requested as Stage;
  }

  if (requested && (SPECIALIST_NAMES as readonly string[]).includes(requested)) {
    return forced;
  }

  if (requested === "security-reviewer" && current === "reviewer") {
    return "qa-acceptance";
  }

  if (!requested) return forced;

  const reqIdx = REQUIRED_SEQUENCE.indexOf(requested as Stage);
  const curIdx = REQUIRED_SEQUENCE.indexOf(current);

  if (reqIdx === -1) {
    return forced;
  }

  if (curIdx >= 0 && reqIdx > curIdx + 1) {
    return forced;
  }

  if (curIdx >= 0 && reqIdx === curIdx + 1) {
    return forced;
  }

  if (requested === current) {
    return forced;
  }

  return forced;
}

export function missingHandoff(stage: Stage): Handoff {
  return {
    agent: stage,
    status: "failed",
    summary: `Stage "${stage}" finished without writing loop/handoffs/${stage}-<timestamp>.json. The team member did not complete; treating as failed, not success.`,
    timestamp: new Date().toISOString(),
  };
}

export function withCriticalRevision(handoff: Handoff): Handoff {
  const critical = (handoff.feedback ?? []).some((f) => f.severity === "critical");
  if (handoff.status === "success" && critical) {
    return {
      ...handoff,
      status: "needs_revision",
      loopBackTo: handoff.loopBackTo ?? "implementer",
    };
  }
  return handoff;
}

export function combineHandoffs(handoffs: Handoff[]): Handoff {
  if (handoffs.length === 0) {
    return missingHandoff("reviewer");
  }
  if (handoffs.length === 1) {
    return withCriticalRevision(handoffs[0]);
  }

  const ranked = handoffs
    .map(withCriticalRevision)
    .sort((a, b) => STATUS_RANK[b.status] - STATUS_RANK[a.status]);
  const worst = ranked[0];
  const status = worst.status;

  return {
    agent: handoffs.map((h) => h.agent).join("+"),
    status,
    summary: handoffs.map((h) => `[${h.agent}] ${h.summary}`).join(" | "),
    timestamp: new Date().toISOString(),
    artifacts: handoffs.flatMap((h) => h.artifacts ?? []),
    feedback: handoffs.flatMap((h) => h.feedback ?? []),
    learnings: handoffs.flatMap((h) => h.learnings ?? []),
    nextStage: status === "success" ? "qa-acceptance" : undefined,
    loopBackTo:
      status === "needs_revision" ? (worst.loopBackTo ?? "implementer") : worst.loopBackTo,
  };
}

export function teamMissing(state: Pick<LoopState, "dispatched" | "completedStages">): Stage[] {
  const seen = new Set([...state.dispatched, ...state.completedStages]);
  return REQUIRED_TEAM.filter((stage) => !seen.has(stage));
}

export function uniqueStages(stages: Stage[]): Stage[] {
  return [...new Set(stages)];
}
