import { rmSync } from "node:fs";
import { OBSERVED_DIR } from "./lib/baseline";

/** Clears the last run's observed counts, so `pnpm ux:baseline` only folds in this run. */
export default function globalSetup(): void {
  rmSync(OBSERVED_DIR, { recursive: true, force: true });
}
