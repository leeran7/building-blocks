import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { REPO_ROOT } from "./types.js";

const CONTEXT_FILES = [
  "README.md",
  "profile.json",
  "gates.json",
  "trust.md",
  "git.md",
  "conventions.md",
] as const;

const EXCERPT_LIMIT = 12_000;

export const CONTEXT_DIR = join(REPO_ROOT, "context");

export interface PackageManager {
  path: string;
  command: "yarn" | "pnpm" | "npm";
}

export interface RepoProfile {
  name: string;
  product?: string;
  packageManagers: PackageManager[];
  stack?: Record<string, string>;
  paths?: Record<string, string>;
  requiredTeam?: string[];
}

export async function loadProfile(root = REPO_ROOT): Promise<RepoProfile | null> {
  try {
    const raw = await readFile(join(root, "context", "profile.json"), "utf-8");
    return JSON.parse(raw) as RepoProfile;
  } catch {
    return null;
  }
}

export async function loadRepoContextExcerpt(root = REPO_ROOT): Promise<string> {
  const dir = join(root, "context");
  const parts: string[] = [];
  for (const file of CONTEXT_FILES) {
    try {
      const body = await readFile(join(dir, file), "utf-8");
      parts.push(`### context/${file}\n${body.trim()}`);
    } catch {
      // optional file
    }
  }
  if (parts.length === 0) {
    return "(no context/ folder — infer stack and package managers from the repository; do not invent them)";
  }
  const joined = parts.join("\n\n");
  return joined.length > EXCERPT_LIMIT ? `${joined.slice(0, EXCERPT_LIMIT)}\n…` : joined;
}

export function packageManagerFor(profile: RepoProfile | null, cwd = "."): string {
  if (!profile?.packageManagers?.length) return "yarn";
  const exact = profile.packageManagers.find((entry) => entry.path === cwd);
  return (exact ?? profile.packageManagers[0]).command;
}
