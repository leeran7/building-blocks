import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, it } from "node:test";
import { REPO_ROOT } from "./types.js";

const RULESET_PATH = join(REPO_ROOT, ".github", "rulesets", "require-ci-on-main.json");
const WORKFLOW_PATH = join(REPO_ROOT, ".github", "workflows", "ci.yml");
const HAS_PRODUCT_CI = existsSync(RULESET_PATH) && existsSync(WORKFLOW_PATH);

describe("required CI ruleset", () => {
  it("parses job names, needs, and if: from a workflow fixture, not from a top-level name", () => {
    const workflow = parseWorkflow(`name: CI
on:
  pull_request:
  merge_group:
permissions:
  contents: read
jobs:
  test:
    name: Lint, Typecheck, and Test
    runs-on: ubuntu-latest
  orchestrator:
    name: Orchestrator loop
    runs-on: ubuntu-latest
  ci:
    name: CI
    if: always()
    needs: [test, orchestrator]
    runs-on: ubuntu-latest
`);
    assert.deepEqual(
      workflow.jobs.map((job) => job.name),
      ["Lint, Typecheck, and Test", "Orchestrator loop", "CI"],
    );
    const gate = workflow.jobs.find((job) => job.name === "CI");
    assert.deepEqual(gate?.needs, ["test", "orchestrator"]);
    assert.equal(gate?.ifExpr, "always()");
    assert.equal(workflow.permissions.contents, "read");
    assert.equal(workflow.on.merge_group, true);
  });

  it("rejects a required check that is not a workflow job name", () => {
    assert.throws(
      () => assertRequiredChecksAreJobNames(["CI", "Ghost job"], ["CI"]),
      /Ghost job/,
    );
  });

  it("rejects a skipped or failed child as aggregator success", () => {
    assert.equal(aggregatorPassed("success", "success"), true);
    assert.equal(aggregatorPassed("failure", "success"), false);
    assert.equal(aggregatorPassed("success", "skipped"), false);
    assert.equal(aggregatorPassed("cancelled", "success"), false);
  });

  it("validateRulesetPayload refuses disabled, bypass, and unpinned checks", async () => {
    const {
      validateRulesetPayload,
      resolveRulesetPath,
      assertRepoName,
      GITHUB_ACTIONS_APP_ID,
    } = await loadApplyScript();
    const good = structuredClone(VALID_RULESET);
    validateRulesetPayload(good);

    const disabled = structuredClone(VALID_RULESET);
    disabled.enforcement = "disabled";
    assert.throws(() => validateRulesetPayload(disabled), /active/);

    const bypass = structuredClone(VALID_RULESET);
    bypass.bypass_actors = [{ actor_id: 1, actor_type: "OrganizationAdmin", bypass_mode: "always" }];
    assert.throws(() => validateRulesetPayload(bypass), /bypass/);

    const unpinned = structuredClone(VALID_RULESET);
    const checks = unpinned.rules.find((rule) => rule.type === "required_status_checks")
      ?.parameters?.required_status_checks;
    assert.ok(checks);
    delete checks[0].integration_id;
    assert.throws(() => validateRulesetPayload(unpinned), /GitHub Actions/);

    assert.equal(GITHUB_ACTIONS_APP_ID, 15368);
    assert.equal(assertRepoName("leeran7/building-blocks"), "leeran7/building-blocks");
    assert.throws(() => assertRepoName("../etc/passwd"), /Invalid owner\/repo/);
    assert.throws(() => resolveRulesetPath("/tmp/backdoor.json"), /must be under/);
  });

  it("keeps the committed ruleset aligned with ci.yml when those files exist", { skip: !HAS_PRODUCT_CI }, async () => {
    const { validateRulesetPayload, REQUIRED_CHECK_CONTEXTS } = await loadApplyScript();
    const ruleset = JSON.parse(await readFile(RULESET_PATH, "utf-8")) as RulesetPayload;
    const workflow = parseWorkflow(await readFile(WORKFLOW_PATH, "utf-8"));
    const required = requiredCheckContexts(ruleset);

    validateRulesetPayload(ruleset);
    assertRequiredChecksAreJobNames(
      required.map((check) => check.context),
      workflow.jobs.map((job) => job.name),
    );
    assert.deepEqual([...required.map((check) => check.context)].sort(), [...REQUIRED_CHECK_CONTEXTS].sort());

    const gate = workflow.jobs.find((job) => job.name === "CI");
    assert.ok(gate, "workflow must have a job named CI");
    assert.equal(gate.ifExpr, "always()");
    assert.deepEqual(gate.needs, ["test", "orchestrator"]);
    assert.equal(gate.continueOnError, false);
    assert.equal(workflow.permissions.contents, "read");
    assert.equal(workflow.on.merge_group, true);
    for (const job of workflow.jobs) {
      assert.equal(job.continueOnError, false, `${job.id} must not continue-on-error`);
    }
  });
});

async function loadApplyScript() {
  const href = new URL("../../scripts/apply-github-ruleset.mjs", import.meta.url).href;
  return (await import(href)) as ApplyScriptModule;
}

