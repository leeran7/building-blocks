#!/usr/bin/env node
import { readFile, readdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const AGENTS_SRC = join(ROOT, "agents");
const RULES_PATH = join(ROOT, "pack", "hygiene-rules.json");

export async function loadRules() {
  return JSON.parse(await readFile(RULES_PATH, "utf-8"));
}

export async function lintAgents(root = ROOT) {
  const rules = JSON.parse(await readFile(join(root, "pack", "hygiene-rules.json"), "utf-8"));
  const agentsDir = join(root, "agents");
  const files = (await readdir(agentsDir)).filter((f) => f.endsWith(".md"));
  const violations = [];

  for (const file of files) {
    const text = await readFile(join(agentsDir, file), "utf-8");
    for (const needle of rules.bannedSubstrings ?? []) {
      if (text.includes(needle)) {
        violations.push({ file, kind: "substring", needle });
      }
    }
    for (const pattern of rules.bannedRegex ?? []) {
      if (new RegExp(pattern).test(text)) {
        violations.push({ file, kind: "regex", needle: pattern });
      }
    }
    for (const needle of rules.requiredSubstrings ?? []) {
      if (!text.includes(needle)) {
        violations.push({ file, kind: "missing", needle });
      }
    }
  }

  return { filesChecked: files.length, violations };
}

export function protocolMarkers(protocolBody) {
  return {
    start: "<!-- closed-loop:protocol -->\n",
    end: "<!-- /closed-loop:protocol -->\n",
    block: `<!-- closed-loop:protocol -->\n${protocolBody.trim()}\n<!-- /closed-loop:protocol -->\n\n`,
  };
}

export function stripProtocol(body) {
  return body.replace(
    /<!-- closed-loop:protocol -->[\s\S]*?<!-- \/closed-loop:protocol -->\n*/g,
    "",
  );
}

export function prependProtocol(body, protocolBody) {
  const stripped = stripProtocol(body).replace(/^\n+/, "");
  return `${protocolMarkers(protocolBody).block}${stripped}`;
}

async function main() {
  const { filesChecked, violations } = await lintAgents();
  if (violations.length > 0) {
    console.error(`Pack hygiene failed (${violations.length} leak(s) in ${filesChecked} agents):`);
    for (const v of violations) {
      console.error(`  ${v.file}: ${v.kind} ${JSON.stringify(v.needle)}`);
    }
    process.exit(1);
  }
  console.log(`Pack hygiene ok (${filesChecked} source agents in agents/*.md scanned, 0 violations)`);
}

const isDirect = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isDirect) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
