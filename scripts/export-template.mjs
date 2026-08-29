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
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const PACK_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

const COPY = [
  ["agents", "agents"],
  ["skills/closed-loop", "skills/closed-loop"],
  ["handoffs", "handoffs"],
  ["pack", "pack"],
  ["scripts", "scripts"],
  ["orchestrator", "orchestrator"],
];

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
  const dest = resolve(destArg);
  if (dest === PACK_ROOT) {
    console.error("Refusing to export the template onto this checkout. Pass the template clone path.");
    process.exit(1);
  }

  for (const [from, to] of COPY) {
    const src = join(PACK_ROOT, from);
    const out = join(dest, to);
    await mkdir(dirname(out), { recursive: true });
    await cp(src, out, {
      recursive: true,
      filter: (source) => !source.includes("node_modules") && !source.includes("dist"),
    });
    console.log(`copied ${from} → ${to}`);
  }

  const contextDest = join(dest, "context");
  if (await exists(contextDest)) {
    await rm(contextDest, { recursive: true, force: true });
  }
  await cp(join(PACK_ROOT, "pack", "templates", "context"), contextDest, { recursive: true });
  console.log("wrote template context/ from pack/templates/context");

  await mkdir(join(dest, "loop"), { recursive: true });
  await cp(join(PACK_ROOT, "pack", "templates", "learnings.md"), join(dest, "loop", "learnings.md"));
  await writeFile(join(dest, "loop", "learnings.jsonl"), "");

  await cp(join(PACK_ROOT, "pack", "templates", "README.md"), join(dest, "README.md"));
  await cp(join(PACK_ROOT, "skills", "closed-loop", "host.md"), join(dest, "CLAUDE.md"));
  await cp(join(PACK_ROOT, "pack", "templates", "gitignore.snippet"), join(dest, ".gitignore"));
  await appendIgnoreExtras(join(dest, ".gitignore"));

  await writeFile(
    join(dest, "package.json"),
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
    await run("node", ["scripts/sync.mjs"], dest);
  } catch (err) {
    console.warn("sync in template failed:", err.message);
  }

  console.log(`\nTemplate exported to ${dest}`);
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
