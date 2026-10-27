/**
 * `pnpm ux:baseline`: folds the counts the last `pnpm ux` run saw
 * (test-results/ux/observed/) into tests/ux/baseline.json. Surfaces the run
 * did not visit keep their entries. Counts may only go down: a raise is
 * refused unless `--allow-raise` is passed (for a new surface or a reviewed
 * exception, explained in the PR).
 */

import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const observedDir = join(process.cwd(), "test-results/ux/observed");
const baselinePath = join(process.cwd(), "tests/ux/baseline.json");

let baseline = {};
try {
  baseline = JSON.parse(readFileSync(baselinePath, "utf8"));
} catch {
  // First run: start from an empty baseline.
}

let files = [];
try {
  files = readdirSync(observedDir).filter((f) => f.endsWith(".json"));
} catch {
  console.error("No observed counts. Run pnpm ux first.");
  process.exit(1);
}
if (files.length === 0) {
  console.error("No observed counts. Run pnpm ux first.");
  process.exit(1);
}

const allowRaise = process.argv.includes("--allow-raise");
const raised = [];
for (const file of files) {
  const { key, counts } = JSON.parse(readFileSync(join(observedDir, file), "utf8"));
  const kept = Object.fromEntries(Object.entries(counts).filter(([, n]) => n > 0).sort(([a], [b]) => a.localeCompare(b)));
  for (const [rule, n] of Object.entries(kept)) {
    const before = baseline[key]?.[rule] ?? 0;
    if (n > before) raised.push(`${key} ${rule}: ${before} -> ${n}`);
  }
  if (Object.keys(kept).length > 0) baseline[key] = kept;
  else delete baseline[key];
}

if (raised.length > 0 && !allowRaise) {
  console.error(`Refusing to raise the baseline (fix these, or pass --allow-raise for a new surface or a flow that now reaches its goal):\n${raised.join("\n")}`);
  process.exit(1);
}

const sorted = Object.fromEntries(Object.entries(baseline).sort(([a], [b]) => a.localeCompare(b)));
writeFileSync(baselinePath, `${JSON.stringify(sorted, null, 2)}\n`);
console.log(`Updated ${files.length} surfaces in tests/ux/baseline.json`);