function requiredCheckContexts(ruleset: RulesetPayload): RequiredStatusCheck[] {
  const rule = ruleset.rules.find((item) => item.type === "required_status_checks");
  const checks = rule?.parameters?.required_status_checks;
  if (!checks?.length) {
    throw new Error("ruleset has no required_status_checks");
  }
  return checks;
}

function assertRequiredChecksAreJobNames(contexts: string[], jobNames: string[]) {
  const missing = contexts.filter((context) => !jobNames.includes(context));
  if (missing.length > 0) {
    throw new Error(`Required checks missing from workflow job names: ${missing.join(", ")}`);
  }
}

function aggregatorPassed(testResult: string, orchestratorResult: string): boolean {
  return testResult === "success" && orchestratorResult === "success";
}

function parseWorkflow(yaml: string): ParsedWorkflow {
  const lines = yaml.split(/\r?\n/);
  const jobs: WorkflowJob[] = [];
  const permissions: Record<string, string> = {};
  const on: { merge_group: boolean } = { merge_group: false };
  let section: "none" | "on" | "permissions" | "jobs" = "none";
  let current: WorkflowJob | null = null;

  for (const line of lines) {
    if (/^on:\s*$/.test(line)) {
      section = "on";
      current = null;
      continue;
    }
    if (/^permissions:\s*$/.test(line)) {
      section = "permissions";
      current = null;
      continue;
    }
    if (/^jobs:\s*$/.test(line)) {
      section = "jobs";
      current = null;
      continue;
    }
    if (/^\S/.test(line) && line.trim() !== "") {
      section = "none";
      current = null;
      continue;
    }

    if (section === "on" && /^  merge_group:\s*$/.test(line)) {
      on.merge_group = true;
      continue;
    }
    if (section === "permissions") {
      const perm = line.match(/^  ([A-Za-z0-9_-]+):\s*(.+?)\s*$/);
      if (perm) permissions[perm[1]] = unquoteYaml(perm[2]);
      continue;
    }
    if (section !== "jobs") continue;

    const jobMatch = line.match(/^  ([A-Za-z0-9_-]+):\s*$/);
    if (jobMatch) {
      current = {
        id: jobMatch[1],
        name: jobMatch[1],
        needs: [],
        ifExpr: "",
        continueOnError: false,
      };
      jobs.push(current);
      continue;
    }
    if (!current) continue;

    const nameMatch = line.match(/^    name:\s*(.+?)\s*$/);
    if (nameMatch) {
      current.name = unquoteYaml(nameMatch[1]);
      continue;
    }
    const ifMatch = line.match(/^    if:\s*(.+?)\s*$/);
    if (ifMatch) {
      current.ifExpr = unquoteYaml(ifMatch[1]);
      continue;
    }
    const needsMatch = line.match(/^    needs:\s*\[([^\]]*)\]\s*$/);
    if (needsMatch) {
      current.needs = needsMatch[1]
        .split(",")
        .map((part) => part.trim())
        .filter(Boolean);
      continue;
    }
    if (/^    continue-on-error:\s*true\s*$/.test(line)) {
      current.continueOnError = true;
    }
  }

  return { jobs, permissions, on };
}

function unquoteYaml(value: string): string {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }
  return value;
}

type WorkflowJob = {
  id: string;
  name: string;
  needs: string[];
  ifExpr: string;
  continueOnError: boolean;
};

type ParsedWorkflow = {
  jobs: WorkflowJob[];
  permissions: Record<string, string>;
  on: { merge_group: boolean };
};

type RequiredStatusCheck = {
  context: string;
  integration_id?: number;
};

type RulesetPayload = {
  name: string;
  target: string;
  enforcement: string;
  bypass_actors?: unknown[];
  conditions?: { ref_name?: { include?: string[]; exclude?: string[] } };
  rules: Array<{
    type: string;
    parameters?: {
      strict_required_status_checks_policy?: boolean;
      required_status_checks?: RequiredStatusCheck[];
    };
  }>;
};

type ApplyScriptModule = {
  validateRulesetPayload: (payload: RulesetPayload) => void;
  resolveRulesetPath: (fileArg?: string) => string;
  assertRepoName: (name: string) => string;
  GITHUB_ACTIONS_APP_ID: number;
  REQUIRED_CHECK_CONTEXTS: string[];
};

const VALID_RULESET: RulesetPayload = {
  name: "Require CI on main",
  target: "branch",
  enforcement: "active",
  conditions: { ref_name: { include: ["~DEFAULT_BRANCH"], exclude: [] } },
  rules: [
    { type: "deletion" },
    { type: "non_fast_forward" },
    {
      type: "required_status_checks",
      parameters: {
        strict_required_status_checks_policy: true,
        required_status_checks: [
          { context: "Lint, Typecheck, and Test", integration_id: 15368 },
          { context: "Orchestrator loop", integration_id: 15368 },
          { context: "CI", integration_id: 15368 },
        ],
      },
    },
  ],
};
