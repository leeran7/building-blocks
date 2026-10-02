#!/usr/bin/env node
import { readFile, writeFile, mkdir, readdir, symlink, unlink, lstat, stat } from "node:fs/promises";
import { join, dirname, relative } from "node:path";
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

async function ensureSymlink(target, linkPath) {
  try { await unlink(linkPath); } catch {}
  await symlink(target, linkPath);
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

const PROTOCOL_MARKER = "<!-- closed-loop:protocol -->";

// Generated agent files whose source in agents/ is gone stay dispatchable
// until they are removed. Only files this script generated (they carry the
// protocol marker) or links left dangling by that removal are pruned; an
// agent file someone wrote by hand in these directories is never touched.
async function pruneStaleAgents(dir, ext, keep) {
  const removed = [];
  for (const entry of await readdir(dir)) {
    if (!entry.endsWith(ext) || keep.has(entry)) continue;
    const path = join(dir, entry);
    let generated;
    try {
      generated = (await readFile(path, "utf-8")).includes(PROTOCOL_MARKER);
    } catch {
      generated = (await lstat(path)).isSymbolicLink();
    }
    if (!generated) continue;
    await unlink(path);
    removed.push(join(relative(ROOT, dir), entry));
  }
  return removed;
}

async function pruneDanglingSymlinks(dir) {
  const removed = [];
  for (const entry of await readdir(dir)) {
    const linkPath = join(dir, entry);
    if (!(await lstat(linkPath)).isSymbolicLink()) continue;
    try { await stat(linkPath); } catch {
      await unlink(linkPath);
      removed.push(join(relative(ROOT, dir), entry));
    }
  }
  return removed;
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

  await mkdir(join(ROOT, ".claude", "agents"), { recursive: true });
  await mkdir(join(ROOT, ".cursor", "agents"), { recursive: true });
  await mkdir(join(ROOT, ".codex", "agents"), { recursive: true });

  for (const file of files) {
    const raw = neutralizePaths(await readFile(join(AGENTS_SRC, file), "utf-8"));
    const { frontmatterRaw, body } = splitAgentFile(raw);
    const composed = prependProtocol(body, protocolBody);

    const agentName = extractName(frontmatterRaw) ?? file.replace(".md", "");
    const config = claudeConfig[agentName] ?? {
      tools: ["Read", "Write", "Edit", "Bash", "Grep", "Glob"],
      skills: ["closed-loop"],
    };
    const claudeFrontmatter = buildClaudeFrontmatter(frontmatterRaw, config);
    const claudeOut = `---\n${claudeFrontmatter}\n---\n${composed}`;
    await writeFile(join(ROOT, ".claude", "agents", file), claudeOut);

    // Cursor: symlink to the Claude agent (Cursor ignores extra frontmatter)
    await ensureSymlink(
      relative(join(ROOT, ".cursor", "agents"), join(ROOT, ".claude", "agents", file)),
      join(ROOT, ".cursor", "agents", file),
    );

    // Codex: TOML format (no symlink possible)
    const description = extractDescription(frontmatterRaw);
    const tomlOut = toCodexToml(agentName, description, composed);
    await writeFile(join(ROOT, ".codex", "agents", file.replace(".md", ".toml")), tomlOut);
  }

  // claude.config.json: symlink from .claude/agents/ to source
  await ensureSymlink(
    relative(join(ROOT, ".claude", "agents"), CLAUDE_CONFIG_PATH),
    join(ROOT, ".claude", "agents", "claude.config.json"),
  );

  const tomlFiles = files.map((f) => f.replace(".md", ".toml"));
  const pruned = [
    ...(await pruneStaleAgents(join(ROOT, ".cursor", "agents"), ".md", new Set(files))),
    ...(await pruneStaleAgents(join(ROOT, ".claude", "agents"), ".md", new Set(files))),
    ...(await pruneStaleAgents(join(ROOT, ".codex", "agents"), ".toml", new Set(tomlFiles))),
  ];

  console.log(`Synced ${files.length} agents → .claude/agents/ (generated), .cursor/agents/ (symlinked), .codex/agents/ (TOML)`);
  if (pruned.length > 0) console.log(`Pruned ${pruned.length} agent file(s) with no source: ${pruned.join(", ")}`);
}

async function syncSkills() {
  const skillEntries = await readdir(SKILLS_SRC, { withFileTypes: true });
  let synced = 0;

  const targets = [
    join(ROOT, ".cursor", "skills"),
    join(ROOT, ".claude", "skills"),
    join(ROOT, ".agents", "skills"),
  ];

  for (const entry of skillEntries) {
    if (!entry.isDirectory()) continue;
    const name = entry.name;
    const srcDir = join(SKILLS_SRC, name);

    for (const dest of targets) {
      await mkdir(dest, { recursive: true });
      const linkPath = join(dest, name);
      const target = relative(dest, srcDir);
      try {
        const stat = await lstat(linkPath);
        if (stat.isSymbolicLink()) { await unlink(linkPath); }
        else if (stat.isDirectory()) {
          const { rm } = await import("node:fs/promises");
          await rm(linkPath, { recursive: true });
        }
      } catch {}
      await symlink(target, linkPath);
    }
    synced += 1;
  }

  const pruned = [];
  for (const dest of targets) pruned.push(...(await pruneDanglingSymlinks(dest)));

  console.log(`Synced ${synced} skill pack(s) → .cursor/skills/, .claude/skills/, .agents/skills/ (symlinked)`);
  if (pruned.length > 0) console.log(`Pruned ${pruned.length} skill link(s) with no source: ${pruned.join(", ")}`);
}

async function syncHandoffsSchema() {
  const src = join(ROOT, "handoffs", "schema.json");
  const targets = [
    join(ROOT, ".cursor", "handoffs"),
    join(ROOT, ".claude", "handoffs"),
  ];
  for (const dest of targets) {
    await mkdir(dest, { recursive: true });
    await ensureSymlink(
      relative(dest, src),
      join(dest, "schema.json"),
    );
  }
  console.log("Synced handoffs/schema.json (symlinked)");
}

async function syncRules() {
  const rulesDir = join(ROOT, ".claude", "rules");
  try {
    const entries = await readdir(rulesDir);
    if (entries.length > 0) {
      const cursorRules = join(ROOT, ".cursor", "rules");
      await mkdir(cursorRules, { recursive: true });
      for (const file of entries) {
        await ensureSymlink(
          relative(cursorRules, join(rulesDir, file)),
          join(cursorRules, file),
        );
      }
      console.log(`Synced ${entries.length} rule(s) → .cursor/rules/ (symlinked)`);
    }
  } catch {}
}

async function syncAgentsMd() {
  await ensureSymlink("CLAUDE.md", join(ROOT, "AGENTS.md"));
  console.log("Synced CLAUDE.md → AGENTS.md (symlinked)");
}

async function main() {
  await runHygiene();
  const claudeConfig = JSON.parse(await readFile(CLAUDE_CONFIG_PATH, "utf-8"));
  const protocolBody = await readFile(PROTOCOL_PATH, "utf-8");
  await syncAgents(claudeConfig, protocolBody);
  await syncSkills();
  await syncHandoffsSchema();
  await syncRules();
  await syncAgentsMd();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
