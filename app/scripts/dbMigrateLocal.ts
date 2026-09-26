/**
 * `pnpm db:migrate:local`: `prisma migrate deploy` against a LOCAL database
 * only (SEC-DC-18). Refuses, without starting Prisma, unless DATABASE_URL and
 * DIRECT_URL are both set and both point at a loopback host:
 *
 *   L=postgresql://postgres@127.0.0.1:55432/dailytest
 *   DATABASE_URL=$L DIRECT_URL=$L pnpm db:migrate:local
 */

import { spawnSync } from "node:child_process";
import { localDbProblems } from "./localDbGuard";

const problems = localDbProblems(process.env);
if (problems.length > 0) {
  process.stderr.write(
    `db:migrate:local refused, nothing was run:\n${problems.map((p) => `  - ${p}`).join("\n")}\n`,
  );
  process.exit(1);
}

const result = spawnSync("prisma", ["migrate", "deploy"], { stdio: "inherit", env: process.env, shell: false });
process.exit(result.status ?? 1);
