/**
 * Season generator and checker (design doc §3d).
 *
 *   pnpm season:generate 1            build season 1's 300 levels and write
 *                                     src/game/levels/seasons/season-1.json
 *   pnpm season:verify 1              re-run the gate on the committed manifest
 *   pnpm season:verify 1 --shard 2/4  only every 4th level, starting at the 2nd
 *
 * Options: --jobs N (parallel processes, default: CPU count),
 * --levels A-B (generate only: a range, printed instead of written).
 *
 * Generate refuses to write unless every level passes the gate, and exits 1
 * with the failing levels when a setting is "config unwinnable".
 */

import { spawn } from "node:child_process";
import { availableParallelism } from "node:os";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildManifest,
  generateLevel,
  manifestShapeProblems,
  serializeManifest,
  verifyLevelRow,
  ConfigUnwinnableError,
  type ManifestLevel,
  type SeasonManifest,
} from "../src/game/levels/seasonGate";
import {
  LEVELS_PER_SEASON,
  SEASONS,
  seasonById,
  seasonSpecProblems,
  type SeasonSpec,
} from "../src/game/levels/season";

const SELF = fileURLToPath(import.meta.url);
const APP_DIR = join(dirname(SELF), "..");

export function manifestPath(seasonId: number): string {
  return join(APP_DIR, "src/game/levels/seasons", `season-${seasonId}.json`);
}

type WorkerTask = { mode: "generate" | "verify"; season: number; levels: number[] };
type WorkerLine =
  | { level: number; row: ManifestLevel }
  | { level: number; problems: string[] };

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

function fail(msg: string): never {
  process.stderr.write(`${msg}\n`);
  process.exit(1);
}

function seasonOrFail(raw: string | undefined): SeasonSpec {
  const id = Number(raw);
  const season = Number.isInteger(id) ? seasonById(id) : null;
  if (!season) fail(`unknown season "${raw}"; known: ${SEASONS.map((s) => s.id).join(", ")}`);
  const prev = seasonById(season.id - 1);
  const problems = seasonSpecProblems(season, prev);
  if (problems.length > 0) fail(`season ${season.id} spec refused:\n  ${problems.join("\n  ")}`);
  return season;
}

function parseRange(raw: string | undefined): number[] {
  if (!raw) return Array.from({ length: LEVELS_PER_SEASON }, (_, i) => i + 1);
  const m = /^(\d+)-(\d+)$/.exec(raw);
  if (!m) fail(`--levels must look like 1-50, got "${raw}"`);
  const [a, b] = [Number(m[1]), Number(m[2])];
  if (a < 1 || b > LEVELS_PER_SEASON || a > b) fail(`--levels out of range: ${raw}`);
  return Array.from({ length: b - a + 1 }, (_, i) => a + i);
}

function parseShard(raw: string | undefined, levels: number[]): number[] {
  if (!raw) return levels;
  const m = /^(\d+)\/(\d+)$/.exec(raw);
  if (!m) fail(`--shard must look like 1/4, got "${raw}"`);
  const [i, n] = [Number(m[1]), Number(m[2])];
  if (n < 1 || i < 1 || i > n) fail(`--shard out of range: ${raw}`);
  return levels.filter((_, k) => k % n === i - 1);
}

/** Run a task in child processes, `jobs` at a time, one level list each. */
async function runParallel(task: WorkerTask, jobs: number): Promise<WorkerLine[]> {
  // Interleave so slow late levels spread across workers.
  const buckets: number[][] = Array.from({ length: jobs }, () => []);
  task.levels.forEach((lv, i) => buckets[i % jobs].push(lv));
  const lines: WorkerLine[] = [];
  let done = 0;
  await Promise.all(
    buckets
      .filter((b) => b.length > 0)
      .map(
        (levels) =>
          new Promise<void>((resolve, reject) => {
            const child = spawn(
              process.execPath,
              [...process.execArgv, SELF, "worker", JSON.stringify({ ...task, levels })],
              { stdio: ["ignore", "pipe", "inherit"] }
            );
            let buf = "";
            child.stdout.on("data", (chunk: Buffer) => {
              buf += chunk.toString("utf8");
              let nl: number;
              while ((nl = buf.indexOf("\n")) >= 0) {
                const line = buf.slice(0, nl);
                buf = buf.slice(nl + 1);
                if (!line.trim()) continue;
                const parsed = JSON.parse(line) as WorkerLine;
                lines.push(parsed);
                done += 1;
                const status = "row" in parsed ? `ok (rev ${parsed.row.rev})` : "FAILED";
                process.stderr.write(`[${done}/${task.levels.length}] L${parsed.level} ${status}\n`);
              }
            });
            child.on("error", reject);
            child.on("exit", (code) =>
              code === 0 ? resolve() : reject(new Error(`worker exited with ${code}`))
            );
          })
      )
  );
  return lines.sort((a, b) => a.level - b.level);
}

