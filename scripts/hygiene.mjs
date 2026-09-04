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

export async function listAgentMarkdown(agentsDir) {
  const files = [];
  let entries;
  try {
    entries = await readdir(agentsDir, { withFileTypes: true });
  } catch {
    return files;
  }

  for (const entry of entries) {
    if (entry.isFile() && entry.name.endsWith(".md")) {
      files.push({ file: entry.name, path: join(agentsDir, entry.name) });
      continue;
    }
    if (!entry.isDirectory()) continue;

    const roleDir = join(agentsDir, entry.name);
    for (const partial of await readdir(roleDir, { withFileTypes: true })) {
      if (partial.isFile() && partial.name.endsWith(".md")) {
        files.push({
          file: `${entry.name}/${partial.name}`,
          path: join(roleDir, partial.name),
        });
      }
    }
  }

  return files.sort((a, b) => a.file.localeCompare(b.file));
}

function lineCount(text) {
  if (text.length === 0) return 0;
  return text.split("\n").length;
}

export async function lintAgents(root = ROOT) {
  const rules = JSON.parse(await readFile(join(root, "pack", "hygiene-rules.json"), "utf-8"));
  const agentsDir = join(root, "agents");
  const files = await listAgentMarkdown(agentsDir);
  const violations = [];
  const maxLines = rules.maxAgentLines ?? null;

  for (const { file, path } of files) {
    const text = await readFile(path, "utf-8");
    const lines = lineCount(text);

    if (maxLines != null && lines > maxLines) {
      violations.push({ file, kind: "tooLong", needle: `${lines} lines (max ${maxLines})` });
    }

    const requiresContextPointer = !file.includes("/");
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
    if (requiresContextPointer) {
      for (const needle of rules.requiredSubstrings ?? []) {
        if (!text.includes(needle)) {
          violations.push({ file, kind: "missing", needle });
        }
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
    console.error(`Pack hygiene failed (${violations.length} issue(s) in ${filesChecked} agent files):`);
    for (const v of violations) {
      console.error(`  ${v.file}: ${v.kind} ${JSON.stringify(v.needle)}`);
    }
    process.exit(1);
  }
  console.log(`Pack hygiene ok (${filesChecked} source agent files scanned, 0 violations)`);
}

const isDirect = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isDirect) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
