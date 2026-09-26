/**
 * Climb beats walk: with Up held, a climber walking at a ladder grabs it on
 * the tick it comes into reach instead of walking past. The joystick relies
 * on this — its wide Up cone presses Up alongside Left/Right, and this is
 * what turns that into "stop and climb".
 */

import { describe, it, expect } from "vitest";
import {
  createMatch,
  stepMatch,
  DEFAULT_SIM_CONFIG,
  type SimConfig,
} from "../../src/game/simulation";
import type { PlayerInput, TowerSpec } from "../../src/game/types";
import { DEFAULT_HAZARD_CONFIG } from "../../src/game/hazard";
import { buildTower, ladderForFloor } from "../../src/game/towers";

const SLOW: SimConfig = {
  ...DEFAULT_SIM_CONFIG,
  hazard: { ...DEFAULT_HAZARD_CONFIG, speedScale: 0.001 },
};

function walkAt(tower: TowerSpec, input: PlayerInput, ticks: number) {
  const l0 = ladderForFloor(tower, 0);
  const m = createMatch({ seed: "ladder-precedence", mode: "solo", tower, playerIds: ["p1"] });
  m.phase = "climb";
  m.tick = 0;
  const p = m.players[0]!;
  p.x = l0.x - (tower.ladderGrabRadius + 2); // just out of reach, to the left
  p.y = 0;
  p.onGround = true;
  let grabbedAt: number | null = null;
  let passed = false;
  for (let t = 0; t < ticks; t++) {
    stepMatch(m, { p1: input }, SLOW);
    if (p.onLadder && grabbedAt === null) grabbedAt = p.x;
    if (!p.onLadder && p.x > l0.x + tower.ladderGrabRadius) passed = true;
  }
  return { l0, grabbedAt, passed };
}

const RIGHT_UP: PlayerInput = { moveX: 1, jump: false, climbY: 1, usePowerUp: false };
const RIGHT: PlayerInput = { moveX: 1, jump: false, climbY: 0, usePowerUp: false };

describe("ladder precedence", () => {
  it("grabs the ladder instead of walking past when Up is held with Right", () => {
    const tower = buildTower("indie-games");
    const { l0, grabbedAt, passed } = walkAt(tower, RIGHT_UP, 30);
    expect(grabbedAt).toBe(l0.x);
    expect(passed).toBe(false);
  });

  it("walks past the same ladder when only Right is held", () => {
    const tower = buildTower("indie-games");
    const { grabbedAt, passed } = walkAt(tower, RIGHT, 30);
    expect(grabbedAt).toBeNull();
    expect(passed).toBe(true);
  });

  it("still grabs at the fastest walk speed (no stepping over the reach)", () => {
    // Sprint burst is 1.5x; 2x leaves margin. Per-tick step stays well under
    // the 2 × grab-radius window, so a held Up cannot tunnel past a ladder.
    const base = buildTower("indie-games");
    const tower = { ...base, moveSpeed: base.moveSpeed * 2 };
    const { l0, grabbedAt, passed } = walkAt(tower, RIGHT_UP, 30);
    expect(grabbedAt).toBe(l0.x);
    expect(passed).toBe(false);
  });
});
