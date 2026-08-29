import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, it } from "node:test";
import { REPO_ROOT } from "./types.js";

const GITHUB_ACTIONS_APP_ID = 15368;
const RULESET_PATH = join(REPO_ROOT, ".github", "rulesets", "require-ci-on-main.json");
const WORKFLOW_PATH = join(REPO_ROOT, ".github", "workflows", "ci.yml");

describe("required CI ruleset", () => {
  it("parses job names from a workflow fixture, not from a top-level name", () => {
    const jobs = parseWorkflowJobs(`name: CI
on: push
jobs:
  test:
    name: Lint, Typecheck, and Test
    runs-on: ubuntu-latest
  orchestrator:
    name: Orchestrator loop
    runs-on: ubuntu-latest
  ci:
    name: CI
    needs: [test, orchestrator]
    runs-on: ubuntu-latest
`);
    assert.deepEqual(
      jobs.map((job) => job.name),
      ["Lint, Typecheck, and Test", "Orchestrator loop", "CI"],
    );
    const gate = jobs.find((job) => job.name === "CI");
    assert.deepEqual(gate?.needs, ["test", "orchestrator"]);
  });

  it("rejects a required check that is not a workflow job name", () => {
    assert.throws(
      () => assertRequiredChecksAreJobNames(["CI", "Ghost job"], ["CI"]),
      /Ghost job/,
    );
  });

  it("keeps the committed ruleset aligned with ci.yml job names", async () => {
    const ruleset = JSON.parse(await readFile(RULESET_PATH, "utf-8")) as RulesetPayload;
    const workflow = await readFile(WORKFLOW_PATH, "utf-8");
    const jobs = parseWorkflowJobs(workflow);
    const required = requiredCheckContexts(ruleset);

    assert.equal(ruleset.name, "Require CI on main");
    assert.equal(ruleset.enforcement, "active");
    assert.equal(ruleset.target, "branch");
    assert.deepEqual(ruleset.conditions?.ref_name?.include, ["~DEFAULT_BRANCH"]);
    assert.ok(
      ruleset.rules.some((rule) => rule.type === "deletion"),
      "ruleset must block deleting the default branch",
    );
    assert.ok(
      ruleset.rules.some((rule) => rule.type === "non_fast_forward"),
      "ruleset must block force-pushes",
    );

    assertRequiredChecksAreJobNames(
      required.map((check) => check.context),
      jobs.map((job) => job.name),
    );
    for (const check of required) {
      assert.equal(check.integration_id, GITHUB_ACTIONS_APP_ID);
    }

    const gate = jobs.find((job) => job.name === "CI");
    assert.ok(gate, "workflow must have a job named CI");
    assert.deepEqual(gate.needs, ["test", "orchestrator"]);
    assert.match(workflow, /^permissions:\n  contents: read$/m);
    assert.match(workflow, /^  merge_group:\s*$/m);
  });
});

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

function parseWorkflowJobs(yaml: string): WorkflowJob[] {
  const lines = yaml.split(/\r?\n/);
  const jobs: WorkflowJob[] = [];
  let inJobs = false;
  let current: WorkflowJob | null = null;

  for (const line of lines) {
    if (!inJobs) {
      if (/^jobs:\s*$/.test(line)) inJobs = true;
      continue;
    }
    if (/^\S/.test(line) && line.trim() !== "") break;

    const jobMatch = line.match(/^  ([A-Za-z0-9_-]+):\s*$/);
    if (jobMatch) {
      current = { id: jobMatch[1], name: jobMatch[1], needs: [] };
      jobs.push(current);
      continue;
    }
    if (!current) continue;

    const nameMatch = line.match(/^    name:\s*(.+?)\s*$/);
    if (nameMatch) {
      current.name = unquoteYaml(nameMatch[1]);
      continue;
    }
    const needsMatch = line.match(/^    needs:\s*\[([^\]]*)\]\s*$/);
    if (needsMatch) {
      current.needs = needsMatch[1]
        .split(",")
        .map((part) => part.trim())
        .filter(Boolean);
    }
  }

  return jobs;
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
};

type RequiredStatusCheck = {
  context: string;
  integration_id?: number;
};

type RulesetPayload = {
  name: string;
  target: string;
  enforcement: string;
  conditions?: { ref_name?: { include?: string[] } };
  rules: Array<{
    type: string;
    parameters?: { required_status_checks?: RequiredStatusCheck[] };
  }>;
};
