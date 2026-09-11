/**
 * AC-17 / OQ-3 — shared ASCENT motion baselines stay frozen; climb forks amplify.
 * Asserts against the live production animation source. That source moved from
 * tailwind.config.ts to the `@theme` block in app/globals.css when the project
 * migrated to Tailwind v4 (CSS-first config), so we parse the CSS here.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  CLIMB_ENTER_DURATION_S,
  CLIMB_ENTER_TRANSLATE_Y_PX,
  CLIMB_GROUND_RISE_AMP_PERCENT,
  CLIMB_GROUND_RISE_DURATION_S,
  CLIMB_PUNCH_DURATION_S,
  CLIMB_PUNCH_TRANSLATE_Y_PX,
  POWER_UP_ENTER_DURATION_S,
  POWER_UP_ENTER_SCALE_FROM,
  POWER_UP_ENTER_SCALE_PEAK,
  POWER_UP_URGENT_DURATION_S,
  POWER_UP_URGENT_SCALE_PEAK,
} from "../../src/design/climbFeelTokens";

type Frame = { transform?: string; opacity?: string };

const css = readFileSync(
  resolve(dirname(fileURLToPath(import.meta.url)), "../../app/globals.css"),
  "utf8"
);

// animation[name] = the `--animate-<name>` value (e.g. "enter 0.7s cubic-bezier(...)").
const animation: Record<string, string> = {};
for (const m of css.matchAll(/--animate-(\w+):\s*([^;]+);/g)) {
  animation[m[1]] = m[2].replace(/\s+/g, " ").trim();
}

// keyframes[name][step] = { transform?, opacity? }. The block regex allows one
// level of nested braces (the step blocks); selectors like `0%,\n 100%` are
// normalised to the canonical "0%, 100%" key the assertions use.
const keyframes: Record<string, Record<string, Frame>> = {};
for (const block of css.matchAll(/@keyframes\s+(\w+)\s*\{((?:[^{}]|\{[^}]*\})*)\}/g)) {
  const steps: Record<string, Frame> = {};
  for (const step of block[2].matchAll(/([^{}]+?)\s*\{([^}]*)\}/g)) {
    const selector = step[1].split(",").map((s) => s.trim()).filter(Boolean).join(", ");
    const frame: Frame = {};
    const t = step[2].match(/transform:\s*([^;]+);/);
    const o = step[2].match(/opacity:\s*([^;]+);/);
    if (t) frame.transform = t[1].trim();
    if (o) frame.opacity = o[1].trim();
    steps[selector] = frame;
  }
  keyframes[block[1]] = steps;
}

function translateYPx(frame: { transform?: string } | undefined): number {
  const m = frame?.transform?.match(/translateY\(([-\d.]+)px\)/);
  if (!m) throw new Error(`expected translateY(px) in ${JSON.stringify(frame)}`);
  return Number(m[1]);
}

function translateYPercent(frame: { transform?: string } | undefined): number {
  const m = frame?.transform?.match(/translateY\(([-\d.]+)%\)/);
  if (!m) throw new Error(`expected translateY(%) in ${JSON.stringify(frame)}`);
  return Number(m[1]);
}

function durationSeconds(anim: string): number {
  const m = anim.match(/(\d+(?:\.\d+)?)s/);
  if (!m) throw new Error(`expected duration in ${anim}`);
  return Number(m[1]);
}

describe("ASCENT shared baselines remain unamplified (OQ-3 / R8)", () => {
  it("enter keyframe travel stays 16px and duration 0.7s", () => {
    expect(translateYPx(keyframes.enter["0%"])).toBe(16);
    expect(durationSeconds(animation.enter)).toBe(0.7);
  });

  it("climb keyframe travel stays 6px and duration 0.8s", () => {
    expect(translateYPx(keyframes.climb["0%"])).toBe(6);
    expect(durationSeconds(animation.climb)).toBe(0.8);
  });

  it("groundRise period stays 6s with 4% amplitude", () => {
    expect(durationSeconds(animation.groundRise)).toBe(6);
    expect(translateYPercent(keyframes.groundRise["0%, 100%"])).toBe(4);
  });
});

describe("Climb forks wire to climbFeelTokens (AC-17)", () => {
  it("climbEnter matches token travel and duration", () => {
    expect(translateYPx(keyframes.climbEnter["0%"])).toBe(CLIMB_ENTER_TRANSLATE_Y_PX);
    expect(durationSeconds(animation.climbEnter)).toBe(CLIMB_ENTER_DURATION_S);
  });

  it("climbPunch matches token travel and duration", () => {
    expect(translateYPx(keyframes.climbPunch["0%"])).toBe(CLIMB_PUNCH_TRANSLATE_Y_PX);
    expect(durationSeconds(animation.climbPunch)).toBe(CLIMB_PUNCH_DURATION_S);
  });

  it("climbGroundRise matches token period and amplitude", () => {
    expect(durationSeconds(animation.climbGroundRise)).toBe(CLIMB_GROUND_RISE_DURATION_S);
    expect(translateYPercent(keyframes.climbGroundRise["0%, 100%"])).toBe(
      CLIMB_GROUND_RISE_AMP_PERCENT
    );
  });

  it("power-up HUD keyframes match tuned token scales/durations", () => {
    expect(durationSeconds(animation.powerUpEnter)).toBe(POWER_UP_ENTER_DURATION_S);
    expect(durationSeconds(animation.powerUpUrgent)).toBe(POWER_UP_URGENT_DURATION_S);
    expect(keyframes.powerUpEnter["0%"].transform).toBe(
      `scale(${POWER_UP_ENTER_SCALE_FROM})`
    );
    expect(keyframes.powerUpEnter["55%"].transform).toBe(
      `scale(${POWER_UP_ENTER_SCALE_PEAK})`
    );
    expect(keyframes.powerUpUrgent["50%"].transform).toBe(
      `scale(${POWER_UP_URGENT_SCALE_PEAK})`
    );
  });
});
