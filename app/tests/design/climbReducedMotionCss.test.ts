/**
 * AC-12 — prefers-reduced-motion must disable climb-fork animations.
 * Parses production globals.css with PostCSS (structured stylesheet contract),
 * not a source-text substring grep of component TS.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import postcss, { type AtRule, type Rule } from "postcss";
import { describe, expect, it } from "vitest";

const GLOBALS = resolve(__dirname, "../../app/globals.css");

const REQUIRED_DISABLED = [
  ".reveal",
  ".climb-reveal",
  ".animate-enter",
  ".animate-climbEnter",
  ".animate-climb",
  ".animate-climbPunch",
  ".animate-groundRise",
  ".animate-climbGroundRise",
  ".animate-marquee",
] as const;

function selectorsDisabledUnderReducedMotion(css: string): Set<string> {
  const root = postcss.parse(css);
  const disabled = new Set<string>();
  root.walkAtRules("media", (at: AtRule) => {
    if (!/prefers-reduced-motion:\s*reduce/.test(at.params)) return;
    at.walkRules((rule: Rule) => {
      const anim = rule.nodes?.find(
        (n) => n.type === "decl" && (n as postcss.Declaration).prop === "animation"
      ) as postcss.Declaration | undefined;
      if (!anim) return;
      if (!/none/i.test(anim.value)) return;
      for (const sel of rule.selectors) {
        disabled.add(sel.trim());
      }
    });
  });
  return disabled;
}

describe("globals.css reduced-motion contract (AC-12)", () => {
  it("disables reveal/enter/climb forks and marquee under prefers-reduced-motion", () => {
    const css = readFileSync(GLOBALS, "utf8");
    const disabled = selectorsDisabledUnderReducedMotion(css);
    for (const sel of REQUIRED_DISABLED) {
      expect(disabled.has(sel), `${sel} must set animation: none`).toBe(true);
    }
  });
});
