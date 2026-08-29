#!/usr/bin/env node
/**
 * Shared kernel copy utilities driven by pack/MANIFEST.json.
 */
import { readFile, writeFile, mkdir, cp, rm, stat } from "node:fs/promises";
import { join, resolve, relative, dirname, basename } from "node:path";
import { glob } from "node:fs/promises";

export async function loadManifest(packRoot) {
  return JSON.parse(await readFile(join(packRoot, "pack", "MANIFEST.json"), "utf-8"));
}

export function assertSafeDest(dest) {
  const resolved = resolve(dest);
  if (resolved === "/" || resolved === resolve("/")) {
    throw new Error("Refusing dest /");
  }
  return resolved;
}

export function assertSafeOut(destRoot, outPath) {
  const rel = relative(destRoot, outPath);
  if (rel.startsWith("..") || rel === "..") {
    throw new Error(`Path escapes dest: ${outPath}`);
  }
}

export function hasSkippedSegment(relPath) {
  return relPath.split(/[/\\]/).some((part) => part === "node_modules" || part === "dist");
}

export function isSkippedKernelFile(relPath) {
  const base = basename(relPath);
  if (base === ".env" || base.startsWith(".env.")) return true;
  if (base.endsWith(".pem")) return true;
  return false;
}

export async function collectKernelFiles(packRoot, manifest) {
  const files = new Set();
  for (const pattern of manifest.kernel ?? []) {
    for await (const match of glob(pattern, { cwd: packRoot })) {
      files.add(match);
    }
  }
  return [...files].sort();
}

export async function copyKernel(packRoot, destArg) {
  const destRoot = assertSafeDest(destArg);
  const manifest = await loadManifest(packRoot);
  const files = await collectKernelFiles(packRoot, manifest);

  for (const rel of files) {
    if (hasSkippedSegment(rel) || isSkippedKernelFile(rel)) continue;
    const src = join(packRoot, rel);
    const out = join(destRoot, rel);
    assertSafeOut(destRoot, out);
    let info;
    try {
      info = await stat(src);
    } catch {
      continue;
    }
    if (!info.isFile()) continue;
    await mkdir(dirname(out), { recursive: true });
    await cp(src, out);
  }

  return { destRoot, manifest };
}

export async function purgeDoNotCopy(destRoot, manifest) {
  for (const pattern of manifest.doNotCopy ?? []) {
    if (pattern === "app/**") {
      await rm(join(destRoot, "app"), { recursive: true, force: true });
    } else if (pattern === "docs/reviews/**") {
      await rm(join(destRoot, "docs", "reviews"), { recursive: true, force: true });
    } else if (pattern === "CHANGELOG.md") {
      await rm(join(destRoot, "CHANGELOG.md"), { force: true });
    }
  }
}

export async function resetAgentsAndSkills(destRoot) {
  await rm(join(destRoot, "agents"), { recursive: true, force: true });
  await rm(join(destRoot, "skills", "closed-loop"), { recursive: true, force: true });
}

/**
 * Rewrite a directory ignore of loop/ or loop/** to loop/* plus ledger negations.
 */
export function fixLoopGitignore(content) {
  const lines = content.split("\n");
  const out = [];
  let replacedLoop = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!replacedLoop && (trimmed === "loop/" || trimmed === "loop/**")) {
      out.push("loop/*", "!loop/learnings.md", "!loop/learnings.jsonl");
      replacedLoop = true;
      continue;
    }
    out.push(line);
  }

  return out.join("\n");
}

export async function mergeGitignore(destRoot, snippet, { overwrite = false } = {}) {
  const gitignorePath = join(destRoot, ".gitignore");
  let current = "";
  try {
    current = await readFile(gitignorePath, "utf-8");
  } catch {
    /* new file */
  }

  if (!current.trim() || overwrite) {
    await writeFile(gitignorePath, `${snippet.trim()}\n`);
    return;
  }

  let next = fixLoopGitignore(current);
  if (!next.includes("!loop/learnings.md")) {
    next = `${next.trimEnd()}\n\n${snippet.trim()}\n`;
  }

  if (next !== current) {
    await writeFile(gitignorePath, next.endsWith("\n") ? next : `${next}\n`);
  }
}
