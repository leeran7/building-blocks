/**
 * Independent-sim netcode invariants (useRace / stepMatch).
 *
 * Regression for the "both characters move together" bug: it happened because
 * stepMatch keyed input by player id, so two players sharing an id (same-account
 * testing) both read one input entry. Input is now slot-keyed (id kept as a
 * fallback for the many solo/test callers), and the client integrates only its
 * own slot via `localSlot`.
 */

import { describe, it, expect } from "vitest";
import {
  createMatch,
  stepMatch,
  DEFAULT_SIM_CONFIG,
  SimConfig,
} from "../../src/game/simulation";
import { DEFAULT_HAZARD_CONFIG } from "../../src/game/hazard";
import { buildTower } from "../../src/game/towers";
import { PlayerInput } from "../../src/game/types";

const SLUG = "indie-games";
const SEED = "race-netcode-seed";

// Horizontal moves work on the base platform (no ladder needed), so they're the
// cleanest way to prove input routing. Spawns are at 0.3w (slot 0) and 0.7w
// (slot 1), so RIGHT/LEFT move both toward centre — no cylinder wrap.
const RIGHT: PlayerInput = { moveX: 1, jump: false, climbY: 0, usePowerUp: false };
const LEFT: PlayerInput = { moveX: -1, jump: false, climbY: 0, usePowerUp: false };

/** Hazard effectively frozen — the climb is undisturbed for thousands of ticks. */
const SLOW: SimConfig = {
  ...DEFAULT_SIM_CONFIG,
  hazard: { ...DEFAULT_HAZARD_CONFIG, speedScale: 0.0001 },
};
/** Hazard rises fast enough to eliminate any integrated idle player quickly. */
const FAST: SimConfig = {
  ...DEFAULT_SIM_CONFIG,
  hazard: { ...DEFAULT_HAZARD_CONFIG, speedScale: 2_000_000, graceSeconds: 0 },
};

function makeClimbMatch(playerIds: string[]) {
  const tower = buildTower(SLUG, { runSeed: SEED });
  const m = createMatch({ seed: SEED, mode: "multiplayer", tower, playerIds });
  while (m.phase === "countdown") stepMatch(m, {}, SLOW); // drain the locked countdown
  return m;
}

describe("slot-keyed input", () => {
  it("two players sharing an id diverge under different per-slot inputs (the both-move bug)", () => {
    const m = makeClimbMatch(["same", "same"]);
    expect(m.players).toHaveLength(2);
    expect(m.players[0].id).toBe(m.players[1].id); // the collision condition

    const x0 = m.players[0].x;
    const x1 = m.players[1].x;
    for (let i = 0; i < 8; i++) {
      stepMatch(m, { 0: RIGHT, 1: LEFT }, SLOW); // opposite inputs per slot
    }

    // Each same-id player followed its OWN slot's input in opposite directions.
    // Before the fix both read the single id entry and moved identically.
    expect(m.players[0].x).toBeGreaterThan(x0);
    expect(m.players[1].x).toBeLessThan(x1);
  });

  it("still honors id-keyed input for distinct ids (backward compatibility)", () => {
    const m = makeClimbMatch(["alice", "bob"]);
    const x0 = m.players[0].x;
    const x1 = m.players[1].x;

    for (let i = 0; i < 8; i++) {
      stepMatch(m, { alice: RIGHT }, SLOW); // id-keyed, as all existing callers do
    }

    expect(m.players[0].x).toBeGreaterThan(x0); // alice (slot 0) moved
    expect(m.players[1].x).toBe(x1); // bob idle
  });
});

describe("localSlot (independent-sim client mode)", () => {
  it("integrates only the local slot; peers are left untouched for ghost slaving", () => {
    const m = makeClimbMatch(["a", "b"]);
    const startPeerY = m.players[1].y;

    // Even under a fast-rising hazard, the non-local peer is never integrated
    // and so never falsely moves or gets eliminated locally — its state belongs
    // to incoming ghost snapshots, not this client's sim.
    const startPeerX = m.players[1].x;
    for (let i = 0; i < 200 && m.phase === "climb"; i++) {
      stepMatch(m, { 0: RIGHT }, FAST, { localSlot: 0 });
    }

    expect(m.players[1].y).toBe(startPeerY);
    expect(m.players[1].x).toBe(startPeerX);
    expect(m.players[1].status).toBe("climbing");
  });
});
