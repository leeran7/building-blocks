#!/usr/bin/env node
/**
 * Write a clean template tree (leeran7/closed-loop-agents) from this checkout.
 *
 *   node scripts/export-template.mjs /path/to/closed-loop-agents
 *
 * Never copies app/, this product's context/, or the product learnings ledger.
 * Destination context/ always comes from pack/templates/context/.
 */
import { readFile, writeFile, mkdir, cp, access, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import {
  assertSafeDest,
  copyKernel,
  mergeGitignore,
  purgeDoNotCopy,
  resetAgentsAndSkills,
} from "./pack-copy.mjs";

const PACK_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

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
  const destArg = process.argv[2];
  if (!destArg) {
    console.error("Usage: node scripts/export-template.mjs /path/to/closed-loop-agents");
    process.exit(1);
  }
  const dest = assertSafeDest(destArg);
  if (dest === PACK_ROOT) {
    console.error("Refusing to export the template onto this checkout. Pass the template clone path.");
    process.exit(1);
  }

  await resetAgentsAndSkills(dest);
  const { destRoot, manifest } = await copyKernel(PACK_ROOT, dest);
  console.log(`copied kernel (${manifest.kernel.length} manifest patterns) → ${destRoot}`);

  await purgeDoNotCopy(destRoot, manifest);
  console.log("purged doNotCopy paths (app/, docs/reviews/, CHANGELOG.md, …)");

  const contextDest = join(destRoot, "context");
  if (await exists(contextDest)) {
    await rm(contextDest, { recursive: true, force: true });
  }
  await cp(join(PACK_ROOT, "pack", "templates", "context"), contextDest, { recursive: true });
  console.log("wrote template context/ from pack/templates/context");

  await mkdir(join(destRoot, "loop"), { recursive: true });
  await cp(join(PACK_ROOT, "pack", "templates", "learnings.md"), join(destRoot, "loop", "learnings.md"));
  await writeFile(join(destRoot, "loop", "learnings.jsonl"), "");

  await cp(join(PACK_ROOT, "pack", "templates", "README.md"), join(destRoot, "README.md"));
  await cp(join(PACK_ROOT, "skills", "closed-loop", "host.md"), join(destRoot, "CLAUDE.md"));
  const snippet = await readFile(join(PACK_ROOT, "pack", "templates", "gitignore.snippet"), "utf-8");
  await mergeGitignore(destRoot, snippet, { overwrite: true });
  await appendIgnoreExtras(join(destRoot, ".gitignore"));

  await writeFile(
    join(destRoot, "package.json"),
    `${JSON.stringify(
      {
        name: "closed-loop-agents",
        private: true,
        description: "Reusable closed-loop agent pack. Fill in context/ for your repo. See pack/SETUP.md.",
        scripts: {
          sync: "node scripts/sync.mjs",
          hygiene: "node scripts/hygiene.mjs",
          loop: "yarn --cwd orchestrator loop",
          "test:orchestrator": "yarn --cwd orchestrator test",
          "test:pack": "node scripts/hygiene.mjs",
          init: "node scripts/init-pack.mjs",
        },
      },
      null,
      2,
    )}\n`,
  );

  try {
    await run("node", ["scripts/sync.mjs"], destRoot);
  } catch (err) {
    console.warn("sync in template failed:", err.message);
  }

  console.log(`\nTemplate exported to ${destRoot}`);
}

async function appendIgnoreExtras(gitignorePath) {
  const extra = `
# Dependencies & build
node_modules/
dist/
*.log

# Environment
.env
.env.local
`;
  const current = await readFile(gitignorePath, "utf-8");
  if (!current.includes("node_modules/")) {
    await writeFile(gitignorePath, `${current.trimEnd()}\n${extra}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
