import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { describe, it } from "node:test";
import { REPO_ROOT } from "./types.js";

describe("pack hygiene", () => {
  it("every role file points at context/README.md and leaks no product facts", async () => {
    const { filesChecked, violations } = await lintAgents(REPO_ROOT);
    assert.ok(filesChecked >= 23, `expected a full roster including curator, got ${filesChecked}`);
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
    const packMd = await readFile(join(REPO_ROOT, "skills", "closed-loop", "pack.md"), "utf-8");
    assert.match(setup, /closed-loop-agents/);
    assert.match(setup, /building-blocks/);
    assert.match(setup, /context\//);
    assert.match(setup, /init-pack/);
    assert.match(setup, /INDEX\.md/);
    assert.match(setup, /stub\.md/);
    assert.doesNotMatch(setup, /Sync also prepends `skills\/closed-loop\/protocol\.md`/);
    assert.match(setup, /prepend `skills\/closed-loop\/stub\.md`/);
    assert.doesNotMatch(packMd, /protocol \(prepended by sync\)/);
    assert.match(packMd, /stub\.md` \(prepended by/);
  });

  it("agents/INDEX.md is kernel-generic and skipped by lintAgents", async () => {
    const rules = JSON.parse(
      await readFile(join(REPO_ROOT, "pack", "hygiene-rules.json"), "utf-8"),
    );
    const index = await readFile(join(REPO_ROOT, "agents", "INDEX.md"), "utf-8");
    for (const needle of rules.bannedSubstrings ?? []) {
      assert.ok(!index.includes(needle), `agents/INDEX.md leaks ${needle}`);
    }

    const root = await mkdtemp(join(tmpdir(), "pack-index-skip-"));
    await mkdir(join(root, "agents"), { recursive: true });
    await mkdir(join(root, "pack"), { recursive: true });
    await cpRules(root);
    await writeFile(
      join(root, "agents", "ok.md"),
      "---\nname: ok\n---\nRead context/README.md\n",
    );
    await writeFile(join(root, "agents", "INDEX.md"), "The Climb uses #cbf24d\n");
    const { filesChecked, violations } = await lintAgents(root);
    assert.equal(filesChecked, 1, "INDEX.md must not be counted as a role file");
    assert.ok(
      !violations.some((v) => v.file === "INDEX.md"),
      "lintAgents skip of INDEX.md is load-bearing; keep agents/INDEX.md generic",
    );
  });

  it("archive/INDEX.md stays generic so pack export has no product history names", async () => {
    const archiveIndex = await readFile(join(REPO_ROOT, "archive", "INDEX.md"), "utf-8");
    assert.doesNotMatch(archiveIndex, /2026-08-29/);
    assert.doesNotMatch(archiveIndex, /package-upgrade/);
    assert.match(archiveIndex, /Do \*\*not\*\* read this directory during normal work/);
  });

  it("purgeDoNotCopy applies every manifest pattern, not a hardcoded subset", async () => {
    const dest = await mkdtemp(join(tmpdir(), "pack-purge-"));
    await mkdir(join(dest, "archive", "reviews"), { recursive: true });
    await mkdir(join(dest, "app"), { recursive: true });
    await mkdir(join(dest, "loop"), { recursive: true });
    await writeFile(join(dest, "archive", "INDEX.md"), "# keep\n");
    await writeFile(join(dest, "archive", "reviews", "secret.md"), "history\n");
    await writeFile(join(dest, "archive", "package-upgrade.md"), "upgrade\n");
    await writeFile(join(dest, "loop", "learnings.md"), "product ledger\n");
    await writeFile(join(dest, "app", "game.ts"), "product\n");
    await writeFile(join(dest, "CHANGELOG.md"), "log\n");

    const { purgeDoNotCopy, doNotCopyTarget } = await loadPackCopy();
    const manifest = JSON.parse(await readFile(join(REPO_ROOT, "pack", "MANIFEST.json"), "utf-8"));
    await purgeDoNotCopy(dest, manifest);

    assert.equal(await pathExists(join(dest, "archive", "reviews", "secret.md")), false);
    assert.equal(await pathExists(join(dest, "archive", "package-upgrade.md")), false);
    assert.equal(await pathExists(join(dest, "loop", "learnings.md")), false);
    assert.equal(await pathExists(join(dest, "app", "game.ts")), false);
    assert.equal(await pathExists(join(dest, "CHANGELOG.md")), false);
    assert.equal(await pathExists(join(dest, "archive", "INDEX.md")), true);

    await purgeDoNotCopy(dest, { doNotCopy: [".", "./"] });
    assert.equal(await pathExists(join(dest, "archive", "INDEX.md")), true);
    assert.equal(doNotCopyTarget("."), null);
  });

  it("init-pack does not wipe dest product trees via purgeDoNotCopy", async () => {
    const initSrc = await readFile(join(REPO_ROOT, "scripts", "init-pack.mjs"), "utf-8");
    assert.doesNotMatch(initSrc, /purgeDoNotCopy\s*\(/);
    assert.doesNotMatch(initSrc, /purgeDoNotCopy,/);
    const exportSrc = await readFile(join(REPO_ROOT, "scripts", "export-template.mjs"), "utf-8");
    assert.match(exportSrc, /purgeDoNotCopy/);
  });

  it("doNotCopyTarget rejects path escape", async () => {
    const { doNotCopyTarget } = await loadPackCopy();
    assert.equal(doNotCopyTarget("app/**"), "app");
    assert.equal(doNotCopyTarget("archive/package-upgrade.md"), "archive/package-upgrade.md");
    assert.equal(doNotCopyTarget("../etc/passwd"), null);
    assert.equal(doNotCopyTarget("/etc/passwd"), null);
    assert.equal(doNotCopyTarget("."), null);
    assert.equal(doNotCopyTarget("./"), null);
  });

  it("root INDEX.md is a small routing table", async () => {
    const index = await readFile(join(REPO_ROOT, "INDEX.md"), "utf-8");
    assert.ok(index.length < 2500, `INDEX.md is ${index.length} bytes; keep it a routing table`);
    assert.match(index, /RULES\.md/);
    assert.match(index, /workflows\//);
    assert.doesNotMatch(index, /Standing rules \(always apply\)/);
    assert.doesNotMatch(index, /Whole-app closed loop/);
    assert.doesNotMatch(index, /entire app/);
    const skill = await readFile(join(REPO_ROOT, "skills", "closed-loop", "SKILL.md"), "utf-8");
    assert.doesNotMatch(skill, /Closed Loop App Builder/);
    assert.doesNotMatch(skill, /entire app autonomously/);
  });

  it("fixLoopGitignore rewrites loop/ so learnings are not ignored", async () => {
    const { fixLoopGitignore } = await loadPackCopy();
    const fixed = fixLoopGitignore("loop/\nnode_modules/\n");
    assert.match(fixed, /^loop\/\*/m);
    assert.match(fixed, /!loop\/learnings\.md/);
    assert.match(fixed, /!loop\/learnings\.jsonl/);
    assert.match(fixed, /!loop\/INDEX\.md/);

    const dest = await mkdtemp(join(tmpdir(), "pack-gitignore-"));
    await spawnOk("git", ["init"], dest);
    await mkdir(join(dest, "loop"), { recursive: true });
    await writeFile(join(dest, ".gitignore"), "loop/\n");
    await writeFile(join(dest, "loop", "learnings.md"), "# ledger\n");
    await writeFile(join(dest, "loop", "learnings.jsonl"), "");
    await writeFile(join(dest, "loop", "INDEX.md"), "# loop index\n");

    const { mergeGitignore } = await loadPackCopy();
    const snippet = await readFile(join(REPO_ROOT, "pack", "templates", "gitignore.snippet"), "utf-8");
    await mergeGitignore(dest, snippet);

    const ignored = await gitCheckIgnore(dest, "loop/learnings.md");
    assert.equal(ignored, false, "loop/learnings.md must not be ignored after mergeGitignore");
    const indexIgnored = await gitCheckIgnore(dest, "loop/INDEX.md");
    assert.equal(indexIgnored, false, "loop/INDEX.md must not be ignored after mergeGitignore");
  });
});

type HygieneViolation = {
  file: string;
  kind: string;
  needle: string;
};

type HygieneModule = {
  lintAgents: (
    root?: string,
  ) => Promise<{ filesChecked: number; violations: HygieneViolation[] }>;
};

type PackCopyModule = {
  fixLoopGitignore: (content: string) => string;
  mergeGitignore: (
    destRoot: string,
    snippet: string,
    options?: { overwrite?: boolean },
  ) => Promise<void>;
  purgeDoNotCopy: (
    destRoot: string,
    manifest: { doNotCopy?: string[] },
  ) => Promise<void>;
  doNotCopyTarget: (pattern: string) => string | null;
};

async function importRootScript<T>(relativeFromHere: string): Promise<T> {
  const href = new URL(relativeFromHere, import.meta.url).href;
  return (await import(href)) as T;
}

async function loadPackCopy() {
  return importRootScript<PackCopyModule>("../../scripts/pack-copy.mjs");
}

async function lintAgents(root: string) {
  const mod = await importRootScript<HygieneModule>("../../scripts/hygiene.mjs");
  return mod.lintAgents(root);
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await readFile(path);
    return true;
  } catch {
    return false;
  }
}

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
