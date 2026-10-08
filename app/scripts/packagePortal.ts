/**
 * Build one web-portal target and zip it for upload.
 *
 *   pnpm portal:package <crazygames|youtube|itch>
 *
 * Runs `vite build --mode <target>`, checks `mobile/dist-<target>` against
 * what the portal accepts, and writes `mobile/dist-zips/<target>.zip` with
 * index.html at the zip root. Exits non-zero, writing no zip, when:
 *  - index.html is not at the root of the build;
 *  - an asset URL in HTML, CSS or JS is root-absolute ("/assets/...") instead
 *    of relative, which 404s once the portal serves the zip from a subpath;
 *  - there are more than MAX_FILES files;
 *  - the total size is over the target's limit;
 *  - any text file names the Doomstack API origin or Firebase Auth, which
 *    means a portal bundle picked up account or network code.
 * Prints the file count and sizes either way.
 */

import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const PORTAL_TARGETS = ["crazygames", "youtube", "itch"] as const;
export type PortalTarget = (typeof PORTAL_TARGETS)[number];

/** Decimal megabytes: the stricter reading of each portal's "MB". */
export const MB = 1_000_000;
/** Portal file-count ceiling (CrazyGames: 1500). */
export const MAX_FILES = 1500;

export interface SizeLimit {
  /** Fail when the total is above this (or at it, with `failInclusive`). Null: no limit. */
  failBytes: number | null;
  failInclusive: boolean;
  /** Warn (still pass) when the total is above this. Null: no warning. */
  warnBytes: number | null;
  /** Why the warning matters, printed with it. */
  warnReason?: string;
}

export const SIZE_LIMITS: Record<PortalTarget, SizeLimit> = {
  // CrazyGames: 50 MB hard limit; 20 MB or less for the mobile homepage.
  crazygames: { failBytes: 50 * MB, failInclusive: false, warnBytes: 20 * MB, warnReason: "CrazyGames mobile homepage needs 20 MB or less" },
  // YouTube Playables: the bundle must be under 30 MB.
  youtube: { failBytes: 30 * MB, failInclusive: true, warnBytes: null },
  itch: { failBytes: null, failInclusive: false, warnBytes: null },
};

/** Strings that must never appear in a portal bundle (case-insensitive). */
export const FORBIDDEN_REFERENCES = ["doomstack.lol", "firebaseapp.com", "identitytoolkit"] as const;

const TEXT_EXTENSIONS = new Set([".html", ".htm", ".css", ".js", ".mjs", ".cjs", ".json", ".map", ".svg", ".webmanifest"]);

/** Allow-list parse of the CLI argument. */
export function parsePortalTarget(raw: unknown): PortalTarget | null {
  return typeof raw === "string" && (PORTAL_TARGETS as readonly string[]).includes(raw) ? (raw as PortalTarget) : null;
}

