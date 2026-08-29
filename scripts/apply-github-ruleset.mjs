#!/usr/bin/env node
/**
 * Create or update a GitHub repository ruleset from a JSON payload.
 * Needs a token with Administration permission (repo admin PAT or gh auth).
 * The Cursor GitHub App token cannot do this (403).
 */
import { readFile } from "node:fs/promises";
import { dirname, isAbsolute, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_RULESET = join(ROOT, ".github", "rulesets", "require-ci-on-main.json");

const argv = process.argv.slice(2);
const dryRun = argv.includes("--dry-run");
const fileArg = valueAfter(argv, "--file");
const payloadPath = fileArg
  ? isAbsolute(fileArg)
    ? fileArg
    : join(process.cwd(), fileArg)
  : DEFAULT_RULESET;

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});

async function main() {
  const payload = JSON.parse(await readFile(payloadPath, "utf-8"));
  validateRulesetPayload(payload);

  const nameWithOwner = await repoNameWithOwner();
  const existing = await listRulesets(nameWithOwner);
  const match = existing.find((r) => r.name === payload.name);
  const action = match ? "update" : "create";
  const path = match
    ? `repos/${nameWithOwner}/rulesets/${match.id}`
    : `repos/${nameWithOwner}/rulesets`;
  const method = match ? "PUT" : "POST";

  if (dryRun) {
    console.log(`${action} ${path}`);
    console.log(JSON.stringify(payload, null, 2));
    return;
  }

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

function validateRulesetPayload(payload) {
  if (!payload || typeof payload !== "object") {
    throw new Error("Ruleset payload must be a JSON object");
  }
  if (typeof payload.name !== "string" || payload.name.trim() === "") {
    throw new Error("Ruleset payload must include a non-empty name");
  }
  if (payload.target !== "branch") {
    throw new Error('Ruleset payload target must be "branch"');
  }
  if (!["active", "evaluate", "disabled"].includes(payload.enforcement)) {
    throw new Error('Ruleset payload enforcement must be "active", "evaluate", or "disabled"');
  }
  if (!Array.isArray(payload.rules) || payload.rules.length === 0) {
    throw new Error("Ruleset payload must include a non-empty rules array");
  }
  const status = payload.rules.find((rule) => rule.type === "required_status_checks");
  if (!status?.parameters?.required_status_checks?.length) {
    throw new Error("Ruleset payload must require at least one status check");
  }
}

async function repoNameWithOwner() {
  if (process.env.GITHUB_REPOSITORY) return process.env.GITHUB_REPOSITORY;
  const data = await ghJson(["repo", "view", "--json", "nameWithOwner"]);
  if (!data?.nameWithOwner) {
    throw new Error("Could not resolve owner/repo. Set GITHUB_REPOSITORY or run from a gh-authenticated clone.");
  }
  return data.nameWithOwner;
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
