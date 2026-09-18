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
  [/.cursor\/skills\//g, "skills/"],
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

function extractDescription(frontmatterRaw) {
  const single = frontmatterRaw.match(/^description:\s+(.+)$/m);
  if (single && !single[1].startsWith(">")) return single[1].trim();
  const folded = frontmatterRaw.match(/^description:\s*>-?\n((?:[ \t]+.*\n?)*)/m);
  if (!folded) return "";
  return folded[1].replace(/\n\s*/g, " ").trim();
}

function toCodexToml(name, description, composedBody) {
  const trimmed = composedBody.replace(/\n+$/, "");
  const escaped = trimmed.replaceAll('\\', '\\\\').replaceAll('"""', '\\"\\"\\"');
  return `name = ${JSON.stringify(name)}\ndescription = ${JSON.stringify(description)}\ndeveloper_instructions = """\n${escaped}"""\n`;
}

const CODEX_REPLACEMENTS = [
  [/Claude Code/g, "Codex"],
];

function codexify(text) {
  let result = text;
  for (const [pattern, replacement] of CODEX_REPLACEMENTS) {
    result = result.replace(pattern, replacement);
  }
  return result;
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
  await mkdir(join(ROOT, ".codex", "agents"), { recursive: true });

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

    const description = extractDescription(frontmatterRaw);
    const tomlOut = toCodexToml(agentName, description, composed);
    await writeFile(join(ROOT, ".codex", "agents", file.replace(".md", ".toml")), tomlOut);
  }

  console.log(`Synced ${files.length} agents → .cursor/agents/, .claude/agents/, .codex/agents/ (protocol prepended)`);
}

async function syncSkills() {
  const skillEntries = await readdir(SKILLS_SRC, { withFileTypes: true });
  let synced = 0;

  for (const entry of skillEntries) {
    if (!entry.isDirectory()) continue;
    const name = entry.name;
    const skillDir = join(SKILLS_SRC, name);
    const cursorDest = join(ROOT, ".cursor", "skills", name);
    const claudeDest = join(ROOT, ".claude", "skills", name);
    const codexDest = join(ROOT, ".agents", "skills", name);

    await mkdir(cursorDest, { recursive: true });
    await mkdir(claudeDest, { recursive: true });
    await mkdir(codexDest, { recursive: true });

    for (const file of await readdir(skillDir)) {
      const srcPath = join(skillDir, file);
      const neutral = neutralizePaths(await readFile(srcPath, "utf-8"));
      await writeFile(join(cursorDest, file), neutral);
      await writeFile(join(claudeDest, file), neutral);
      await writeFile(join(codexDest, file), codexify(neutral));
    }
    synced += 1;
  }

  console.log(`Synced ${synced} skill pack(s) → .cursor/skills/, .claude/skills/, .agents/skills/`);
}

async function syncHandoffsSchema() {
  const src = join(ROOT, "handoffs", "schema.json");
  await mkdir(join(ROOT, ".cursor", "handoffs"), { recursive: true });
  await mkdir(join(ROOT, ".claude", "handoffs"), { recursive: true });
  await cp(src, join(ROOT, ".cursor", "handoffs", "schema.json"));
  await cp(src, join(ROOT, ".claude", "handoffs", "schema.json"));
  console.log("Synced handoffs/schema.json");
}

async function syncAgentsMd() {
  await cp(join(ROOT, "CLAUDE.md"), join(ROOT, "AGENTS.md"));
  console.log("Synced CLAUDE.md → AGENTS.md");
}

async function syncClaudeConfig() {
  await cp(CLAUDE_CONFIG_PATH, join(ROOT, ".claude", "agents", "claude.config.json"));
  console.log("Synced claude.config.json → .claude/agents/");
}

async function main() {
  await runHygiene();
  const claudeConfig = JSON.parse(await readFile(CLAUDE_CONFIG_PATH, "utf-8"));
  const protocolBody = await readFile(PROTOCOL_PATH, "utf-8");
  await syncAgents(claudeConfig, protocolBody);
  await syncSkills();
  await syncHandoffsSchema();
  await syncAgentsMd();
  await syncClaudeConfig();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