/** Root-absolute URLs ("/x", not "//host/x") in src/href attributes of an HTML file. */
export function absoluteHtmlRefs(html: string): string[] {
  return matches(html, /\b(?:src|href)\s*=\s*["']?(\/(?!\/)[^"'\s>]*)/gi);
}

/** Root-absolute url(...) references in a CSS file. */
export function absoluteCssRefs(css: string): string[] {
  return matches(css, /url\(\s*["']?(\/(?!\/)[^"')\s]*)/gi);
}

/** Root-absolute Vite asset paths ("/assets/...") quoted in a JS file. */
export function absoluteJsRefs(js: string): string[] {
  return matches(js, /["'`](\/assets\/[^"'`\s]*)/g);
}

/** Each forbidden reference found in `text`. */
export function forbiddenRefs(text: string): string[] {
  const lower = text.toLowerCase();
  return FORBIDDEN_REFERENCES.filter((ref) => lower.includes(ref));
}

function matches(text: string, re: RegExp): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(re)) out.push(m[1]);
  return out;
}

/** Pass/warn/fail on the total size for a target. */
export function sizeVerdict(target: PortalTarget, totalBytes: number): { error: string | null; warning: string | null } {
  const limit = SIZE_LIMITS[target];
  const over =
    limit.failBytes !== null &&
    (limit.failInclusive ? totalBytes >= limit.failBytes : totalBytes > limit.failBytes);
  const error = over
    ? `total size ${formatMB(totalBytes)} is ${limit.failInclusive ? "at or over" : "over"} the ${target} limit of ${formatMB(limit.failBytes ?? 0)}`
    : null;
  const warning =
    !over && limit.warnBytes !== null && totalBytes > limit.warnBytes
      ? `total size ${formatMB(totalBytes)} is over ${formatMB(limit.warnBytes)}: ${limit.warnReason ?? "consider trimming"}`
      : null;
  return { error, warning };
}

export function formatMB(bytes: number): string {
  return `${(bytes / MB).toFixed(2)} MB`;
}

export interface DistReport {
  files: number;
  totalBytes: number;
  errors: string[];
  warnings: string[];
}

/** Every check that does not need the zip itself. */
export function checkPortalDist(dir: string, target: PortalTarget): DistReport {
  const report: DistReport = { files: 0, totalBytes: 0, errors: [], warnings: [] };
  if (!existsSync(dir) || !statSync(dir).isDirectory()) {
    report.errors.push(`build folder ${dir} does not exist`);
    return report;
  }
  if (!existsSync(path.join(dir, "index.html"))) {
    report.errors.push("index.html is not at the root of the build");
  }
  for (const file of walk(dir)) {
    const rel = path.relative(dir, file).split(path.sep).join("/");
    report.files += 1;
    report.totalBytes += statSync(file).size;
    const ext = path.extname(file).toLowerCase();
    if (!TEXT_EXTENSIONS.has(ext)) continue;
    const text = readFileSync(file, "utf8");
    for (const ref of forbiddenRefs(text)) report.errors.push(`${rel} references ${ref}`);
    const absolute =
      ext === ".html" || ext === ".htm"
        ? absoluteHtmlRefs(text)
        : ext === ".css"
          ? absoluteCssRefs(text)
          : ext === ".js" || ext === ".mjs" || ext === ".cjs"
            ? absoluteJsRefs(text)
            : [];
    for (const ref of absolute) report.errors.push(`${rel} has a root-absolute asset URL ${ref} (must be relative)`);
  }
  if (report.files > MAX_FILES) report.errors.push(`${report.files} files is over the ${MAX_FILES}-file limit`);
  const size = sizeVerdict(target, report.totalBytes);
  if (size.error) report.errors.push(size.error);
  if (size.warning) report.warnings.push(size.warning);
  return report;
}

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else if (entry.isFile()) out.push(full);
  }
  return out;
}

/** Names inside a zip, one per entry. */
export function zipEntries(zipPath: string): string[] {
  const res = spawnSync("zipinfo", ["-1", zipPath], { encoding: "utf8" });
  if (res.status !== 0) throw new Error(`zipinfo failed on ${zipPath}: ${res.stderr}`);
  return res.stdout.split("\n").filter((line) => line.length > 0);
}

/** Zip `dir`'s contents (not the folder itself) into `zipPath`; returns the zip's size. */
export function zipDist(dir: string, zipPath: string): number {
  rmSync(zipPath, { force: true });
  mkdirSync(path.dirname(zipPath), { recursive: true });
  const res = spawnSync("zip", ["-r", "-X", "-q", zipPath, "."], { cwd: dir, encoding: "utf8" });
  if (res.status !== 0) throw new Error(`zip failed (${res.status}): ${res.stderr}`);
  if (!zipEntries(zipPath).includes("index.html")) {
    rmSync(zipPath, { force: true });
    throw new Error("index.html is not at the root of the zip");
  }
  return statSync(zipPath).size;
}

function main(): number {
  const target = parsePortalTarget(process.argv[2]);
  if (!target) {
    console.error(`Usage: pnpm portal:package <${PORTAL_TARGETS.join("|")}>`);
    return 2;
  }
  const appDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const zipPath = path.join(appDir, "mobile", "dist-zips", `${target}.zip`);
  // A failed run must not leave an older, passing zip behind to be uploaded.
  rmSync(zipPath, { force: true });
  const build = spawnSync("pnpm", ["exec", "vite", "build", "--config", "mobile/vite.config.mts", "--mode", target], {
    cwd: appDir,
    stdio: "inherit",
  });
  if (build.status !== 0) {
    console.error(`portal:package ${target}: vite build failed`);
    return 1;
  }
  const dist = path.join(appDir, "mobile", `dist-${target}`);
  const report = checkPortalDist(dist, target);
  console.log(`\nportal:package ${target}: ${report.files} files, ${formatMB(report.totalBytes)} uncompressed`);
  for (const w of report.warnings) console.warn(`  warning: ${w}`);
  if (report.errors.length > 0) {
    for (const e of report.errors) console.error(`  error: ${e}`);
    console.error(`portal:package ${target}: FAILED (${report.errors.length} problem${report.errors.length === 1 ? "" : "s"})`);
    return 1;
  }
  try {
    const zipBytes = zipDist(dist, zipPath);
    console.log(`portal:package ${target}: wrote ${path.relative(appDir, zipPath)} (${formatMB(zipBytes)})`);
  } catch (err) {
    console.error(`portal:package ${target}: ${err instanceof Error ? err.message : String(err)}`);
    return 1;
  }
  return 0;
}

if (process.argv[1]?.endsWith("packagePortal.ts")) {
  process.exitCode = main();
}
