#!/usr/bin/env node
/**
 * Scaffold a new skill directory.
 *
 * Usage: node scripts/create-skill.mjs <skill-name> [--link <source-skill>/<file.md> ...]
 *
 * Examples:
 *   node scripts/create-skill.mjs my-new-skill
 *   node scripts/create-skill.mjs closed-loop-participant --link closed-loop/handoffs.md closed-loop/stages.md
 *
 * Convention: shared files MUST be symlinks, never copies. This script
 * enforces that by creating relative symlinks when --link is used.
 */
import { mkdir, writeFile, symlink, readlink, lstat } from "node:fs/promises";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SKILLS_DIR = join(ROOT, "skills");

function usage() {
  console.error("Usage: node scripts/create-skill.mjs <skill-name> [--link <skill/file.md> ...]");
  console.error("");
  console.error("Convention: shared files between skills MUST be symlinks, never copies.");
  console.error("Use --link to create relative symlinks to files in other skill directories.");
  process.exit(1);
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length === 0 || args[0] === "--help" || args[0] === "-h") usage();

  const name = args[0];
  if (!/^[a-z][a-z0-9-]*$/.test(name)) {
    console.error(`Error: skill name must be lowercase alphanumeric with hyphens. Got: ${name}`);
    process.exit(1);
  }

  const skillDir = join(SKILLS_DIR, name);

  try {
    await mkdir(skillDir, { recursive: false });
  } catch (err) {
    if (err.code === "EEXIST") {
      console.error(`Error: skill directory already exists: skills/${name}/`);
      process.exit(1);
    }
    throw err;
  }

  const links = [];
  let i = 1;
  while (i < args.length) {
    if (args[i] === "--link") {
      i++;
      while (i < args.length && !args[i].startsWith("--")) {
        links.push(args[i]);
        i++;
      }
    } else {
      i++;
    }
  }

  for (const linkSpec of links) {
    const parts = linkSpec.split("/");
    if (parts.length !== 2) {
      console.error(`Error: --link argument must be <skill>/<file.md>. Got: ${linkSpec}`);
      await cleanup(skillDir);
      process.exit(1);
    }
    const [sourceSkill, sourceFile] = parts;
    const sourcePath = join(SKILLS_DIR, sourceSkill, sourceFile);

    try {
      await lstat(sourcePath);
    } catch {
      console.error(`Error: source file not found: skills/${sourceSkill}/${sourceFile}`);
      await cleanup(skillDir);
      process.exit(1);
    }

    const target = relative(skillDir, sourcePath);
    const linkPath = join(skillDir, sourceFile);
    await symlink(target, linkPath);
    console.log(`  symlink: ${sourceFile} -> ${target}`);
  }

  const skillMd = [
    "---",
    `name: ${name}`,
    "description: >-",
    "  TODO: describe what this skill does.",
    "---",
    "",
    `# ${name.split("-").map((w) => w[0].toUpperCase() + w.slice(1)).join(" ")}`,
    "",
    "TODO: write the skill instructions.",
    "",
  ].join("\n");

  await writeFile(join(skillDir, "SKILL.md"), skillMd);
  console.log(`\nCreated skills/${name}/`);
  console.log(`  SKILL.md (edit this)`);
  console.log(`\nNext: add "${name}" to the relevant agents in agents/claude.config.json, then run yarn sync.`);
}

async function cleanup(dir) {
  const { rm } = await import("node:fs/promises");
  try {
    await rm(dir, { recursive: true });
  } catch {}
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
