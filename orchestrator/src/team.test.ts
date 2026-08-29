import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  clampLoopBackTo,
  clampNextStage,
  combineHandoffs,
  missingHandoff,
  nextInSequence,
  stagesToDispatch,
  teamMissing,
} from "./team.js";
import type { Handoff, LoopState, Stage } from "./types.js";
import { REQUIRED_TEAM } from "./types.js";

function handoff(
  agent: string,
  status: Handoff["status"],
  extra: Partial<Handoff> = {},
): Handoff {
  return {
    agent,
    status,
    summary: `${agent} ${status}`,
    timestamp: "2026-08-29T00:00:00.000Z",
    ...extra,
  };
}

describe("stagesToDispatch", () => {
  it("runs reviewer and security-reviewer together", () => {
    assert.deepEqual(stagesToDispatch("reviewer"), ["reviewer", "security-reviewer"]);
  });

  it("runs a single specialist stage as itself", () => {
    assert.deepEqual(stagesToDispatch("implementer"), ["implementer"]);
    assert.deepEqual(stagesToDispatch("verifier"), ["verifier"]);
  });
});

describe("clampNextStage — never skip the team", () => {
  it("blocks implementer from jumping to integrator", () => {
    assert.equal(clampNextStage("implementer", "integrator"), "verifier");
  });

  it("blocks verifier from jumping to integrator", () => {
    assert.equal(clampNextStage("verifier", "integrator"), "reviewer");
  });

  it("blocks verifier from jumping to release", () => {
    assert.equal(clampNextStage("verifier", "release"), "reviewer");
  });

  it("after reviewer, next is qa-acceptance (security-reviewer already parallel)", () => {
    assert.equal(clampNextStage("reviewer", "security-reviewer"), "qa-acceptance");
    assert.equal(clampNextStage("reviewer", "integrator"), "qa-acceptance");
    assert.equal(nextInSequence("reviewer"), "qa-acceptance");
  });

  it("allows optional design-ux after architect", () => {
    assert.equal(clampNextStage("architect", "design-ux"), "design-ux");
  });

  it("does not treat frontend as a pipeline skip", () => {
    assert.equal(clampNextStage("implementer", "frontend"), "verifier");
  });

  it("advances architect to implementer when no optional insert requested", () => {
    assert.equal(clampNextStage("architect", "implementer"), "implementer");
    assert.equal(clampNextStage("architect", undefined), "implementer");
  });

  it("keeps qa-acceptance from skipping integrator", () => {
    assert.equal(clampNextStage("qa-acceptance", "release"), "integrator");
  });
});

describe("clampLoopBackTo", () => {
  it("rejects a forward skip to integrator", () => {
    assert.equal(clampLoopBackTo("integrator"), "implementer");
    assert.equal(clampLoopBackTo("release"), "implementer");
    assert.equal(clampLoopBackTo("qa-acceptance"), "implementer");
  });

  it("allows product-spec, architect, implementer, debugger", () => {
    assert.equal(clampLoopBackTo("product-spec"), "product-spec");
    assert.equal(clampLoopBackTo("architect"), "architect");
    assert.equal(clampLoopBackTo("implementer"), "implementer");
    assert.equal(clampLoopBackTo("debugger"), "debugger");
  });
});

describe("missingHandoff", () => {
  it("is failed, never success", () => {
    const result = missingHandoff("verifier");
    assert.equal(result.status, "failed");
    assert.notEqual(result.status, "success");
    assert.match(result.summary, /loop\/handoffs/);
  });
});

describe("combineHandoffs", () => {
  it("promotes critical findings on an otherwise successful review", () => {
    const combined = combineHandoffs([
      handoff("reviewer", "success", {
        findings: [{ severity: "critical", issue: "broken auth" }],
      }),
      handoff("security-reviewer", "success"),
    ]);
    assert.equal(combined.status, "needs_revision");
    assert.equal(combined.loopBackTo, "implementer");
    assert.equal(combined.nextStage, undefined);
    assert.equal(combined.findings?.length, 1);
  });

  it("promotes exitCriteria.no_critical_findings === false", () => {
    const combined = combineHandoffs([
      handoff("reviewer", "success", {
        exitCriteria: { no_critical_findings: false },
      }),
    ]);
    assert.equal(combined.status, "needs_revision");
  });

  it("treats unknown status as failed", () => {
    const combined = combineHandoffs([
      handoff("verifier", "success", { status: "ok" as Handoff["status"] }),
    ]);
    assert.equal(combined.status, "failed");
  });

  it("fails the gate if security-reviewer fails", () => {
    const combined = combineHandoffs([
      handoff("reviewer", "success"),
      handoff("security-reviewer", "failed", { summary: "secret leaked" }),
    ]);
    assert.equal(combined.status, "failed");
  });

  it("succeeds only when both quality gates pass", () => {
    const combined = combineHandoffs([
      handoff("reviewer", "success"),
      handoff("security-reviewer", "success"),
    ]);
    assert.equal(combined.status, "success");
    assert.equal(combined.nextStage, "qa-acceptance");
    assert.match(combined.agent, /reviewer/);
    assert.match(combined.agent, /security-reviewer/);
  });

  it("ANDs exitCriteria so a later true cannot hide an earlier false", () => {
    const combined = combineHandoffs([
      handoff("reviewer", "needs_revision", {
        exitCriteria: { no_critical_findings: false },
      }),
      handoff("security-reviewer", "success", {
        exitCriteria: { no_critical_findings: true },
      }),
    ]);
    assert.equal(combined.exitCriteria?.no_critical_findings, false);
  });
});

describe("teamMissing", () => {
  it("lists every required member not yet dispatched", () => {
    const state = {
      dispatched: ["product-spec", "architect"] as Stage[],
      completedStages: ["product-spec"] as Stage[],
    };
    const missing = teamMissing(state);
    assert.ok(missing.includes("implementer"));
    assert.ok(missing.includes("verifier"));
    assert.ok(missing.includes("reviewer"));
    assert.ok(missing.includes("security-reviewer"));
    assert.ok(!missing.includes("product-spec"));
    assert.ok(!missing.includes("architect"));
  });

  it("is empty when the required team all ran", () => {
    const state: Pick<LoopState, "dispatched" | "completedStages"> = {
      dispatched: [...REQUIRED_TEAM],
      completedStages: [...REQUIRED_TEAM],
    };
    assert.deepEqual(teamMissing(state), []);
  });
});
