#!/usr/bin/env node
/**
 * Vendor the closed-loop pack into another repository.
 *
 *   node scripts/init-pack.mjs /path/to/other-repo
 *
 * Copies pack files only. Writes template context/ and an empty ledger
 * when those are missing. Never copies app/ or a filled-in product context.
 */
import { readFile, writeFile, mkdir, cp, access } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import {
  assertSafeDest,
  copyKernel,
  mergeGitignore,
  purgeDoNotCopy,
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
    console.error("Usage: node scripts/init-pack.mjs /path/to/other-repo");
    process.exit(1);
  }
  const dest = assertSafeDest(destArg);
  if (dest === PACK_ROOT) {
    console.error("Refusing to install the pack into itself.");
    process.exit(1);
  }

  const { destRoot, manifest } = await copyKernel(PACK_ROOT, dest);
  console.log(`copied kernel (${manifest.kernel.length} manifest patterns) → ${destRoot}`);
  await purgeDoNotCopy(destRoot, manifest);

  const contextDest = join(destRoot, "context");
  if (!(await exists(contextDest))) {
    await cp(join(PACK_ROOT, "pack", "templates", "context"), contextDest, { recursive: true });
    console.log("wrote context/ from pack/templates/context — edit it");
  } else {
    console.log("kept existing context/");
  }

  const ledgerDest = join(destRoot, "loop");
  await mkdir(ledgerDest, { recursive: true });
  const learningsMd = join(ledgerDest, "learnings.md");
  if (!(await exists(learningsMd))) {
    await cp(join(PACK_ROOT, "pack", "templates", "learnings.md"), learningsMd);
    await writeFile(join(ledgerDest, "learnings.jsonl"), "");
    console.log("wrote empty loop/learnings.md + learnings.jsonl");
  }

  const snippet = await readFile(join(PACK_ROOT, "pack", "templates", "gitignore.snippet"), "utf-8");
  await mergeGitignore(destRoot, snippet);
  console.log("merged ledger-safe gitignore snippet");

  const host = await readFile(join(PACK_ROOT, "skills", "closed-loop", "host.md"), "utf-8");
  const claudeDest = join(destRoot, "CLAUDE.md");
  if (!(await exists(claudeDest))) {
    await writeFile(claudeDest, host);
    console.log("wrote CLAUDE.md from host.md");
  } else {
    await writeFile(join(destRoot, "CLAUDE.closed-loop.md"), host);
    console.log("kept CLAUDE.md; wrote CLAUDE.closed-loop.md for you to merge");
  }

  try {
    await run("node", ["scripts/sync.mjs"], destRoot);
  } catch (err) {
    console.warn("sync in target failed (run it after installing Node deps):", err.message);
  }

  console.log(`\nPack installed at ${destRoot}`);
  console.log("Next: edit context/, then yarn --cwd orchestrator install && node scripts/hygiene.mjs");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
