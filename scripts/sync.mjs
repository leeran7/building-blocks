#!/usr/bin/env node
import { readFile, writeFile, mkdir, readdir, cp } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const AGENTS_SRC = join(ROOT, "agents");
const SKILLS_SRC = join(ROOT, "skills");
const CLAUDE_CONFIG_PATH = join(AGENTS_SRC, "claude.config.json");
const PROTOCOL_PATH = join(SKILLS_SRC, "closed-loop", "protocol.md");

const PATH_REPLACEMENTS = [
  [/.cursor\/loop/g, "loop"],
  [/.cursor\/skills\/closed-loop/g, "skills/closed-loop"],
  [/.cursor\/handoffs/g, "handoffs"],
];

function neutralizePaths(text) {
  let result = text;
  for (const [pattern, replacement] of PATH_REPLACEMENTS) {
    result = result.replace(pattern, replacement);
  }
  return result;
}

function splitAgentFile(content) {
  const match = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) throw new Error("Agent file missing YAML frontmatter");
  return { frontmatterRaw: match[1], body: match[2] };
}

function extractName(frontmatterRaw) {
  const match = frontmatterRaw.match(/^name:\s*(.+)$/m);
  return match?.[1]?.trim();
}

function buildClaudeFrontmatter(frontmatterRaw, claudeConfig) {
  const lines = [frontmatterRaw.trim()];
  if (claudeConfig.tools?.length) {
    lines.push("tools:");
    for (const tool of claudeConfig.tools) lines.push(`  - ${tool}`);
  }
  if (claudeConfig.disallowedTools?.length) {
    lines.push("disallowedTools:");
    for (const tool of claudeConfig.disallowedTools) lines.push(`  - ${tool}`);
  }
  if (claudeConfig.skills?.length) {
    lines.push("skills:");
    for (const skill of claudeConfig.skills) lines.push(`  - ${skill}`);
  }
  if (claudeConfig.color) lines.push(`color: ${claudeConfig.color}`);
  if (claudeConfig.model) lines.push(`model: ${claudeConfig.model}`);
  return lines.join("\n");
}

function stripProtocol(body) {
  return body.replace(
    /<!-- closed-loop:protocol -->[\s\S]*?<!-- \/closed-loop:protocol -->\n*/g,
    "",
  );
}

function prependProtocol(body, protocolBody) {
  const stripped = stripProtocol(body).replace(/^\n+/, "");
  return `<!-- closed-loop:protocol -->\n${protocolBody.trim()}\n<!-- /closed-loop:protocol -->\n\n${stripped}`;
}

async function runHygiene() {
  const { lintAgents } = await import("./hygiene.mjs");
  const { filesChecked, violations } = await lintAgents(ROOT);
  if (violations.length > 0) {
    const detail = violations.map((v) => `${v.file}: ${v.needle}`).join("\n  ");
    throw new Error(`Pack hygiene failed (${violations.length}/${filesChecked}):\n  ${detail}`);
  }
}

async function syncAgents(claudeConfig, protocolBody) {
  const files = (await readdir(AGENTS_SRC)).filter((f) => f.endsWith(".md"));

  await mkdir(join(ROOT, ".cursor", "agents"), { recursive: true });
  await mkdir(join(ROOT, ".claude", "agents"), { recursive: true });

  for (const file of files) {
    const raw = neutralizePaths(await readFile(join(AGENTS_SRC, file), "utf-8"));
    const { frontmatterRaw, body } = splitAgentFile(raw);
    const composed = prependProtocol(body, protocolBody);

    const cursorOut = `---\n${frontmatterRaw}\n---\n${composed}`;
    await writeFile(join(ROOT, ".cursor", "agents", file), cursorOut);

    const agentName = extractName(frontmatterRaw) ?? file.replace(".md", "");
    const config = claudeConfig[agentName] ?? {
      tools: ["Read", "Write", "Edit", "Bash", "Grep", "Glob"],
      skills: ["closed-loop"],
    };
    const claudeFrontmatter = buildClaudeFrontmatter(frontmatterRaw, config);
    const claudeOut = `---\n${claudeFrontmatter}\n---\n${composed}`;
    await writeFile(join(ROOT, ".claude", "agents", file), claudeOut);
  }

  console.log(`Synced ${files.length} agents → .cursor/agents/ and .claude/agents/ (protocol prepended)`);
}

async function syncSkills() {
  const skillDir = join(SKILLS_SRC, "closed-loop");
  const cursorDest = join(ROOT, ".cursor", "skills", "closed-loop");
  const claudeDest = join(ROOT, ".claude", "skills", "closed-loop");

  await mkdir(cursorDest, { recursive: true });
  await mkdir(claudeDest, { recursive: true });

  for (const file of await readdir(skillDir)) {
    const neutral = neutralizePaths(await readFile(join(skillDir, file), "utf-8"));
    await writeFile(join(cursorDest, file), neutral);
    await writeFile(join(claudeDest, file), neutral);
  }

  console.log("Synced skills/closed-loop → .cursor/skills/ and .claude/skills/");
}

async function syncHandoffsSchema() {
  const src = join(ROOT, "handoffs", "schema.json");
  await mkdir(join(ROOT, ".cursor", "handoffs"), { recursive: true });
  await mkdir(join(ROOT, ".claude", "handoffs"), { recursive: true });
  await cp(src, join(ROOT, ".cursor", "handoffs", "schema.json"));
  await cp(src, join(ROOT, ".claude", "handoffs", "schema.json"));
  console.log("Synced handoffs/schema.json");
}

async function main() {
  await runHygiene();
  const claudeConfig = JSON.parse(await readFile(CLAUDE_CONFIG_PATH, "utf-8"));
  const protocolBody = await readFile(PROTOCOL_PATH, "utf-8");
  await syncAgents(claudeConfig, protocolBody);
  await syncSkills();
  await syncHandoffsSchema();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
