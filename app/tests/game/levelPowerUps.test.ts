/**
 * Level power-up rules: a level tower limits which types spawn
 * (`tower.allowedPowerUps`), forces its intro orb onto INTRO_POWER_UP_FLOOR
 * (`tower.introPowerUp`), and a level run can grant a booster at GO
 * (`createMatch({ startPowerUp })`). The free stack, Daily and duels set none
 * of these and are pinned bit-identical by freeStackGolden.test.ts.
 */

import { describe, expect, it } from "vitest";

import { createMatch, stepMatch, DEFAULT_SIM_CONFIG } from "../../src/game/simulation";
import { applyRunSeed } from "../../src/game/towers";
import {
  INTRO_POWER_UP_FLOOR,
  isPowerUpActive,
  powerUpForFloor,
  resolveRandom,
} from "../../src/game/powerups";
import { buildFreeTower } from "../../src/game/freeStack";
import type { MatchState, PowerUpPickup, PowerUpType, TowerSpec } from "../../src/game/types";

const FLOORS = 300;

function level(seed: string, fields: Partial<TowerSpec>): TowerSpec {
  return { ...applyRunSeed(buildFreeTower(), seed), powerUpChance: 0.5, ...fields };
}

function orbs(tower: TowerSpec): PowerUpPickup[] {
  const out: PowerUpPickup[] = [];
  for (let i = 0; i < FLOORS; i++) {
    const pu = powerUpForFloor(tower, i);
    if (pu) out.push(pu);
  }
  return out;
}

function startClimb(state: MatchState): MatchState {
  while (state.phase === "countdown") stepMatch(state, {}, DEFAULT_SIM_CONFIG);
  return state;
}

describe("allowed power-up set", () => {
  it("spawns only allowed types, on the same floors as the unrestricted tower", () => {
    // The unrestricted tower is generated first on the same seed, so a spawn
    // cache that ignored the set would hand the level these orbs.
    const open = orbs(level("allow-set", {}));
    expect(open.some((o) => o.type !== "rapid-climb" && o.type !== "sprint-burst")).toBe(true);

    const allowed: PowerUpType[] = ["rapid-climb", "sprint-burst"];
    const limited = orbs(level("allow-set", { allowedPowerUps: allowed }));
    expect(limited.length).toBeGreaterThan(20);
    for (const o of limited) expect(allowed).toContain(o.type);
    expect(new Set(limited.map((o) => o.type))).toEqual(new Set(allowed));
    expect(limited.map((o) => o.floorIndex)).toEqual(open.map((o) => o.floorIndex));
  });

  it("an empty set spawns no orbs", () => {
    expect(orbs(level("allow-none", {})).length).toBeGreaterThan(0);
    expect(orbs(level("allow-none", { allowedPowerUps: [] }))).toEqual([]);
  });

  it("rejects unknown types, duplicates and a random-only set", () => {
    // Each unknown type rides with a valid one, so only the type check can reject it.
    const bad: unknown[] = [
      ["giant", "teleport"],
      ["giant", "__proto__"],
      ["giant", "toString"],
      ["giant", "giant"],
      ["random"],
    ];
    for (const set of bad) {
      const t = level("allow-bad", { allowedPowerUps: set as PowerUpType[] });
      expect(() => orbs(t)).toThrow(RangeError);
    }
  });
});

