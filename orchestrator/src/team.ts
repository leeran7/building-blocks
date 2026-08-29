import type { Handoff, HandoffStatus, LoopState, Stage } from "./types.js";
import { HANDOFF_STATUSES, REQUIRED_SEQUENCE, REQUIRED_TEAM } from "./types.js";

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

export const LOOP_BACK_TARGETS: Stage[] = [
  "product-spec",
  "architect",
  "implementer",
  "debugger",
];

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
  const optional = OPTIONAL_AFTER[current] ?? [];
  if (requested && optional.includes(requested as Stage)) {
    return requested as Stage;
  }
  if (requested === "security-reviewer" && current === "reviewer") {
    return "qa-acceptance";
  }
  return nextInSequence(current);
}

export function clampLoopBackTo(requested: string | undefined): Stage {
  if (requested && LOOP_BACK_TARGETS.includes(requested as Stage)) {
    return requested as Stage;
  }
  return "implementer";
}

export function missingHandoff(stage: Stage): Handoff {
  return {
    agent: stage,
    status: "failed",
    summary: `Stage "${stage}" finished without writing loop/handoffs/${stage}-<timestamp>.json. The team member did not complete; treating as failed, not success.`,
    timestamp: new Date().toISOString(),
  };
}

export function hasCritical(handoff: Handoff): boolean {
  const fromFeedback = (handoff.feedback ?? []).some((item) => item.severity === "critical");
  const fromFindings = (handoff.findings ?? []).some((item) => item.severity === "critical");
  const exitFail =
    handoff.exitCriteria?.no_critical_findings === false ||
    handoff.exitCriteria?.no_critical_security_findings === false;
  return fromFeedback || fromFindings || Boolean(exitFail);
}

export function withCriticalRevision(handoff: Handoff): Handoff {
  if (handoff.status === "success" && hasCritical(handoff)) {
    return {
      ...handoff,
      status: "needs_revision",
      loopBackTo: clampLoopBackTo(handoff.loopBackTo),
    };
  }
  return handoff;
}

export function normalizeHandoff(handoff: Handoff): Handoff {
  if (!HANDOFF_STATUSES.includes(handoff.status)) {
    return {
      ...handoff,
      status: "failed",
      summary: `Invalid handoff status "${String(handoff.status)}"; treating as failed.`,
    };
  }
  return withCriticalRevision(handoff);
}

export function combineHandoffs(handoffs: Handoff[]): Handoff {
  if (handoffs.length === 0) {
    return missingHandoff("reviewer");
  }
  if (handoffs.length === 1) {
    return normalizeHandoff(handoffs[0]);
  }

  const ranked = handoffs
    .map(normalizeHandoff)
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
    findings: handoffs.flatMap((h) => h.findings ?? []),
    learnings: handoffs.flatMap((h) => h.learnings ?? []),
    exitCriteria: mergeExitCriteria(handoffs),
    nextStage: status === "success" ? "qa-acceptance" : undefined,
    loopBackTo:
      status === "needs_revision"
        ? clampLoopBackTo(worst.loopBackTo)
        : worst.loopBackTo,
  };
}

export function teamMissing(
  state: Pick<LoopState, "dispatched" | "completedStages"> & {
    requiredTeam?: Stage[];
  },
): Stage[] {
  const required = state.requiredTeam?.length ? state.requiredTeam : REQUIRED_TEAM;
  const seen = new Set([...state.dispatched, ...state.completedStages]);
  return required.filter((stage) => !seen.has(stage));
}

export function mergeExitCriteria(
  handoffs: Handoff[],
): Record<string, boolean> | undefined {
  const keys = new Set(handoffs.flatMap((h) => Object.keys(h.exitCriteria ?? {})));
  if (keys.size === 0) return undefined;
  const merged: Record<string, boolean> = {};
  for (const key of keys) {
    const values = handoffs
      .map((h) => h.exitCriteria?.[key])
      .filter((value): value is boolean => typeof value === "boolean");
    merged[key] = values.every(Boolean);
  }
  return merged;
}

export function uniqueStages(stages: Stage[]): Stage[] {
  return [...new Set(stages)];
}
