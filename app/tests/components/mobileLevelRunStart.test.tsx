/**
 * A level run's start: every power-up the ticket grants (a free one and a
 * booster) goes to the engine and is named before GO, and a booster the
 * server kept (the free power-up is its type) is explained. LevelRun renders
 * for real; the engine hook, canvas and HUD are stood in.
 *
 * @vitest-environment happy-dom
 */

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("../../mobile/src/lib/haptics", () => ({
  tapLight: vi.fn(async () => {}),
  tapMedium: vi.fn(async () => {}),
  tapHeavy: vi.fn(async () => {}),
  notifySuccess: vi.fn(async () => {}),
  notifyError: vi.fn(async () => {}),
}));
vi.mock("../../mobile/src/lib/useGameHaptics", () => ({ useGameHaptics: () => {} }));
vi.mock("../../mobile/src/contexts/AppDataContext", () => ({ useSettings: () => ({ data: null }) }));

const climb = vi.hoisted(() => ({ opts: [] as Array<Record<string, unknown>> }));
vi.mock("../../src/game/useClimb", async () => {
  const { createMatch } = await import("../../src/game/simulation");
  const { buildFreeTower } = await import("../../src/game/freeStack");
  return {
    useClimb: (opts: Record<string, unknown>) => {
      climb.opts.push(opts);
      const state = createMatch({ seed: "s", mode: "solo", tower: buildFreeTower(), playerIds: ["you"] });
      state.phase = "lobby";
      return {
        state,
        simRef: { current: state },
        renderFeed: {},
        start: () => {},
        finished: false,
        setTouch: () => {},
        runId: 1,
        inputLog: [],
      };
    },
  };
});
vi.mock("../../src/components/Game/ClimbCanvas", () => ({ ClimbCanvas: () => null }));
vi.mock("../../src/components/Game/ExpeditionHud", () => ({ ExpeditionHud: () => null }));
vi.mock("../../src/components/Game/TouchControls", () => ({
  TouchControls: () => null,
  useTouchControlsInset: () => 0,
}));
vi.mock("../../src/components/Game/usePowerUpFeedback", () => ({
  usePowerUpFeedback: () => ({ muted: false, setMuted: () => {}, announcement: null, unlockAudio: () => {} }),
}));
vi.mock("../../src/hooks/useCanvasSize", () => ({ useCanvasSize: () => ({ width: 390, height: 780 }) }));
vi.mock("../../src/hooks/useSafeAreaInsets", () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));

import { LevelRun } from "../../mobile/src/components/levels/LevelRun";
import type { StartPowerUp } from "../../src/levels/engagement";

function lobby(startPowerUps: StartPowerUp[], boosterKept: StartPowerUp["type"] | null = null): string {
  climb.opts = [];
  return renderToStaticMarkup(
    createElement(LevelRun, {
      level: 12,
      seed: "s1:level:12:0",
      goalFt: 300,
      pars: { twoStarMs: 36_000, threeStarMs: 28_000, oneStarMs: null },
      practice: false,
      autoStart: false,
      paused: false,
      onEnd: () => {},
      onQuit: () => {},
      startPowerUps,
      boosterKept,
    }),
  )
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ");
}

describe("level run start power-ups", () => {
  it("hands the free power-up and the booster to the engine and names both before GO", () => {
    const text = lobby([
      { type: "rapid-climb", source: "streak" },
      { type: "super-jump", source: "booster" },
    ]);
    expect(climb.opts.at(-1)?.startPowerUps).toEqual(["rapid-climb", "super-jump"]);
    expect(text).toContain("You start with Rapid Climb and Super Jump at GO.");
    expect(text).not.toContain("was kept");
  });

  it("hands the engine nothing when the ticket grants nothing", () => {
    const text = lobby([]);
    expect(climb.opts.at(-1)).not.toHaveProperty("startPowerUps");
    expect(text).not.toContain("You start with");
  });

  it("says a booster of the free power-up's type was kept", () => {
    const text = lobby([{ type: "rapid-climb", source: "streak" }], "rapid-climb");
    expect(climb.opts.at(-1)?.startPowerUps).toEqual(["rapid-climb"]);
    expect(text).toContain("You start with Rapid Climb at GO.");
    expect(text).toContain("Your Rapid Climb booster was kept: this run already starts with it.");
  });
});
