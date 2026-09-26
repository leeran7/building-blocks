/**
 * Refuse any Prisma CLI run whose database is not on this machine (SEC-DC-18).
 *
 * `prisma migrate` connects with DIRECT_URL, not DATABASE_URL, and a dev shell
 * may export the production values of both. Overriding only DATABASE_URL then
 * applies unreviewed branch migrations to production. Both URLs must be set
 * explicitly and both must name a loopback host. "Set" matters: prisma.config
 * loads .env with dotenv, which never overrides a variable already in the
 * environment, so requiring both in the environment also stops a production
 * value in .env from being used.
 */

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

/**
 * The only query keys a local URL may carry (exact, case-sensitive, after
 * percent-decoding). Each tunes the connection; none can move it. Anything
 * else is refused, including host, hostaddr and service, which libpq,
 * node-postgres or Prisma can use to connect somewhere other than the
 * authority's host (SEC-DC-18 follow-up).
 */
export const ALLOWED_DB_URL_PARAMS: ReadonlySet<string> = new Set([
  "schema",
  "sslmode",
  "connection_limit",
  "pool_timeout",
  "connect_timeout",
  "pgbouncer",
  "statement_cache_size",
  "socket_timeout",
]);

/** The two variables the Prisma CLI reads for this schema. */
export const PRISMA_URL_VARS = ["DATABASE_URL", "DIRECT_URL"] as const;

/**
 * Whether `raw` is a postgres URL whose host is loopback. Rejects anything
 * that does not parse, other schemes, and any query key outside
 * ALLOWED_DB_URL_PARAMS (host= replaces the authority's host in libpq and
 * Prisma; hostaddr= and service= redirect libpq and node-postgres).
 */
export function isLocalDbUrl(raw: string): boolean {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  if (url.protocol !== "postgresql:" && url.protocol !== "postgres:") return false;
  for (const key of url.searchParams.keys()) {
    if (!ALLOWED_DB_URL_PARAMS.has(key)) return false;
  }
  return LOCAL_HOSTS.has(url.hostname);
}

/** Host of a URL for an error message (never the credentials), or a placeholder. */
function hostOf(raw: string): string {
  try {
    return new URL(raw).hostname || "(none)";
  } catch {
    return "(unparseable)";
  }
}

/**
 * Problems that forbid a local migration, one line per variable; an empty
 * list means both URLs are set and local.
 */
export function localDbProblems(env: Readonly<Record<string, string | undefined>>): string[] {
  const problems: string[] = [];
  for (const name of PRISMA_URL_VARS) {
    const value = env[name];
    if (!value) {
      problems.push(`${name} is not set. Set it to the local database explicitly (a .env value is not trusted).`);
    } else if (!isLocalDbUrl(value)) {
      problems.push(`${name} must be a postgresql:// URL on localhost, 127.0.0.1 or ::1 and only these query keys: ${[...ALLOWED_DB_URL_PARAMS].join(", ")} (got host ${hostOf(value)}).`);
    }
  }
  return problems;
}
