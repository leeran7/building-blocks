import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

describe("skip-vercel-if-app-unchanged", () => {
  const repos: string[] = [];

  afterEach(() => {
    for (const repo of repos.splice(0)) {
      rmSync(repo, { recursive: true, force: true });
    }
  });

  it("builds when VERCEL_GIT_PREVIOUS_SHA is unset", () => {
    const repo = makeRepo(repos);
    const base = commit(repo, "base");
    commitDocs(repo, "notes");
    const result = runSkip(repo, undefined);
    expect(result.status).toBe(1);
    expect(result.stdout).toMatch(/missing or not a commit SHA/);
    expect(base).toMatch(/^[0-9a-f]{40}$/);
  });

  it("builds when PREV equals HEAD", () => {
    const repo = makeRepo(repos);
    commit(repo, "base");
    const head = git(repo, ["rev-parse", "HEAD"]);
    const result = runSkip(repo, head);
    expect(result.status).toBe(1);
    expect(result.stdout).toMatch(/equals HEAD/);
  });

  it("builds when app/ changed since PREV", () => {
    const repo = makeRepo(repos);
    const base = commit(repo, "base");
    writeFileSync(path.join(repo, "app/keep.txt"), "changed\n");
    git(repo, ["add", "app/keep.txt"]);
    git(repo, ["commit", "-m", "app delta"]);
    const result = runSkip(repo, base);
    expect(result.status).toBe(1);
    expect(result.stdout).toMatch(/app\/ changed/);
  });

  it("skips when only docs changed since PREV", () => {
    const repo = makeRepo(repos);
    const base = commit(repo, "base");
    commitDocs(repo, "ledger only");
    const result = runSkip(repo, base);
    expect(result.status).toBe(0);
    expect(result.stdout).toMatch(/skipping build/);
  });

  it("builds when PREV is a git switch, not a SHA", () => {
    const repo = makeRepo(repos);
    commit(repo, "base");
    commitDocs(repo, "notes");
    const outFile = path.join(repo, "pwned");
    const result = runSkip(repo, `--output=${outFile}`);
    expect(result.status).toBe(1);
    expect(result.stdout).toMatch(/missing or not a commit SHA/);
    expect(existsSync(outFile)).toBe(false);
  });

  it("builds when PREV is an unreachable hex object", () => {
    const repo = makeRepo(repos);
    commit(repo, "base");
    const result = runSkip(repo, "deadbeefdeadbeefdeadbeefdeadbeefdeadbeef");
    expect(result.status).toBe(1);
    expect(result.stdout).toMatch(/not a reachable commit/);
  });
});

const SCRIPT_SRC = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../scripts/skip-vercel-if-app-unchanged.sh"
);

function makeRepo(repos: string[]): string {
  const repo = mkdtempSync(path.join(tmpdir(), "skip-vercel-"));
  repos.push(repo);
  git(repo, ["init"]);
  git(repo, ["config", "user.email", "skip-vercel@test.local"]);
  git(repo, ["config", "user.name", "skip-vercel"]);
  mkdirSync(path.join(repo, "app/scripts"), { recursive: true });
  mkdirSync(path.join(repo, "docs"), { recursive: true });
  writeFileSync(path.join(repo, "app/keep.txt"), "base\n");
  writeFileSync(path.join(repo, "docs/note.md"), "ledger\n");
  cpSync(SCRIPT_SRC, path.join(repo, "app/scripts/skip-vercel-if-app-unchanged.sh"));
  return repo;
}

function commit(repo: string, message: string): string {
  git(repo, ["add", "app", "docs"]);
  git(repo, ["commit", "-m", message]);
  return git(repo, ["rev-parse", "HEAD"]);
}

function commitDocs(repo: string, message: string): string {
  writeFileSync(path.join(repo, "docs/note.md"), `${message}\n`);
  git(repo, ["add", "docs/note.md"]);
  git(repo, ["commit", "-m", message]);
  return git(repo, ["rev-parse", "HEAD"]);
}

function runSkip(
  repo: string,
  prev: string | undefined
): { status: number; stdout: string } {
  const env = { ...process.env };
  delete env.VERCEL_GIT_PREVIOUS_SHA;
  if (prev !== undefined) {
    env.VERCEL_GIT_PREVIOUS_SHA = prev;
  }
  const result = spawnSync(
    "bash",
    [path.join(repo, "app/scripts/skip-vercel-if-app-unchanged.sh")],
    {
      cwd: path.join(repo, "app"),
      encoding: "utf8",
      env,
    }
  );
  return {
    status: result.status ?? 1,
    stdout: `${result.stdout ?? ""}${result.stderr ?? ""}`,
  };
}

function git(repo: string, args: string[]): string {
  const result = spawnSync("git", ["-C", repo, "-c", "commit.gpgsign=false", ...args], {
    encoding: "utf8",
  });
  if (result.status !== 0) {
    throw new Error(
      `git ${args.join(" ")} failed: ${result.stdout ?? ""}${result.stderr ?? ""}`
    );
  }
  return (result.stdout ?? "").trim();
}