function worker(task: WorkerTask): void {
  const season = seasonById(task.season);
  if (!season) fail(`unknown season ${task.season}`);
  const rows =
    task.mode === "verify"
      ? (JSON.parse(readFileSync(manifestPath(season.id), "utf8")) as SeasonManifest).levels
      : [];
  for (const level of task.levels) {
    let line: WorkerLine;
    if (task.mode === "generate") {
      try {
        line = { level, row: generateLevel(season, level) };
      } catch (err) {
        if (!(err instanceof ConfigUnwinnableError)) throw err;
        line = { level, problems: [err.message] };
      }
    } else {
      const row = rows[level - 1];
      line = { level, problems: verifyLevelRow(season, row) };
    }
    process.stdout.write(`${JSON.stringify(line)}\n`);
  }
}

async function main(): Promise<void> {
  const [cmd, rawSeason] = process.argv.slice(2);
  if (cmd === "worker") return worker(JSON.parse(rawSeason) as WorkerTask);

  const jobs = Number(arg("jobs") ?? availableParallelism());
  if (!Number.isInteger(jobs) || jobs < 1) fail(`--jobs must be a positive integer`);
  const season = seasonOrFail(rawSeason);
  const started = Date.now();

  if (cmd === "generate") {
    const levels = parseRange(arg("levels"));
    const lines = await runParallel({ mode: "generate", season: season.id, levels }, jobs);
    const failed = lines.filter((l): l is Extract<WorkerLine, { problems: string[] }> => "problems" in l);
    if (failed.length > 0) {
      fail(`season ${season.id} not written:\n${failed.flatMap((l) => l.problems).join("\n")}`);
    }
    const rows = lines.map((l) => (l as { row: ManifestLevel }).row);
    if (levels.length !== LEVELS_PER_SEASON) {
      process.stdout.write(`${rows.map((r) => JSON.stringify(r)).join("\n")}\n`);
      return;
    }
    const manifest = buildManifest(season, rows);
    const problems = manifestShapeProblems(manifest, season);
    if (problems.length > 0) fail(`season ${season.id} not written:\n  ${problems.join("\n  ")}`);
    const out = manifestPath(season.id);
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, serializeManifest(manifest));
    const rerolled = rows.filter((r) => r.rev > 0).length;
    process.stderr.write(
      `wrote ${out}: ${rows.length} levels, ${rerolled} re-rolled, ${Math.round((Date.now() - started) / 1000)} s\n`
    );
    return;
  }

  if (cmd === "verify") {
    let manifest: SeasonManifest;
    try {
      manifest = JSON.parse(readFileSync(manifestPath(season.id), "utf8")) as SeasonManifest;
    } catch (err) {
      fail(`season ${season.id} has no readable manifest: ${(err as Error).message}`);
    }
    const shape = manifestShapeProblems(manifest, season);
    if (shape.length > 0) fail(`season ${season.id} manifest refused:\n  ${shape.join("\n  ")}`);
    const levels = parseShard(arg("shard"), parseRange(undefined));
    const lines = await runParallel({ mode: "verify", season: season.id, levels }, jobs);
    const problems = lines.flatMap((l) => ("problems" in l ? l.problems : []));
    if (problems.length > 0) fail(`season ${season.id} failed the gate:\n  ${problems.join("\n  ")}`);
    process.stderr.write(
      `season ${season.id}: ${levels.length} levels pass the gate, ${Math.round((Date.now() - started) / 1000)} s\n`
    );
    return;
  }

  fail("usage: season.ts generate|verify <season> [--jobs N] [--levels A-B] [--shard i/n]");
}

main().catch((err: unknown) => fail(err instanceof Error ? (err.stack ?? err.message) : String(err)));
