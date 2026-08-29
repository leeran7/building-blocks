import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { describe, it } from "node:test";
import { REPO_ROOT } from "./types.js";

async function lintAgents(root: string) {
  const mod = await import("../../scripts/hygiene.mjs");
  return mod.lintAgents(root);
}

describe("pack hygiene", () => {
  it("every role file points at context/README.md and leaks no product facts", async () => {
    const { filesChecked, violations } = await lintAgents(REPO_ROOT);
    assert.ok(filesChecked >= 20, `expected a full roster, got ${filesChecked}`);
    assert.equal(
      violations.length,
      0,
      violations.map((v) => `${v.file}: ${v.kind} ${JSON.stringify(v.needle)}`).join("\n"),
    );
  });

  it("lintAgents fails on a deliberately dirty agent fixture", async () => {
    const root = await mkdtemp(join(tmpdir(), "pack-dirty-"));
    await mkdir(join(root, "agents"), { recursive: true });
    await mkdir(join(root, "pack"), { recursive: true });
    await cpRules(root);
    await writeFile(
      join(root, "agents", "dirty.md"),
      "# Dirty\nThe Climb uses #cbf24d and github.com/leeran7/building-blocks\n",
    );
    const { violations } = await lintAgents(root);
    assert.ok(violations.length > 0, "dirty fixture must produce violations");
    assert.ok(
      violations.some((v) => v.file === "dirty.md"),
      "violations must name the dirty agent file",
    );
  });

  it("documents the install tree in pack/SETUP.md", async () => {
    const setup = await readFile(join(REPO_ROOT, "pack", "SETUP.md"), "utf-8");
    assert.match(setup, /closed-loop-agents/);
    assert.match(setup, /building-blocks/);
    assert.match(setup, /context\//);
    assert.match(setup, /init-pack/);
    assert.match(setup, /export-template/);
  });

  it("fixLoopGitignore rewrites loop/ so learnings are not ignored", async () => {
    const { fixLoopGitignore } = await import("../../scripts/pack-copy.mjs");
    const fixed = fixLoopGitignore("loop/\nnode_modules/\n");
    assert.match(fixed, /^loop\/\*/m);
    assert.match(fixed, /!loop\/learnings\.md/);
    assert.match(fixed, /!loop\/learnings\.jsonl/);

    const dest = await mkdtemp(join(tmpdir(), "pack-gitignore-"));
    await spawnOk("git", ["init"], dest);
    await mkdir(join(dest, "loop"), { recursive: true });
    await writeFile(join(dest, ".gitignore"), "loop/\n");
    await writeFile(join(dest, "loop", "learnings.md"), "# ledger\n");
    await writeFile(join(dest, "loop", "learnings.jsonl"), "");

    const { mergeGitignore } = await import("../../scripts/pack-copy.mjs");
    const snippet = await readFile(join(REPO_ROOT, "pack", "templates", "gitignore.snippet"), "utf-8");
    await mergeGitignore(dest, snippet);

    const ignored = await gitCheckIgnore(dest, "loop/learnings.md");
    assert.equal(ignored, false, "loop/learnings.md must not be ignored after mergeGitignore");
  });
});

async function cpRules(root: string) {
  const rules = await readFile(join(REPO_ROOT, "pack", "hygiene-rules.json"), "utf-8");
  await writeFile(join(root, "pack", "hygiene-rules.json"), rules);
}

function gitCheckIgnore(cwd: string, path: string): Promise<boolean> {
  return new Promise((resolve, reject) => {
    const child = spawn("git", ["check-ignore", "-q", path], { cwd });
    child.on("error", reject);
    child.on("exit", (code) => resolve(code === 0));
  });
}

function spawnOk(command: string, args: string[], cwd: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, stdio: "ignore" });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} ${args.join(" ")} exited ${code}`));
    });
  });
}
