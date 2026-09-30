/**
 * The purchase payoff (RewardReveal.tsx), rendered for real: the build-up,
 * the burst and the reveal on fake timers, with haptics and the
 * reduced-motion query mocked.
 *
 * @vitest-environment happy-dom
 */

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

const haptics = vi.hoisted(() => ({
  tapLight: vi.fn(async () => {}),
  tapMedium: vi.fn(async () => {}),
  tapHeavy: vi.fn(async () => {}),
  notifySuccess: vi.fn(async () => {}),
  notifyError: vi.fn(async () => {}),
}));
vi.mock("../../mobile/src/lib/haptics", () => haptics);
const motion = vi.hoisted(() => ({ reduce: false }));
vi.mock("../../mobile/src/lib/motion", () => ({ prefersReducedMotion: () => motion.reduce }));

import {
  REVEAL_BURST_MS,
  REVEAL_CHARGE_MS,
  REVEAL_SPARKS,
  RewardReveal,
  revealSparkOffset,
  type RewardRevealProps,
} from "../../mobile/src/components/RewardReveal";

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  vi.useFakeTimers();
  motion.reduce = false;
  for (const f of Object.values(haptics)) f.mockClear();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.useRealTimers();
});

function render(extra: Partial<RewardRevealProps> = {}) {
  const onDone = vi.fn();
  act(() =>
    root.render(
      createElement(RewardReveal, {
        subject: createElement("span", { "data-prize": "" }, "prize"),
        eyebrow: "New skin unlocked",
        title: "Void Kestrel",
        detail: "Equipped. Your next climb wears it.",
        spent: 1200,
        onDone,
        ...extra,
      }),
    ),
  );
  return onDone;
}

const phase = () => document.querySelector("[data-reward-phase]")?.getAttribute("data-reward-phase");
const advance = (ms: number) => act(() => vi.advanceTimersByTime(ms));
const done = () => [...document.body.querySelectorAll("button")].find((b) => b.textContent === "Continue");
const status = () => document.body.querySelector('[role="status"]')?.textContent;

describe("purchase reveal", () => {
  it("builds in three harder beats, bursts, then reveals the prize and waits for Continue", () => {
    const onDone = render();
    expect(phase()).toBe("charge");
    // The prize waits as a silhouette, the price draining away, nothing named yet.
    expect(document.body.querySelector(".rr-silhouette:not(.rr-lit) [data-prize]")).not.toBeNull();
    expect(document.body.textContent).toContain("−1,200");
    expect(document.body.textContent).toContain("Unlocking…");
    expect(document.body.textContent).not.toContain("Void Kestrel");
    expect(done()).toBeUndefined();
    expect(status()).toBe("");
    expect(haptics.tapLight).toHaveBeenCalledTimes(1);
    expect(document.body.querySelector(".rr-beat-1")).not.toBeNull();

    advance(REVEAL_CHARGE_MS / 3);
    expect(document.body.querySelector(".rr-beat-2")).not.toBeNull();
    expect(haptics.tapMedium).toHaveBeenCalledTimes(1);
    advance(REVEAL_CHARGE_MS / 3);
    expect(document.body.querySelector(".rr-beat-3")).not.toBeNull();
    expect(haptics.tapHeavy).toHaveBeenCalledTimes(1);
    expect(haptics.notifySuccess).not.toHaveBeenCalled();

    advance(REVEAL_CHARGE_MS / 3);
    expect(phase()).toBe("burst");
    expect(haptics.notifySuccess).toHaveBeenCalledTimes(1);
    expect(document.body.querySelectorAll(".rr-spark")).toHaveLength(REVEAL_SPARKS);
    expect(document.body.querySelector(".rr-flash")).not.toBeNull();
    expect(document.body.querySelector(".rr-lit [data-prize]")).not.toBeNull();
    expect(document.body.textContent).toContain("Void Kestrel");

    advance(REVEAL_BURST_MS);
    expect(phase()).toBe("shown");
    expect(document.body.querySelectorAll(".rr-spark, .rr-flash")).toHaveLength(0);
    expect(status()).toBe("New skin unlocked: Void Kestrel");
    expect(document.body.textContent).toContain("Equipped. Your next climb wears it.");
    expect(document.activeElement).toBe(done());
    expect(vi.getTimerCount()).toBe(0);

    act(() => done()?.click());
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it("jumps from the build-up to the burst on a tap, with no stray timers", () => {
    render();
    act(() => (document.querySelector("[data-reward-phase]") as HTMLElement).click());
    expect(phase()).toBe("burst");
    expect(haptics.tapHeavy).not.toHaveBeenCalled();
    advance(REVEAL_BURST_MS);
    expect(phase()).toBe("shown");
    expect(vi.getTimerCount()).toBe(0);
  });

  it("with reduced motion opens straight on the reveal with the final number", () => {
    motion.reduce = true;
    render({ spent: null, countUp: { from: 250, to: 1450, suffix: "gems" } });
    expect(phase()).toBe("shown");
    expect(document.body.querySelector(".rr-mote, .rr-spark, .rr-flash, .rr-drain")).toBeNull();
    expect(document.body.textContent).toContain("1,450 gems");
    expect(haptics.notifySuccess).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("throws its sparks evenly by index, without Math.random", () => {
    const random = vi.spyOn(Math, "random");
    const all = Array.from({ length: REVEAL_SPARKS }, (_, i) => revealSparkOffset(i));
    expect(new Set(all.map((o) => `${o.dx},${o.dy}`)).size).toBe(REVEAL_SPARKS);
    render();
    advance(REVEAL_CHARGE_MS);
    const drawn = [...document.body.querySelectorAll<HTMLElement>(".rr-spark")].map((s) => ({
      dx: Number.parseInt(s.style.getPropertyValue("--dx"), 10),
      dy: Number.parseInt(s.style.getPropertyValue("--dy"), 10),
    }));
    expect(drawn).toEqual(all);
    expect(random).not.toHaveBeenCalled();
    random.mockRestore();
  });
});
