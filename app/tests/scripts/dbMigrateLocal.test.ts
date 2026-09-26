/**
 * SEC-DC-18: `pnpm db:migrate:local` must never run Prisma against a
 * non-local database. Prisma migrate reads DIRECT_URL, so both URLs are
 * checked, and both must be set in the environment (a .env value never
 * overrides one, so a production value there cannot slip in).
 *
 * The refusal cases run the real script as a child process. They are built so
 * that even a broken guard could not reach a real database: remote hosts use
 * the reserved .invalid TLD, "unset" is an empty string (dotenv never replaces
 * a variable that exists), and DOTENV_CONFIG_PATH points prisma.config's
 * dotenv at a file that does not exist, so a developer's .env is never read.
 */

import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { isLocalDbUrl, localDbProblems } from "../../scripts/localDbGuard";

const LOCAL = "postgresql://postgres@127.0.0.1:55432/dailytest";
const REMOTE_POOLED = "postgresql://owner:secret@ep-prod-pooler.example.invalid/neondb?sslmode=require";
const REMOTE_DIRECT = "postgresql://owner:secret@ep-prod.example.invalid/neondb?sslmode=require";

const APP_DIR = resolve(import.meta.dirname, "../..");
const TSX = resolve(APP_DIR, "node_modules/.bin/tsx");

function runScript(env: Record<string, string | undefined>) {
  // Never inherit the shell's (possibly production) URLs.
  const merged: NodeJS.ProcessEnv = { ...process.env, DATABASE_URL: "", DIRECT_URL: "" };
  for (const [k, v] of Object.entries(env)) if (v !== undefined) merged[k] = v;
  merged.DOTENV_CONFIG_PATH = resolve(APP_DIR, "does-not-exist.env");
  return spawnSync(TSX, ["scripts/dbMigrateLocal.ts"], { cwd: APP_DIR, env: merged, encoding: "utf8", timeout: 60_000 });
}

describe("isLocalDbUrl", () => {
  it.each([
    "postgresql://postgres@localhost/db",
    "postgresql://postgres@127.0.0.1:55432/db",
    "postgres://u:p@[::1]:5432/db",
  ])("accepts loopback %s", (url) => {
    expect(isLocalDbUrl(url)).toBe(true);
  });

  it.each([
    REMOTE_DIRECT,
    "postgresql://u@localhost.example.invalid/db", // a lookalike, not loopback
    "postgresql://u@127.0.0.2/db",
    "postgresql://u@localhost/db?host=ep-prod.example.invalid", // host= overrides the authority
    "mysql://u@localhost/db",
    "not a url",
    "",
  ])("refuses %j", (url) => {
    expect(isLocalDbUrl(url)).toBe(false);
  });
});

describe("localDbProblems", () => {
  it("passes only when both URLs are set and local", () => {
    expect(localDbProblems({ DATABASE_URL: LOCAL, DIRECT_URL: LOCAL })).toEqual([]);
  });

  it("the exported-production case: a local DATABASE_URL does not excuse a remote DIRECT_URL", () => {
    const problems = localDbProblems({ DATABASE_URL: LOCAL, DIRECT_URL: REMOTE_DIRECT });
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatch(/^DIRECT_URL /);
    expect(problems[0]).toContain("ep-prod.example.invalid");
    expect(problems[0]).not.toContain("secret"); // no credentials in the message
  });

  it("a remote DATABASE_URL is refused too, and an unset URL is refused", () => {
    expect(localDbProblems({ DATABASE_URL: REMOTE_POOLED, DIRECT_URL: LOCAL })[0]).toMatch(/^DATABASE_URL /);
    expect(localDbProblems({ DATABASE_URL: LOCAL })).toEqual([expect.stringMatching(/^DIRECT_URL is not set/)]);
    expect(localDbProblems({})).toHaveLength(2);
  });
});

describe("pnpm db:migrate:local (the script itself)", () => {
  it.each([
    ["remote DIRECT_URL (the SEC-DC-18 footgun)", { DATABASE_URL: LOCAL, DIRECT_URL: REMOTE_DIRECT }],
    ["remote DATABASE_URL", { DATABASE_URL: REMOTE_POOLED, DIRECT_URL: LOCAL }],
    ["both remote", { DATABASE_URL: REMOTE_POOLED, DIRECT_URL: REMOTE_DIRECT }],
    ["DIRECT_URL unset", { DATABASE_URL: LOCAL }],
    ["DIRECT_URL empty", { DATABASE_URL: LOCAL, DIRECT_URL: "" }],
  ])("refuses with %s, exits 1, and never starts Prisma", (_label, env) => {
    const out = runScript(env);
    expect(out.status).toBe(1);
    expect(out.stderr).toContain("db:migrate:local refused, nothing was run");
    expect(`${out.stdout}${out.stderr}`).not.toMatch(/prisma|datasource|migrations? (found|applied)/i);
  });
});
