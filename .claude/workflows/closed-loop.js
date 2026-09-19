export const meta = {
  name: "closed-loop",
  description: "Full agent pipeline: software-engineer, verify, review, QA, integrate",
  phases: [
    { title: "Software Engineering" },
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

// Software Engineering → Verification → Quality Gates loop
let seHandoff = null;
let retries = 0;

while (retries < MAX_RETRIES) {
  // Phase 1: Software Engineering (spec + architecture + implementation)
  phase("Software Engineering");
  const se = await agent(
    stagePrompt("software-engineer", args, seHandoff),
    { label: `software-engineer-${retries}`, phase: "Software Engineering", schema: HANDOFF_SCHEMA }
  );
  if (se.status === "failed" || se.status === "blocked") {
    return { status: "paused", stage: "software-engineer", handoff: se, retries };
  }

  // Phase 2: Verification
  phase("Verification");
  const verify = await agent(stagePrompt("verifier", args, se), {
    label: `verifier-${retries}`,
    phase: "Verification",
    schema: HANDOFF_SCHEMA
  });
  if (verify.status === "needs_revision") {
    seHandoff = verify;
    retries++;
    continue;
  }
  if (verify.status !== "success") {
    return { status: "paused", stage: "verifier", handoff: verify, retries };
  }

  // Phase 3: Quality Gates (reviewer + security-reviewer in parallel, then QA)
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

  const combinedReview = {
    agent: "quality-gates",
    status: (review.status === "success" && secReview.status === "success") ? "success" : "needs_revision",
    summary: [review.summary, secReview.summary].filter(Boolean).join(" | "),
    timestamp: new Date().toISOString(),
    findings: [...(review.findings || []), ...(secReview.findings || [])],
    feedback: [...(review.feedback || []), ...(secReview.feedback || [])]
  };

  if (hasCritical(review) || hasCritical(secReview)) {
    seHandoff = combinedReview;
    retries++;
    continue;
  }

  const qa = await agent(stagePrompt("qa-acceptance", args, combinedReview), {
    label: `qa-acceptance-${retries}`,
    phase: "Quality Gates",
    schema: HANDOFF_SCHEMA
  });

  if (qa.status === "needs_revision") {
    seHandoff = qa;
    retries++;
    continue;
  }
  if (qa.status !== "success") {
    return { status: "paused", stage: "qa-acceptance", handoff: qa, retries };
  }

  // Phase 4: Integration
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
