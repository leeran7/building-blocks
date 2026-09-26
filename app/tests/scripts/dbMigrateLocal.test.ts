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
import { ALLOWED_DB_URL_PARAMS, isLocalDbUrl, localDbProblems } from "../../scripts/localDbGuard";

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

describe("isLocalDbUrl: query keys are an allow-list (SEC-DC-18 follow-up)", () => {
  it("accepts every allowed key on a loopback URL", () => {
    const query = [...ALLOWED_DB_URL_PARAMS].map((k) => `${k}=1`).join("&");
    expect(ALLOWED_DB_URL_PARAMS.size).toBe(8);
    expect(isLocalDbUrl(`postgresql://postgres@127.0.0.1:55432/db?${query}`)).toBe(true);
    expect(isLocalDbUrl("postgresql://postgres@localhost/db?schema=public&sslmode=disable")).toBe(true);
  });

  it.each([
    "postgresql://u@localhost/db?host=ep-prod.example.invalid",
    "postgresql://u@localhost/db?hostaddr=192.0.2.10", // libpq and node-postgres connect here
    "postgresql://u@localhost/db?service=prod", // libpq reads the host from pg_service.conf
    "postgresql://u@localhost/db?HOST=ep-prod.example.invalid",
    "postgresql://u@localhost/db?Host=ep-prod.example.invalid",
    "postgresql://u@localhost/db?HostAddr=192.0.2.10",
    "postgresql://u@localhost/db?ho%73t=ep-prod.example.invalid", // percent-encoded "host"
    "postgresql://u@localhost/db?%68ostaddr=192.0.2.10", // percent-encoded "hostaddr"
    "postgresql://u@localhost/db?schema=public&host=ep-prod.example.invalid", // after an allowed key
    "postgresql://u@localhost/db?sslmode=disable&options=-c%20search_path%3Dx", // any other key
    "postgresql://u@localhost/db?SCHEMA=public", // allowed keys are case-sensitive too
    "postgresql://u@localhost/db?=x", // an empty key
  ])("refuses %j", (url) => {
    expect(isLocalDbUrl(url)).toBe(false);
  });

  it("the refusal message names the allowed keys and still hides credentials", () => {
    const [problem] = localDbProblems({
      DATABASE_URL: "postgresql://u:secret@localhost/db?hostaddr=192.0.2.10",
      DIRECT_URL: LOCAL,
    });
    expect(problem).toMatch(/^DATABASE_URL /);
    expect(problem).toContain("sslmode");
    expect(problem).not.toContain("secret");
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
    ["local DIRECT_URL redirected by hostaddr=", { DATABASE_URL: LOCAL, DIRECT_URL: `${LOCAL}?hostaddr=192.0.2.10` }],
  ])("refuses with %s, exits 1, and never starts Prisma", (_label, env) => {
    const out = runScript(env);
    expect(out.status).toBe(1);
    expect(out.stderr).toContain("db:migrate:local refused, nothing was run");
    expect(`${out.stdout}${out.stderr}`).not.toMatch(/prisma|datasource|migrations? (found|applied)/i);
  });
});

describe("isLocalDbUrl: the allow-list is exactly the documented 8 keys (verifier)", () => {
  // Written out here, not read back from ALLOWED_DB_URL_PARAMS: a key swapped
  // inside the set (size still 8) must not pass unnoticed.
  const DOCUMENTED = [
    "schema",
    "sslmode",
    "connection_limit",
    "pool_timeout",
    "connect_timeout",
    "pgbouncer",
    "statement_cache_size",
    "socket_timeout",
  ];

  it.each(DOCUMENTED)("accepts %s on its own on a loopback URL", (key) => {
    expect(isLocalDbUrl(`postgresql://postgres@127.0.0.1:55432/db?${key}=1`)).toBe(true);
  });

  it("the exported set is those 8 and nothing else", () => {
    expect([...ALLOWED_DB_URL_PARAMS].sort()).toEqual([...DOCUMENTED].sort());
  });

  it.each([
    "dbname", // libpq can expand a dbname into a whole connection string
    "passfile",
    "sslrootcert",
    "sslcert",
    "sslkey",
    "target_session_attrs",
    "port",
    "user",
  ])("refuses the undocumented key %s", (key) => {
    // Positive control first: the same URL without the key is local.
    expect(isLocalDbUrl("postgresql://u@localhost/db?sslmode=disable")).toBe(true);
    expect(isLocalDbUrl(`postgresql://u@localhost/db?sslmode=disable&${key}=x`)).toBe(false);
  });
});
