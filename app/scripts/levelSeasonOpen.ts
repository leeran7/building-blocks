/**
 * `pnpm levels:season:open <season> [--at ISO] [--apply] [--remote]`: switch
 * a level season on by inserting its level_seasons row (design §3d). Levels
 * are served once that row exists and its starts_at has passed.
 *
 * Without --apply it only prints the SQL. With --apply it inserts the row,
 * refusing unless DATABASE_URL is a local database; --remote lifts that, for
 * the one deliberate production run. An existing row is never changed: to
 * reschedule a season, edit it by hand.
 *
 *   pnpm levels:season:open 1                      print the SQL
 *   DATABASE_URL=$L pnpm levels:season:open 1 --apply
 */

import { isLocalDbUrl } from "./localDbGuard";
import { manifestProblems, seasonManifest } from "../src/levels/catalog";
import { LEVEL_SIM_VERSION } from "../src/game/simVersion";

export interface SeasonOpen {
  id: number;
  name: string;
  startsAt: Date;
  minLevelSimVersion: number;
  sql: string;
}

/** The row that switches season `id` on at `startsAt`, or the reasons it can't. */
export function seasonOpenPlan(id: number, startsAt: Date): SeasonOpen | { problems: string[] } {
  if (!Number.isInteger(id) || id < 1) return { problems: [`bad season "${id}"`] };
  if (Number.isNaN(startsAt.getTime())) return { problems: ["bad --at time"] };
  const manifest = seasonManifest(id);
  if (!manifest) return { problems: manifestProblems(id) };
  const name = manifest.season.name;
  const sql =
    "INSERT INTO level_seasons (id, name, starts_at, min_level_sim_version)\n" +
    `VALUES (${id}, '${name.replace(/'/g, "''")}', '${startsAt.toISOString()}', ${LEVEL_SIM_VERSION})\n` +
    "ON CONFLICT (id) DO NOTHING;";
  return { id, name, startsAt, minLevelSimVersion: LEVEL_SIM_VERSION, sql };
}

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

function fail(msg: string): never {
  process.stderr.write(`${msg}\n`);
  process.exit(1);
}

async function main(): Promise<void> {
  const at = arg("at");
  const plan = seasonOpenPlan(Number(process.argv[2]), at ? new Date(at) : new Date());
  if ("problems" in plan) fail(`season refused, nothing was run:\n  ${plan.problems.slice(0, 10).join("\n  ")}`);
  process.stdout.write(`${plan.sql}\n`);
  if (!process.argv.includes("--apply")) return;

  const url = process.env.DATABASE_URL ?? "";
  let host = "(unset)";
  try {
    host = new URL(url).hostname;
  } catch {}
  if (!isLocalDbUrl(url) && !process.argv.includes("--remote")) {
    fail(`DATABASE_URL is not local (host ${host}); pass --remote to write to it.`);
  }

  const { prisma } = await import("../src/db/client");
  try {
    const { count } = await prisma.levelSeason.createMany({
      data: [{ id: plan.id, name: plan.name, starts_at: plan.startsAt, min_level_sim_version: plan.minLevelSimVersion }],
      skipDuplicates: true,
    });
    const row = await prisma.levelSeason.findUnique({ where: { id: plan.id } });
    process.stdout.write(
      `${count === 1 ? "inserted" : "already there, left unchanged"} on ${host}: ${JSON.stringify(row)}\n`
    );
  } finally {
    await prisma.$disconnect();
  }
}

if (process.argv[1]?.endsWith("levelSeasonOpen.ts")) {
  main().catch((err) => fail(String(err)));
}
