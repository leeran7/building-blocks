/**
 * A flow tapped through the way a player would. It counts taps and records
 * three problems:
 *   - dead-end: the goal was never reached;
 *   - blocked-tap: a control on the way is on screen but covered, so it can't be tapped;
 *   - broken-promise: copy on the way promised something the next page refused.
 * Taps only count when the goal was reached, so a broken flow can't look short.
 */

import type { Locator, Page } from "@playwright/test";

export type FlowProblem = "dead-end" | "blocked-tap" | "broken-promise";

export class Flow {
  taps = 0;
  readonly problems = new Set<FlowProblem>();
  constructor(readonly page: Page, readonly settle = 900) {}

  /** Taps `target`; a control that can't be tapped within 5 s is a blocked tap. */
  async tap(target: Locator): Promise<boolean> {
    const ok = await target.first().click({ timeout: 5000 }).then(() => true, () => false);
    if (!ok) {
      this.flag("blocked-tap");
      return false;
    }
    this.taps += 1;
    await this.page.waitForTimeout(this.settle);
    return true;
  }

  /** Taps the first of `targets` that is visible now; false when none is, or it can't be tapped. */
  async tapAny(targets: Locator[]): Promise<boolean> {
    for (const t of targets) {
      if (await t.first().isVisible().catch(() => false)) return this.tap(t);
    }
    return false;
  }

  flag(problem: FlowProblem): void {
    this.problems.add(problem);
  }

  /** Waits for `goal`, a visible element or a condition; a dead end when it never comes. */
  async reached(goal: Locator | (() => Promise<boolean>), timeout = 8000): Promise<boolean> {
    let ok: boolean;
    if (typeof goal === "function") {
      const until = Date.now() + timeout;
      ok = await goal().catch(() => false);
      while (!ok && Date.now() < until) {
        await this.page.waitForTimeout(250);
        ok = await goal().catch(() => false);
      }
    } else {
      ok = await goal.first().waitFor({ state: "visible", timeout }).then(() => true, () => false);
    }
    if (!ok) this.flag("dead-end");
    return ok;
  }

  /** The measured result: taps (null when the goal was not reached) and the problems, sorted. */
  result(): { taps: number | null; problems: FlowProblem[] } {
    return { taps: this.problems.has("dead-end") ? null : this.taps, problems: [...this.problems].sort() };
  }
}
