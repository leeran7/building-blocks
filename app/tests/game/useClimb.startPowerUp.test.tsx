/**
 * useClimb hands a level ticket's start power-up to the engine (§6.3, §5c):
 * the match it builds carries it, so the engine grants it at GO.
 *
 * @vitest-environment happy-dom
 */

import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it } from "vitest";

import { useClimb } from "../../src/game/useClimb";
import type { MatchState } from "../../src/game/types";
import { levelRunSetup } from "../../mobile/src/lib/levels/catalog";

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

function mount(opts: Parameters<typeof useClimb>[0]): MatchState {
  let seen: MatchState | null = null;
  function Probe() {
    seen = useClimb(opts).state;
    return null;
  }
  const el = document.createElement("div");
  const root = createRoot(el);
  act(() => root.render(<Probe />));
  act(() => root.unmount());
  if (!seen) throw new Error("useClimb did not render");
  return seen;
}

describe("useClimb startPowerUp", () => {
  const setup = levelRunSetup(12);

  it("builds the match with the ticket's power-up", () => {
    const state = mount({ tower: setup.tower, seed: "s1:level:12:0", hazard: setup.hazard, startPowerUp: "super-jump" });
    expect(state.startPowerUp).toBe("super-jump");
  });

  it("builds a plain match without one", () => {
    const state = mount({ tower: setup.tower, seed: "s1:level:12:0", hazard: setup.hazard });
    expect(state.startPowerUp).toBeUndefined();
  });
});
