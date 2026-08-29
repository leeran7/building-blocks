#!/usr/bin/env node
/**
 * Create or update a GitHub repository ruleset from a JSON payload.
 * Needs a token with Administration permission (repo admin PAT or gh auth).
 * The Cursor GitHub App token cannot do this (403).
 */
import { readFile } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

export const GITHUB_ACTIONS_APP_ID = 15368;
export const RULESET_NAME = "Require CI on main";
export const REQUIRED_CHECK_CONTEXTS = [
  "Lint, Typecheck, and Test",
  "Orchestrator loop",
  "CI",
];

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const RULESETS_DIR = resolve(join(ROOT, ".github", "rulesets"));
const DEFAULT_RULESET = join(RULESETS_DIR, "require-ci-on-main.json");
const REPO_NAME_RE = /^[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+$/;

const isDirect =
  Boolean(process.argv[1]) && fileURLToPath(import.meta.url) === process.argv[1];
if (isDirect) {
  main(process.argv.slice(2)).catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
}

async function main(argv) {
  const dryRun = argv.includes("--dry-run");
  const payloadPath = resolveRulesetPath(valueAfter(argv, "--file"));
  const payload = JSON.parse(await readFile(payloadPath, "utf-8"));
  validateRulesetPayload(payload);

  if (dryRun) {
    console.log(`validate ${payloadPath}`);
    console.log(JSON.stringify(payload, null, 2));
    return;
  }

  const nameWithOwner = await repoNameWithOwner();
  const existing = await listRulesets(nameWithOwner);
  const match = existing.find((r) => r.name === payload.name);
  const action = match ? "update" : "create";
  const path = match
    ? `repos/${nameWithOwner}/rulesets/${assertRulesetId(match.id)}`
    : `repos/${nameWithOwner}/rulesets`;
  const method = match ? "PUT" : "POST";

  let result;
  try {
    result = await ghJson(["api", "--method", method, path, "--input", "-"], payload);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(
      `${message}\n\nA repo admin must apply this ruleset.\nUI: https://github.com/${nameWithOwner}/settings/rules\nPayload: ${payloadPath}`,
    );
  }
  console.log(
    `${action === "create" ? "Created" : "Updated"} ruleset ${result.id} "${result.name}" (${result.enforcement})`,
  );
  console.log(`https://github.com/${nameWithOwner}/settings/rules`);
}

export function resolveRulesetPath(fileArg) {
  const candidate = fileArg
    ? isAbsolute(fileArg)
      ? fileArg
      : join(process.cwd(), fileArg)
    : DEFAULT_RULESET;
  const resolved = resolve(candidate);
  const rel = relative(RULESETS_DIR, resolved);
  if (rel.startsWith("..") || rel === "" || isAbsolute(rel)) {
    throw new Error(`Ruleset file must be under .github/rulesets/: ${resolved}`);
  }
  return resolved;
}

export function validateRulesetPayload(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error("Ruleset payload must be a JSON object");
  }
  if (payload.name !== RULESET_NAME) {
    throw new Error(`Ruleset name must be "${RULESET_NAME}"`);
  }
  if (payload.target !== "branch") {
    throw new Error('Ruleset payload target must be "branch"');
  }
  if (payload.enforcement !== "active") {
    throw new Error('Ruleset payload enforcement must be "active"');
  }
  const include = payload.conditions?.ref_name?.include;
  const exclude = payload.conditions?.ref_name?.exclude ?? [];
  if (!Array.isArray(include) || include.length !== 1 || include[0] !== "~DEFAULT_BRANCH") {
    throw new Error('Ruleset must target exactly ["~DEFAULT_BRANCH"]');
  }
  if (!Array.isArray(exclude) || exclude.length !== 0) {
    throw new Error("Ruleset must not exclude any refs");
  }
  if (payload.bypass_actors && !(Array.isArray(payload.bypass_actors) && payload.bypass_actors.length === 0)) {
    throw new Error("Ruleset must not list bypass actors");
  }
  if (!Array.isArray(payload.rules)) {
    throw new Error("Ruleset payload must include a rules array");
  }
  if (!payload.rules.some((rule) => rule.type === "deletion")) {
    throw new Error("Ruleset must block branch deletion");
  }
  if (!payload.rules.some((rule) => rule.type === "non_fast_forward")) {
    throw new Error("Ruleset must block force-pushes");
  }
  const status = payload.rules.find((rule) => rule.type === "required_status_checks");
  const checks = status?.parameters?.required_status_checks;
  if (!Array.isArray(checks) || checks.length !== REQUIRED_CHECK_CONTEXTS.length) {
    throw new Error("Ruleset must require exactly the CI job names");
  }
  if (status.parameters.strict_required_status_checks_policy !== true) {
    throw new Error("Ruleset must require branches to be up to date");
  }
  const contexts = checks.map((check) => check.context);
  for (const name of REQUIRED_CHECK_CONTEXTS) {
    if (!contexts.includes(name)) {
      throw new Error(`Ruleset missing required check ${name}`);
    }
  }
  for (const check of checks) {
    if (check.integration_id !== GITHUB_ACTIONS_APP_ID) {
      throw new Error(`Check ${check.context} must come from GitHub Actions (id ${GITHUB_ACTIONS_APP_ID})`);
    }
  }
}

export function assertRepoName(name) {
  if (typeof name !== "string" || !REPO_NAME_RE.test(name)) {
    throw new Error(`Invalid owner/repo: ${name}`);
  }
  return name;
}

export function assertRulesetId(id) {
  if (!Number.isInteger(id) || id <= 0) {
    throw new Error(`Invalid ruleset id: ${id}`);
  }
  return id;
}

async function repoNameWithOwner() {
  if (process.env.GITHUB_REPOSITORY) {
    return assertRepoName(process.env.GITHUB_REPOSITORY);
  }
  const data = await ghJson(["repo", "view", "--json", "nameWithOwner"]);
  if (!data?.nameWithOwner) {
    throw new Error("Could not resolve owner/repo. Set GITHUB_REPOSITORY or run from a gh-authenticated clone.");
  }
  return assertRepoName(data.nameWithOwner);
}

async function listRulesets(nameWithOwner) {
  try {
    const list = await ghJson(["api", `repos/${nameWithOwner}/rulesets`]);
    return Array.isArray(list) ? list : [];
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(
      `${message}\n\nA repo admin must apply this ruleset. UI: https://github.com/${nameWithOwner}/settings/rules`,
    );
  }
}

function ghJson(args, stdinObject) {
  return new Promise((resolve, reject) => {
    const child = spawn("gh", args, {
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", (err) => {
      reject(new Error(`Failed to run gh: ${err.message}`));
    });
    child.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(stderr.trim() || stdout.trim() || `gh ${args.join(" ")} exited ${code}`));
        return;
      }
      try {
        resolve(stdout.trim() ? JSON.parse(stdout) : {});
      } catch {
        reject(new Error(`gh returned non-JSON:\n${stdout}`));
      }
    });
    if (stdinObject !== undefined) {
      child.stdin.end(JSON.stringify(stdinObject));
    } else {
      child.stdin.end();
    }
  });
}

function valueAfter(args, flag) {
  const index = args.indexOf(flag);
  if (index === -1) return undefined;
  return args[index + 1];
}
