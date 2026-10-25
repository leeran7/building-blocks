/**
 * The baseline is the ratchet: tests/ux/baseline.json allows, per surface and
 * viewport, the number of findings of each rule that main had when the checks
 * landed. A page may get better, never worse. Each fix PR lowers its counts
 * with `pnpm ux:baseline`, so the file shows how far each page is from 8/10.
 *
 * Every run also writes what it saw to test-results/ux/observed/, which
 * `pnpm ux:baseline` folds back into the baseline.
 */

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export type Baseline = Record<string, Record<string, number>>;

export const BASELINE_PATH = join(process.cwd(), "tests/ux/baseline.json");
export const OBSERVED_DIR = join(process.cwd(), "test-results/ux/observed");

export function baselineKey(project: string, surfaceId: string): string {
  return `${project}|${surfaceId}`;
}

export function readBaseline(): Baseline {
  try {
    return JSON.parse(readFileSync(BASELINE_PATH, "utf8")) as Baseline;
  } catch {
    return {};
  }
}

export function writeObserved(key: string, counts: Record<string, number>): void {
  mkdirSync(OBSERVED_DIR, { recursive: true });
  writeFileSync(join(OBSERVED_DIR, `${key.replace(/[^a-z0-9-]+/gi, "__")}.json`), JSON.stringify({ key, counts }, null, 2));
}
