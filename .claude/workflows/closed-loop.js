export const meta = {
  name: "closed-loop",
  description: "Full agent pipeline: spec, architect, implement, verify, review, QA, integrate",
  phases: [
    { title: "Spec & Architecture" },
    { title: "Implementation" },
    { title: "Verification" },
    { title: "Quality Gates" },
    { title: "Integration" }
  ]
};

const HANDOFF_DIR = "loop/handoffs";
const MAX_RETRIES = 3;

const HANDOFF_SCHEMA = {
  type: "object",
  properties: {
    agent: { type: "string" },
    status: { type: "string", enum: ["success", "needs_revision", "blocked", "failed"] },
    summary: { type: "string" },
    timestamp: { type: "string" },
    nextStage: { type: "string" },
    loopBackTo: { type: "string" },
    findings: { type: "array" },
    feedback: { type: "array" },
    learnings: { type: "array" },
    exitCriteria: { type: "object" }
  },
  required: ["agent", "status", "summary", "timestamp"]
};

function stagePrompt(stageName, userGoal, priorHandoff) {
  const context = priorHandoff
    ? `\n\nPrior handoff from ${priorHandoff.agent}:\n${JSON.stringify(priorHandoff, null, 2)}`
    : "";
  return `You are the ${stageName} agent. Read context/README.md and all files it lists before starting.\n\nUser goal: ${userGoal}${context}\n\nWrite your handoff to ${HANDOFF_DIR}/${stageName}-<ISO-timestamp>.json per skills/closed-loop/handoffs.md.`;
}

function hasCritical(handoff) {
  if (!handoff) return false;
  if (handoff.exitCriteria?.no_critical_findings === false) return true;
  const items = [...(handoff.findings || []), ...(handoff.feedback || [])];
  return items.some(
    (f) => f.severity === "critical" || f.severity === "high"
  );
}

// Phase 1: Spec & Architecture
phase("Spec & Architecture");
const spec = await agent(stagePrompt("product-spec", args, null), {
  label: "product-spec",
  phase: "Spec & Architecture",
  schema: HANDOFF_SCHEMA
});
if (spec.status !== "success") return { status: "failed", stage: "product-spec", handoff: spec };

const arch = await agent(stagePrompt("architect", args, spec), {
  label: "architect",
  phase: "Spec & Architecture",
  schema: HANDOFF_SCHEMA
});
if (arch.status !== "success") return { status: "failed", stage: "architect", handoff: arch };

// Implementation → Verification → Quality Gates loop
let implHandoff = null;
let retries = 0;

while (retries < MAX_RETRIES) {
  // Phase 2: Implementation
  phase("Implementation");
  const impl = await agent(
    stagePrompt("implementer", args, implHandoff || arch),
    { label: `implementer-${retries}`, phase: "Implementation", schema: HANDOFF_SCHEMA }
  );
  if (impl.status === "failed" || impl.status === "blocked") {
    return { status: "paused", stage: "implementer", handoff: impl, retries };
  }

  // Phase 3: Verification
  phase("Verification");
  const verify = await agent(stagePrompt("verifier", args, impl), {
    label: `verifier-${retries}`,
    phase: "Verification",
    schema: HANDOFF_SCHEMA
  });
  if (verify.status === "needs_revision") {
    implHandoff = verify;
    retries++;
    continue;
  }
  if (verify.status !== "success") {
    return { status: "paused", stage: "verifier", handoff: verify, retries };
  }

  // Phase 4: Quality Gates (reviewer + security-reviewer in parallel, then QA)
  phase("Quality Gates");
  const [review, secReview] = await parallel([
    () =>
      agent(stagePrompt("reviewer", args, verify), {
        label: `reviewer-${retries}`,
        phase: "Quality Gates",
        schema: HANDOFF_SCHEMA
      }),
    () =>
      agent(stagePrompt("security-reviewer", args, verify), {
        label: `security-reviewer-${retries}`,
        phase: "Quality Gates",
        schema: HANDOFF_SCHEMA
      })
  ]);

  if (hasCritical(review) || hasCritical(secReview)) {
    implHandoff = {
      agent: "quality-gates",
      status: "needs_revision",
      summary: "Critical findings from review",
      timestamp: new Date().toISOString(),
      findings: [...(review.findings || []), ...(secReview.findings || [])],
      feedback: [...(review.feedback || []), ...(secReview.feedback || [])]
    };
    retries++;
    continue;
  }

  const qa = await agent(stagePrompt("qa-acceptance", args, verify), {
    label: `qa-acceptance-${retries}`,
    phase: "Quality Gates",
    schema: HANDOFF_SCHEMA
  });

  if (qa.status === "needs_revision") {
    implHandoff = qa;
    retries++;
    continue;
  }
  if (qa.status !== "success") {
    return { status: "paused", stage: "qa-acceptance", handoff: qa, retries };
  }

  // Phase 5: Integration
  phase("Integration");
  const integrate = await agent(stagePrompt("integrator", args, qa), {
    label: "integrator",
    phase: "Integration",
    schema: HANDOFF_SCHEMA
  });

  return {
    status: integrate.status === "success" ? "complete" : "paused",
    stage: "integrator",
    handoff: integrate,
    retries
  };
}

return { status: "paused", reason: `Max retries (${MAX_RETRIES}) on implementation loop`, retries };
