#!/usr/bin/env node
/**
 * closed-loop-agents CLI.
 *
 * Consumers install this package as a dependency, then run these commands
 * from their own repo root (via a package.json script or `npx`):
 *
 *   closed-loop-agents sync [target-dir]   generate .cursor/.claude/.codex/.agents
 *   closed-loop-agents hygiene              lint this package's own agents/*.md
 *   closed-loop-agents init <target-dir>    vendor a full copy (offline/legacy mode)
 *   closed-loop-agents loop -- [args]       run the Cursor SDK orchestrator
 */
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const PACKAGE_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

const USAGE = `closed-loop-agents <command> [args]

Commands:
  sync [target-dir]       Generate .cursor/agents, .claude/agents, .codex/agents,
                           .agents/skills, .cursor/skills, .claude/skills, and the
                           handoffs schema in target-dir (default: cwd). Reads this
                           package's agents/skills as defaults; a same-named file
                           in target-dir/agents or target-dir/skills overrides it.
  hygiene [target-dir]     Lint agents/*.md for leaked product facts and oversized
                           role files. Lints target-dir (default: cwd) if it has its
                           own agents/ + pack/hygiene-rules.json local override,
                           else falls back to this package's own agents/.
  init <target-dir>        Vendor a full copy of the pack into target-dir — for
                           repos that can't take a package dependency. Prefer
                           installing this package + \`sync\` instead.
  loop [-- args]            Run the Cursor SDK closed-loop orchestrator bundled with
                           this package (requires \`yarn install\` in its orchestrator/
                           once). If target-dir has its own orchestrator/, run that
                           repo's own \`yarn loop\` instead.
`;

function run(command, args, cwd) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, { cwd, stdio: "inherit" });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) resolvePromise();
      else reject(new Error(`${command} ${args.join(" ")} exited ${code}`));
    });
  });
}

async function main() {
  const [, , command, ...rest] = process.argv;

  switch (command) {
    case "sync": {
      const { sync } = await import("../scripts/sync.mjs");
      const target = rest[0] ? resolve(process.cwd(), rest[0]) : process.cwd();
      await sync(target);
      return;
    }
    case "hygiene": {
      const { runCli } = await import("../scripts/hygiene.mjs");
      const target = rest[0] ? resolve(process.cwd(), rest[0]) : process.cwd();
      const { access } = await import("node:fs/promises");
      const hasLocalRules = await access(join(target, "pack", "hygiene-rules.json")).then(
        () => true,
        () => false,
      );
      await runCli(hasLocalRules ? target : PACKAGE_ROOT);
      return;
    }
    case "init": {
      const dest = rest[0];
      if (!dest) {
        console.error("Usage: closed-loop-agents init <target-dir>");
        process.exit(1);
      }
      await run("node", [join(PACKAGE_ROOT, "scripts", "init-pack.mjs"), dest], process.cwd());
      return;
    }
    case "loop": {
      const args = rest[0] === "--" ? rest.slice(1) : rest;
      await run("yarn", ["--cwd", join(PACKAGE_ROOT, "orchestrator"), "loop", ...args], process.cwd());
      return;
    }
    default:
      console.log(USAGE);
      process.exit(command ? 1 : 0);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
