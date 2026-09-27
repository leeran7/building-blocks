#!/usr/bin/env node
/**
 * Generate .cursor/, .claude/, .codex/, and .agents/ from the closed-loop
 * kernel (this package's agents/, skills/, handoffs/) plus a consuming
 * repo's own overrides.
 *
 * Source resolution (per file/dir):
 *   1. TARGET_ROOT/<path>  — if it exists, it wins (a repo's local override
 *      or addition: a customized agent, a swapped-in skill, its own
 *      handoffs/schema.json).
 *   2. PACKAGE_ROOT/<path> — this package's default.
 *
 * When invoked with no target (pack development, `node scripts/sync.mjs`
 * from a checkout of this repo), TARGET_ROOT === PACKAGE_ROOT and step 1
 * always wins trivially — same behavior as before this file supported a
 * separate target.
 */
import { readFile, writeFile, mkdir, readdir, symlink, unlink, lstat, rm, access } from "node:fs/promises";
import { join, dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const PACKAGE_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

const PATH_REPLACEMENTS = [
  [/\.cursor\/loop/g, "loop"],
  [/\.cursor\/skills\//g, "skills/"],
  [/\.cursor\/handoffs/g, "handoffs"],
];

function neutralizePaths(text) {
  let result = text;
  for (const [pattern, replacement] of PATH_REPLACEMENTS) {
    result = result.replace(pattern, replacement);
  }
  return result;
}

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function ensureSymlink(target, linkPath) {
  try {
    const st = await lstat(linkPath);
    if (st.isDirectory() && !st.isSymbolicLink()) await rm(linkPath, { recursive: true });
    else await unlink(linkPath);
  } catch {
    /* nothing there yet */
  }
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
  const escaped = trimmed.replaceAll("\\", "\\\\").replaceAll('"""', '\\"\\"\\"');
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

async function runHygiene() {
  const { lintAgents } = await import("./hygiene.mjs");
  const { filesChecked, violations } = await lintAgents(PACKAGE_ROOT);
  if (violations.length > 0) {
    const detail = violations.map((v) => `${v.file}: ${v.needle}`).join("\n  ");
    throw new Error(`Pack hygiene failed (${violations.length}/${filesChecked}):\n  ${detail}`);
  }
}

// --- source resolution: package defaults, overridden/extended by a target repo's local files ---

async function listMdFiles(dir) {
  if (!(await exists(dir))) return [];
  return (await readdir(dir)).filter((f) => f.endsWith(".md"));
}

async function resolveAgentSources(targetRoot) {
  const packageAgentsDir = join(PACKAGE_ROOT, "agents");
  const localAgentsDir = join(targetRoot, "agents");
  const isOverlay = resolve(targetRoot) !== resolve(PACKAGE_ROOT);

  const byName = new Map();
  for (const file of await listMdFiles(packageAgentsDir)) byName.set(file, join(packageAgentsDir, file));
  if (isOverlay) {
    for (const file of await listMdFiles(localAgentsDir)) byName.set(file, join(localAgentsDir, file));
  }

  let names = [...byName.keys()];

  const profilePath = join(targetRoot, "context", "profile.json");
  if (await exists(profilePath)) {
    const profile = JSON.parse(await readFile(profilePath, "utf-8"));
    if (Array.isArray(profile.agentRoster) && profile.agentRoster.length) {
      const roster = new Set(profile.agentRoster.map((n) => (n.endsWith(".md") ? n : `${n}.md`)));
      names = names.filter((f) => roster.has(f));
    }
  }

  return names.sort().map((file) => ({ file, path: byName.get(file) }));
}

async function resolveClaudeConfig(targetRoot) {
  const packagePath = join(PACKAGE_ROOT, "agents", "claude.config.json");
  const localPath = join(targetRoot, "agents", "claude.config.json");
  const isOverlay = resolve(targetRoot) !== resolve(PACKAGE_ROOT);
  const source = isOverlay && (await exists(localPath)) ? localPath : packagePath;
  return { config: JSON.parse(await readFile(source, "utf-8")), source };
}

function resolveSkillsSourceDirs(targetRoot) {
  const isOverlay = resolve(targetRoot) !== resolve(PACKAGE_ROOT);
  const dirs = [join(PACKAGE_ROOT, "skills")];
  if (isOverlay) dirs.push(join(targetRoot, "skills"));
  return dirs;
}

async function resolveProtocol(targetRoot) {
  const packagePath = join(PACKAGE_ROOT, "skills", "closed-loop", "protocol.md");
  const localPath = join(targetRoot, "skills", "closed-loop", "protocol.md");
  const isOverlay = resolve(targetRoot) !== resolve(PACKAGE_ROOT);
  const source = isOverlay && (await exists(localPath)) ? localPath : packagePath;
  return readFile(source, "utf-8");
}

async function resolveHandoffsSchema(targetRoot) {
  const packagePath = join(PACKAGE_ROOT, "handoffs", "schema.json");
  const localPath = join(targetRoot, "handoffs", "schema.json");
  const isOverlay = resolve(targetRoot) !== resolve(PACKAGE_ROOT);
  return isOverlay && (await exists(localPath)) ? localPath : packagePath;
}

// --- sync steps ---

async function syncAgents(targetRoot, protocolBody) {
  const { config: claudeConfig, source: claudeConfigSrc } = await resolveClaudeConfig(targetRoot);
  const sources = await resolveAgentSources(targetRoot);

  // These three dirs are fully generated output — clear them first so an
  // agent dropped from the roster (e.g. a consolidation) doesn't leave a
  // stale generated file behind that no source file backs anymore.
  await rm(join(targetRoot, ".claude", "agents"), { recursive: true, force: true });
  await rm(join(targetRoot, ".cursor", "agents"), { recursive: true, force: true });
  await rm(join(targetRoot, ".codex", "agents"), { recursive: true, force: true });
  await mkdir(join(targetRoot, ".claude", "agents"), { recursive: true });
  await mkdir(join(targetRoot, ".cursor", "agents"), { recursive: true });
  await mkdir(join(targetRoot, ".codex", "agents"), { recursive: true });

  for (const { file, path } of sources) {
    const raw = neutralizePaths(await readFile(path, "utf-8"));
    const { frontmatterRaw, body } = splitAgentFile(raw);
    const composed = prependProtocol(body, protocolBody);

    const agentName = extractName(frontmatterRaw) ?? file.replace(".md", "");
    const config = claudeConfig[agentName] ?? {
      tools: ["Read", "Write", "Edit", "Bash", "Grep", "Glob"],
      skills: ["closed-loop"],
    };
    const claudeFrontmatter = buildClaudeFrontmatter(frontmatterRaw, config);
    const claudeOut = `---\n${claudeFrontmatter}\n---\n${composed}`;
    await writeFile(join(targetRoot, ".claude", "agents", file), claudeOut);

    // Cursor: symlink to the Claude agent (Cursor ignores extra frontmatter)
    await ensureSymlink(
      relative(join(targetRoot, ".cursor", "agents"), join(targetRoot, ".claude", "agents", file)),
      join(targetRoot, ".cursor", "agents", file),
    );

    // Codex: TOML format (no symlink possible)
    const description = extractDescription(frontmatterRaw);
    const tomlOut = toCodexToml(agentName, description, composed);
    await writeFile(join(targetRoot, ".codex", "agents", file.replace(".md", ".toml")), tomlOut);
  }

  // claude.config.json: symlink from .claude/agents/ to whichever copy won (local or package)
  await ensureSymlink(
    relative(join(targetRoot, ".claude", "agents"), claudeConfigSrc),
    join(targetRoot, ".claude", "agents", "claude.config.json"),
  );

  console.log(
    `Synced ${sources.length} agents → .claude/agents/ (generated), .cursor/agents/ (symlinked), .codex/agents/ (TOML)`,
  );
}

async function syncSkills(targetRoot) {
  const srcDirs = resolveSkillsSourceDirs(targetRoot);
  const byName = new Map();
  for (const srcRoot of srcDirs) {
    if (!(await exists(srcRoot))) continue;
    for (const entry of await readdir(srcRoot, { withFileTypes: true })) {
      if (entry.isDirectory()) byName.set(entry.name, join(srcRoot, entry.name));
    }
  }

  const targets = [
    join(targetRoot, ".cursor", "skills"),
    join(targetRoot, ".claude", "skills"),
    join(targetRoot, ".agents", "skills"),
  ];

  // Generated output — clear so a skill pack removed from the source no
  // longer lingers as a dangling symlink.
  for (const dest of targets) {
    await rm(dest, { recursive: true, force: true });
  }

  for (const [name, srcDir] of byName) {
    for (const dest of targets) {
      await mkdir(dest, { recursive: true });
      const linkPath = join(dest, name);
      await ensureSymlink(relative(dest, srcDir), linkPath);
    }
  }

  console.log(`Synced ${byName.size} skill pack(s) → .cursor/skills/, .claude/skills/, .agents/skills/ (symlinked)`);
}

async function syncHandoffsSchema(targetRoot) {
  const src = await resolveHandoffsSchema(targetRoot);
  const targets = [join(targetRoot, ".cursor", "handoffs"), join(targetRoot, ".claude", "handoffs")];
  for (const dest of targets) {
    await mkdir(dest, { recursive: true });
    await ensureSymlink(relative(dest, src), join(dest, "schema.json"));
  }
  console.log("Synced handoffs/schema.json (symlinked)");
}

async function syncRules(targetRoot) {
  const rulesDir = join(targetRoot, ".claude", "rules");
  if (!(await exists(rulesDir))) return;
  const entries = await readdir(rulesDir);
  if (entries.length === 0) return;
  const cursorRules = join(targetRoot, ".cursor", "rules");
  await mkdir(cursorRules, { recursive: true });
  for (const file of entries) {
    await ensureSymlink(relative(cursorRules, join(rulesDir, file)), join(cursorRules, file));
  }
  console.log(`Synced ${entries.length} rule(s) → .cursor/rules/ (symlinked)`);
}

async function syncAgentsMd(targetRoot) {
  if (!(await exists(join(targetRoot, "CLAUDE.md")))) return;
  await ensureSymlink("CLAUDE.md", join(targetRoot, "AGENTS.md"));
  console.log("Synced CLAUDE.md → AGENTS.md (symlinked)");
}

export async function sync(targetRoot = process.cwd()) {
  targetRoot = resolve(targetRoot);
  await runHygiene();
  const protocolBody = await resolveProtocol(targetRoot);
  await syncAgents(targetRoot, protocolBody);
  await syncSkills(targetRoot);
  await syncHandoffsSchema(targetRoot);
  await syncRules(targetRoot);
  await syncAgentsMd(targetRoot);
}

const isDirect = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isDirect) {
  sync(process.argv[2]).catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