describe("random orbs on a level", () => {
  it("roll only among the allowed concrete types", () => {
    const one = new Set<string>();
    const two = new Set<string>();
    const all = new Set<string>();
    for (let floor = 1; floor < 200; floor++) {
      for (const slot of [0, 1]) {
        one.add(resolveRandom("rnd", floor, slot, ["random", "giant"]));
        two.add(resolveRandom("rnd", floor, slot, ["random", "giant", "jetpack"]));
        all.add(resolveRandom("rnd", floor, slot));
      }
    }
    expect(all.size).toBe(7);
    expect(one).toEqual(new Set(["giant"]));
    expect(two).toEqual(new Set(["giant", "jetpack"]));
  });

  it("stepMatch passes the tower's set when a climber collects one", () => {
    const seed = "rnd-sim";
    const allowedPowerUps: PowerUpType[] = ["random", "super-jump"];
    const tower = level(seed, { allowedPowerUps });
    // Pick a random orb the unrestricted roll would NOT turn into super-jump.
    const orb = orbs(tower).find(
      (o) => o.type === "random" && resolveRandom(tower.seed, o.floorIndex, 0) !== "super-jump"
    );
    expect(orb).toBeDefined();

    const live = startClimb(createMatch({ seed, mode: "solo", tower, playerIds: ["p"] }));
    const p = live.players[0];
    live.powerUps = [{ ...orb! }];
    p.x = orb!.x;
    p.y = orb!.y - 1;
    p.peakY = p.y;
    p.vy = 0;
    p.onGround = false;
    stepMatch(live, {}, DEFAULT_SIM_CONFIG);
    expect(live.powerUps[0].collected).toBe(true);
    expect(p.lastPickupType).toBe("super-jump");
  });
});

describe("intro orb", () => {
  it(`is forced as the first orb, on floor ${INTRO_POWER_UP_FLOOR}`, () => {
    // Positive fixture: this seed's own first orb is somewhere else or another type.
    let seed = "";
    for (let k = 0; k < 50 && !seed; k++) {
      const first = orbs(level(`intro-${k}`, {}))[0];
      if (first.floorIndex !== INTRO_POWER_UP_FLOOR || first.type !== "giant") seed = `intro-${k}`;
    }
    expect(seed).not.toBe("");

    const t = level(seed, { allowedPowerUps: ["giant", "rapid-climb"], introPowerUp: "giant" });
    const list = orbs(t);
    expect(list[0].floorIndex).toBe(INTRO_POWER_UP_FLOOR);
    expect(list[0].type).toBe("giant");
    expect(list.length).toBeGreaterThan(20);
  });

  it("must be in the allowed set", () => {
    const t = level("intro-bad", { allowedPowerUps: ["rapid-climb"], introPowerUp: "giant" });
    expect(() => orbs(t)).toThrow(RangeError);
    const unknown = level("intro-bad", { introPowerUp: "teleport" as PowerUpType });
    expect(() => orbs(unknown)).toThrow(RangeError);
  });
});

describe("starting power-up", () => {
  const tower = level("booster", { allowedPowerUps: ["rapid-climb", "slow-lava"] });

  it("is live on every climber from GO", () => {
    const none = startClimb(createMatch({ seed: "b", mode: "solo", tower, playerIds: ["p"] }));
    expect(isPowerUpActive(none.players[0], "rapid-climb", 1)).toBe(false);

    const live = startClimb(
      createMatch({ seed: "b", mode: "multiplayer", tower, playerIds: ["p1", "p2"], startPowerUp: "rapid-climb" })
    );
    expect(live.tick).toBe(0);
    for (const p of live.players) {
      expect(isPowerUpActive(p, "rapid-climb", 1)).toBe(true);
      expect(p.activePowerUps[0].startTick).toBe(0);
    }
  });

  it("starts a lava-clock booster's cooldown like a pickup would", () => {
    const live = startClimb(
      createMatch({ seed: "b", mode: "solo", tower, playerIds: ["p"], startPowerUp: "slow-lava" })
    );
    expect(live.players[0].cooldownUntilTick["slow-lava"]).toBeGreaterThan(0);
  });

  it("rejects random, unknown and disallowed types", () => {
    for (const bad of ["random", "teleport", "toString", "giant"]) {
      expect(() =>
        createMatch({ seed: "b", mode: "solo", tower, playerIds: ["p"], startPowerUp: bad as PowerUpType })
      ).toThrow(RangeError);
    }
    // "random" is rejected as a booster even where random orbs may spawn.
    for (const t of [level("booster", { allowedPowerUps: ["random", "giant"] }), level("booster", {})]) {
      expect(() =>
        createMatch({ seed: "b", mode: "solo", tower: t, playerIds: ["p"], startPowerUp: "random" })
      ).toThrow(RangeError);
    }
  });
});
