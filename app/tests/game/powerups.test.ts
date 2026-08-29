/**
 * Tower v3 "The Climb" — power-up tests.
 *
 * Covers the three things that can quietly break this feature:
 *   Determinism — orbs are generated from (seed, floor), so a re-simulated run
 *     must find the same orbs in the same places (AC-11), and a run whose input
 *     log includes power-up presses must replay bit-identically.
 *   Placement  — an orb over a gap, or under the opening floor, is unreachable.
 *   Balance    — each effect does what it claims, expires on time, and the set
 *     as a whole raises the height ceiling without removing the pressure.
 */

import { describe, it, expect } from "vitest";
import {
  createMatch,
  stepMatch,
  spawnPlayer,
  simulateFromInputs,
  SimConfig,
  DEFAULT_SIM_CONFIG,
} from "../../src/game/simulation";
import {
  MatchState,
  PlayerId,
  PlayerInput,
  PlayerState,
  PowerUpType,
  TowerSpec,
  TICK_HZ,
  NO_INPUT,
} from "../../src/game/types";
import { DEFAULT_HAZARD_CONFIG, hazardMeanSpeedFrac } from "../../src/game/hazard";
import {
  POWER_UP_SPECS,
  POWER_UP_TYPES,
  POWER_UP_HOVER_M,
  RAPID_CLIMB_MULT,
  SPRINT_BURST_MULT,
  SUPER_JUMP_MULT,
  TIME_SLOW_FRAC,
  canActivate,
  cooldownRemaining,
  cooldownTicks,
  durationTicks,
  isPowerUpActive,
  overlapsPickup,
  powerUpForFloor,
  powerUpsNearY,
  spawnChanceForFloor,
  firstSpawnFloor,
  liveEntryCount,
  remainingTicks,
  consumeCharge,
  doubleJumpChargesRemaining,
  DOUBLE_JUMP_CHARGES,
} from "../../src/game/powerups";
import { validateInput } from "../../src/game/antiCheat";
import {
  buildTower,
  floorHeight,
  floorIndexAt,
  ladderForFloor,
  platformsForFloor,
} from "../../src/game/towers";

const TOWER: TowerSpec = buildTower("indie-games");

const SLOW: SimConfig = {
  ...DEFAULT_SIM_CONFIG,
  hazard: { ...DEFAULT_HAZARD_CONFIG, speedScale: 0.001 },
};

describe("spawning: deterministic, reachable, and denser with altitude", () => {
  it("generates identical orbs for the same (seed, floor)", () => {
    for (let i = 0; i < 120; i++) {
      expect(powerUpForFloor(TOWER, i)).toEqual(powerUpForFloor(TOWER, i));
    }
  });

  it("matches a high-floor jump to a sequential walk on a cold unique seed", () => {
    const tower = buildTower("spawn-schedule-cold-probe");
    const n = 80;
    const jumped = powerUpForFloor(tower, n);
    const walked = [];
    for (let i = 0; i <= n; i++) walked.push(powerUpForFloor(tower, i));
    expect(walked[n]).toEqual(jumped);
    expect(walked.filter(Boolean).map((p) => p!.floorIndex)).toEqual(
      walked.filter(Boolean).map((p) => p!.floorIndex).sort((a, b) => a - b)
    );
  });

  it("gives different towers different drops", () => {
    const other = buildTower("developer-tools");
    const a = scanFloors(TOWER, 0, 200).map((p) => `${p.floorIndex}:${p.type}`);
    const b = scanFloors(other, 0, 200).map((p) => `${p.floorIndex}:${p.type}`);
    expect(a).not.toEqual(b);
  });

  it("never spawns on the spawn floor", () => {
    // Floor 0 is the read-the-board floor; floor 1 upward is fair game so the
    // first orb lands early in the run.
    expect(powerUpForFloor(TOWER, 0)).toBeNull();
    const towers = ["developer-tools", "open-source", "web-frameworks"].map((s) =>
      buildTower(s)
    );
    for (const t of towers) expect(powerUpForFloor(t, 0)).toBeNull();
  });

  it("starts the first orb on a seed-varying floor, never the base", () => {
    const towers = [
      TOWER,
      buildTower("developer-tools"),
      buildTower("open-source"),
      buildTower("web-frameworks"),
      buildTower("game-engines"),
    ];
    const firsts = towers.map((t) => firstSpawnFloor(t));
    for (const f of firsts) {
      // Early enough that every run gets a power-up in the opening climb.
      expect(f).toBeGreaterThanOrEqual(1);
      expect(f).toBeLessThanOrEqual(4);
    }
    expect(new Set(firsts).size).toBeGreaterThan(1);
    for (const t of towers) {
      const first = firstSpawnFloor(t);
      expect(powerUpForFloor(t, first)).not.toBeNull();
      for (let i = 0; i < first; i++) {
        expect(powerUpForFloor(t, i)).toBeNull();
      }
    }
  });

  it("mixes tight clusters with droughts instead of even spacing", () => {
    const floors = scanFloors(TOWER, 0, 400).map((p) => p.floorIndex);
    expect(floors.length).toBeGreaterThan(20);
    const gaps = floors.slice(1).map((f, i) => f - floors[i]);
    expect(gaps.some((g) => g <= 2)).toBe(true);
    expect(gaps.some((g) => g >= 6)).toBe(true);
    const spread = Math.max(...gaps) - Math.min(...gaps);
    expect(spread).toBeGreaterThanOrEqual(5);
  });

  it("spreads orbs across the tower width rather than one band", () => {
    const xs = scanFloors(TOWER, 0, 400).map((p) => p.x);
    expect(xs.length).toBeGreaterThan(20);
    expect(Math.min(...xs)).toBeLessThan(TOWER.widthM * 0.35);
    expect(Math.max(...xs)).toBeGreaterThan(TOWER.widthM * 0.65);
  });

  it("always places the orb over solid floor, never over the jumpable gap", () => {
    for (const pu of scanFloors(TOWER, 0, 400)) {
      const onSolid = platformsForFloor(TOWER, pu.floorIndex).some(
        (pl) => pu.x >= pl.x0 && pu.x <= pl.x1
      );
      expect(onSolid).toBe(true);
    }
  });

  it("hovers a reachable distance above the floor surface", () => {
    for (const pu of scanFloors(TOWER, 0, 200)) {
      const hover = pu.y - floorHeight(TOWER, pu.floorIndex);
      expect(hover).toBeGreaterThanOrEqual(2.0);
      expect(hover).toBeLessThanOrEqual(5.0);
      // A climber standing on that floor is inside the pickup box.
      expect(overlapsPickup(pu, pu.x, floorHeight(TOWER, pu.floorIndex))).toBe(true);
    }
  });

  it("raises the drop chance with altitude, then holds it", () => {
    // Asserted on the curve rather than on a sample: the ramp only spans 50
    // floors, which is far too small a sample to compare rates without noise.
    expect(spawnChanceForFloor(0)).toBe(0);
    expect(spawnChanceForFloor(1)).toBeGreaterThan(0);
    for (let i = 1; i < 300; i++) {
      expect(spawnChanceForFloor(i + 1)).toBeGreaterThanOrEqual(spawnChanceForFloor(i));
    }
    expect(spawnChanceForFloor(400)).toBeCloseTo(spawnChanceForFloor(4000), 6);
  });

  it("leaves the clear majority of floors bare", () => {
    const rate = scanFloors(TOWER, 0, 1000).length / 1000;
    // Sparse enough that a floor with an orb still feels like a find.
    expect(rate).toBeGreaterThan(0.1);
    expect(rate).toBeLessThan(0.4);
  });

  it("offers every type across a long climb, with time-slow the rarest", () => {
    const counts = new Map<PowerUpType, number>();
    for (const pu of scanFloors(TOWER, 0, 3000)) {
      counts.set(pu.type, (counts.get(pu.type) ?? 0) + 1);
    }
    for (const t of POWER_UP_TYPES) expect(counts.get(t) ?? 0).toBeGreaterThan(0);
    const timeSlow = counts.get("time-slow") ?? 0;
    for (const t of POWER_UP_TYPES) {
      if (t !== "time-slow") expect(timeSlow).toBeLessThan(counts.get(t) ?? 0);
    }
  });

  it("powerUpsNearY returns exactly the orbs in the window", () => {
    const lo = floorHeight(TOWER, 10);
    const hi = floorHeight(TOWER, 20);
    for (const pu of powerUpsNearY(TOWER, lo, hi)) {
      expect(pu.floorIndex).toBeGreaterThanOrEqual(9);
      expect(pu.floorIndex).toBeLessThanOrEqual(21);
    }
  });
});

describe("pickup: touching an orb auto-activates it immediately", () => {
  it("activates on the same tick the climber walks into the orb", () => {
    const m = climbingMatch();
    const p = m.players[0];
    placeOrb(m, "rapid-climb", p.x + 1, p.y);
    stepMatch(m, { p1: move(1) }, SLOW);
    expect(isPowerUpActive(p, "rapid-climb", m.tick)).toBe(true);
    expect(m.powerUps[0].collected).toBe(true);
    expect(p.lastPickupTick).toBe(m.tick);
    expect(p.lastPickupType).toBe("rapid-climb");
  });

  it("collects an orb only once", () => {
    const m = climbingMatch();
    const p = m.players[0];
    placeOrb(m, "sprint-burst", p.x, p.y);
    stepMatch(m, { p1: NO_INPUT }, SLOW);
    const tickAfterFirst = p.lastPickupTick;
    stepMatch(m, { p1: NO_INPUT }, SLOW); // still standing on the same spot
    expect(p.lastPickupTick).toBe(tickAfterFirst);
    expect(m.powerUps[0].collected).toBe(true);
  });

  it("ignores an orb the climber is not touching", () => {
    const m = climbingMatch();
    const p = m.players[0];
    placeOrb(m, "rapid-climb", p.x + 40, p.y);
    stepMatch(m, { p1: NO_INPUT }, SLOW);
    expect(p.lastPickupTick).toBeNull();
    expect(m.powerUps[0].collected).toBe(false);
  });

  it("stacks two different orbs picked up back-to-back, both active at once", () => {
    const m = climbingMatch();
    const p = m.players[0];
    placeOrb(m, "rapid-climb", p.x, p.y);
    stepMatch(m, { p1: NO_INPUT }, SLOW);
    expect(isPowerUpActive(p, "rapid-climb", m.tick)).toBe(true);

    placeOrb(m, "sprint-burst", p.x, p.y);
    stepMatch(m, { p1: NO_INPUT }, SLOW);
    expect(isPowerUpActive(p, "sprint-burst", m.tick)).toBe(true);
    // The first pickup is still running — no held slot to be replaced.
    expect(isPowerUpActive(p, "rapid-climb", m.tick)).toBe(true);
  });

  it("skips an orb whose type is still on cooldown, and collects it once the cooldown clears", () => {
    const m = climbingMatch();
    const p = m.players[0];
    placeOrb(m, "time-slow", p.x, p.y);
    stepMatch(m, { p1: NO_INPUT }, SLOW);
    expect(isPowerUpActive(p, "time-slow", m.tick)).toBe(true);

    // A second orb sitting right on top of the player while the first is still
    // cooling down must NOT be collected.
    placeOrb(m, "time-slow", p.x, p.y);
    stepMatch(m, { p1: NO_INPUT }, SLOW);
    expect(m.powerUps[1].collected).toBe(false);
    expect(m.powerUps[1].collectedTick).toBeNull();
    const lastPickupBeforeClear = p.lastPickupTick;

    // Remove the skipped orb so it can't be auto-collected mid-wait the instant
    // the cooldown clears — that path is covered by the "becomes usable again"
    // test below; this one isolates the skip-then-fresh-pickup behavior.
    m.powerUps = m.powerUps.filter((pu) => pu.collected);
    const wait = durationTicks("time-slow") + cooldownTicks("time-slow");
    for (let i = 0; i < wait; i++) stepMatch(m, { p1: NO_INPUT }, SLOW);
    expect(p.lastPickupTick).toBe(lastPickupBeforeClear); // still untouched

    // A fresh orb, placed now that the cooldown has cleared: collectable.
    placeOrb(m, "time-slow", p.x, p.y);
    stepMatch(m, { p1: NO_INPUT }, SLOW);
    expect(m.powerUps[m.powerUps.length - 1].collected).toBe(true);
    expect(isPowerUpActive(p, "time-slow", m.tick)).toBe(true);
  });

  // The pre-existing same-type duplicate tests all used time-slow, the one type
  // whose cooldown blocks the second pickup outright. That left the four
  // zero-cooldown types — and the double-jump charge exploit — uncovered.
  describe("a second orb of a live type refreshes it instead of stacking", () => {
    const ZERO_COOLDOWN_TYPES = POWER_UP_TYPES.filter(
      (t) => cooldownTicks(t) === 0
    );

    it("has zero-cooldown types to test (guards against a vacuous sweep)", () => {
      expect(ZERO_COOLDOWN_TYPES.length).toBeGreaterThan(0);
      expect(ZERO_COOLDOWN_TYPES).not.toContain("time-slow");
    });

    it.each(ZERO_COOLDOWN_TYPES)("keeps exactly one live %s entry", (type) => {
      const m = climbingMatch();
      const p = m.players[0];

      placeOrb(m, type, p.x, p.y);
      stepMatch(m, { p1: NO_INPUT }, SLOW);
      expect(isPowerUpActive(p, type, m.tick)).toBe(true);
      expect(liveEntryCount(p, type, m.tick)).toBe(1);

      placeOrb(m, type, p.x, p.y);
      stepMatch(m, { p1: NO_INPUT }, SLOW);

      expect(isPowerUpActive(p, type, m.tick)).toBe(true);
      // Two entries mean a stale HUD countdown and duplicate React keys, since
      // PowerUpHud and ClimbCanvas both key their rows by type.
      expect(liveEntryCount(p, type, m.tick)).toBe(1);
      expect(p.activePowerUps.filter((a) => a.type === type)).toHaveLength(1);
    });

    it.each(ZERO_COOLDOWN_TYPES)("restarts the %s countdown on refresh", (type) => {
      const m = climbingMatch();
      const p = m.players[0];

      placeOrb(m, type, p.x, p.y);
      stepMatch(m, { p1: NO_INPUT }, SLOW);

      const half = Math.floor(durationTicks(type) / 2);
      for (let i = 0; i < half; i++) stepMatch(m, { p1: NO_INPUT }, SLOW);
      const beforeRefresh = remainingTicks(p, type, m.tick);
      expect(beforeRefresh).toBeLessThan(durationTicks(type));

      placeOrb(m, type, p.x, p.y);
      stepMatch(m, { p1: NO_INPUT }, SLOW);

      // Reading the older entry would report a countdown that keeps falling.
      expect(remainingTicks(p, type, m.tick)).toBeGreaterThan(beforeRefresh);
    });

    it("does not hand out more double-jump charges than the HUD reports", () => {
      // The exploit: consumeCharge drains the first entry, isExpired then
      // reports it spent, and activeEntry falls through to the second entry,
      // granting DOUBLE_JUMP_CHARGES again — while doubleJumpChargesRemaining
      // read the first entry and never showed more than the original two.
      const m = climbingMatch();
      const p = m.players[0];

      placeOrb(m, "double-jump", p.x, p.y);
      stepMatch(m, { p1: NO_INPUT }, SLOW);
      placeOrb(m, "double-jump", p.x, p.y);
      stepMatch(m, { p1: NO_INPUT }, SLOW);

      const reported = doubleJumpChargesRemaining(p, m.tick);
      expect(reported).toBe(DOUBLE_JUMP_CHARGES);

      let granted = 0;
      while (consumeCharge(p, "double-jump", m.tick)) {
        granted += 1;
        if (granted > DOUBLE_JUMP_CHARGES * 4) break; // don't loop forever
      }

      expect(granted).toBe(reported);
      expect(doubleJumpChargesRemaining(p, m.tick)).toBe(0);
    });

    it("tops charges back up when a second orb refreshes a partly spent one", () => {
      const m = climbingMatch();
      const p = m.players[0];

      placeOrb(m, "double-jump", p.x, p.y);
      stepMatch(m, { p1: NO_INPUT }, SLOW);
      expect(consumeCharge(p, "double-jump", m.tick)).toBe(true);
      expect(doubleJumpChargesRemaining(p, m.tick)).toBe(DOUBLE_JUMP_CHARGES - 1);

      placeOrb(m, "double-jump", p.x, p.y);
      stepMatch(m, { p1: NO_INPUT }, SLOW);

      expect(doubleJumpChargesRemaining(p, m.tick)).toBe(DOUBLE_JUMP_CHARGES);
      expect(liveEntryCount(p, "double-jump", m.tick)).toBe(1);
    });
  });

  it("expires each effect after its advertised duration", () => {
    for (const type of POWER_UP_TYPES) {
      const m = climbingMatch();
      const p = m.players[0];
      placeOrb(m, type, p.x, p.y);
      stepMatch(m, { p1: NO_INPUT }, SLOW);
      expect(isPowerUpActive(p, type, m.tick)).toBe(true);

      const ticks = durationTicks(type);
      expect(ticks).toBe(Math.round(POWER_UP_SPECS[type].durationSeconds * TICK_HZ));
      for (let i = 0; i < ticks; i++) stepMatch(m, { p1: NO_INPUT }, SLOW);
      expect(isPowerUpActive(p, type, m.tick)).toBe(false);
    }
  });
});

describe("effects: each power-up does what its label claims", () => {
  it("rapid-climb scales ladder speed by exactly its multiplier", () => {
    // Short window so neither run tops out on a variable-height floor segment.
    const plain = climbLadderFor(18, false);
    const boosted = climbLadderFor(18, true);
    expect(boosted / plain).toBeCloseTo(RAPID_CLIMB_MULT, 2);
  });

  it("sprint-burst scales run speed by exactly its multiplier", () => {
    const plain = runFor(30, false);
    const boosted = runFor(30, true);
    expect(boosted / plain).toBeCloseTo(SPRINT_BURST_MULT, 2);
  });

  it("super-jump launches higher than a normal jump", () => {
    const plain = jumpApex(false);
    const boosted = jumpApex(true);
    // Apex scales with the square of launch velocity, give or take the tick
    // granularity of sampling the arc.
    expect(boosted / plain).toBeCloseTo(SUPER_JUMP_MULT ** 2, 0);
  });

  it("double-jump grants two extra airborne jumps", () => {
    const m = climbingMatch();
    const p = m.players[0];
    placeOrb(m, "double-jump", p.x, p.y);
    stepMatch(m, { p1: NO_INPUT }, SLOW);

    stepMatch(m, { p1: move(0, true) }, SLOW); // ground launch
    expect(p.onGround).toBe(false);
    for (let i = 0; i < 20; i++) stepMatch(m, { p1: NO_INPUT }, SLOW);
    const vyBefore1 = p.vy;
    stepMatch(m, { p1: move(0, true) }, SLOW); // first mid-air jump
    expect(p.vy).toBeGreaterThan(vyBefore1);

    stepMatch(m, { p1: NO_INPUT }, SLOW);
    for (let i = 0; i < 20; i++) stepMatch(m, { p1: NO_INPUT }, SLOW);
    const vyBefore2 = p.vy;
    stepMatch(m, { p1: move(0, true) }, SLOW); // second mid-air jump
    expect(p.vy).toBeGreaterThan(vyBefore2);

    // Both charges spent — a third jump does nothing.
    stepMatch(m, { p1: NO_INPUT }, SLOW);
    const vyAfter = p.vy;
    stepMatch(m, { p1: move(0, true) }, SLOW);
    expect(p.vy).toBeLessThan(vyAfter);
  });

  it("does not let a held jump key burn the double-jump charge", () => {
    const m = climbingMatch();
    const p = m.players[0];
    placeOrb(m, "double-jump", p.x, p.y);
    stepMatch(m, { p1: NO_INPUT }, SLOW);
    // Jump held down continuously from the ground.
    stepMatch(m, { p1: move(0, true) }, SLOW);
    for (let i = 0; i < 6; i++) stepMatch(m, { p1: move(0, true) }, SLOW);
    expect(isPowerUpActive(p, "double-jump", m.tick)).toBe(true);
  });

  it("an airborne jump without the charge stays impossible", () => {
    const m = climbingMatch();
    const p = m.players[0];
    stepMatch(m, { p1: move(0, true) }, SLOW);
    for (let i = 0; i < 8; i++) stepMatch(m, { p1: NO_INPUT }, SLOW);
    const vyBefore = p.vy;
    stepMatch(m, { p1: move(0, true) }, SLOW);
    expect(p.vy).toBeLessThan(vyBefore); // just gravity, no impulse
  });

  it("time-slow holds the lava back without ever moving it downward", () => {
    const withSlow = hazardTrace(true);
    const without = hazardTrace(false);
    expect(withSlow[withSlow.length - 1]).toBeLessThan(without[without.length - 1]);
    for (let i = 1; i < withSlow.length; i++) {
      expect(withSlow[i]).toBeGreaterThanOrEqual(withSlow[i - 1]);
    }
  });

  it("cuts the lava's rise rate by TIME_SLOW_FRAC while it runs", () => {
    // Warm past the opening grace first — before that the lava is flat, so there
    // is no rise to slow and nothing to compare against.
    const warm = Math.round(TICK_HZ * (DEFAULT_HAZARD_CONFIG.graceSeconds + 5));
    const window = durationTicks("time-slow") - 10;

    const run = (slowed: boolean) => {
      const m = createMatch({
        seed: "haz",
        mode: "solo",
        tower: TOWER,
        playerIds: ["p1"],
      });
      m.phase = "climb";
      m.tick = 0;
      const p = m.players[0];
      p.y = 5_000;
      p.peakY = 5_000;
      const hold = (n: number) => {
        for (let i = 0; i < n; i++) {
          stepMatch(m, { p1: NO_INPUT }, DEFAULT_SIM_CONFIG);
          p.y = 5_000; // only the lava is under test
        }
      };
      hold(warm);
      // Started directly rather than by walking onto an orb: collection takes a
      // few ticks to resolve, which would leave the two runs out of step.
      if (slowed) {
        p.activePowerUps.push({
          type: "time-slow",
          startTick: m.tick,
          durationTicks: durationTicks("time-slow"),
          used: false,
        });
      }
      const y0 = m.hazardY;
      const banked0 = m.hazardSlowSeconds;
      hold(window);
      expect(isPowerUpActive(p, "time-slow", m.tick)).toBe(slowed);
      return { rise: m.hazardY - y0, banked: m.hazardSlowSeconds - banked0 };
    };

    const slow = run(true);
    const plain = run(false);
    expect(plain.banked).toBe(0);
    // Every slowed tick banks exactly TIME_SLOW_FRAC of it — seconds the lava
    // never gets to spend, which is how the effect stays monotonic.
    expect(slow.banked).toBeCloseTo((TIME_SLOW_FRAC * window) / TICK_HZ, 6);
    // Which surfaces as the lava rising at ~(1 − frac) of its normal rate. Not
    // exact: the lava is still accelerating, and a held-back lava also
    // accelerates more slowly, so the observed ratio sits just under.
    const ratio = slow.rise / plain.rise;
    expect(ratio).toBeGreaterThan((1 - TIME_SLOW_FRAC) * 0.9);
    expect(ratio).toBeLessThan((1 - TIME_SLOW_FRAC) * 1.1);
  });
});

describe("anti-cheat: power-ups widen the rules only as far as they should", () => {
  it("rejects an air jump from a player with no charge", () => {
    const p = airborne();
    const v = validateInput({ moveX: 0, jump: true, climbY: 0, usePowerUp: false }, p, 0);
    expect(v.rejected).toBe(true);
    expect(v.input.jump).toBe(false);
  });

  it("allows an air jump backed by an unspent double-jump charge", () => {
    const p = airborne();
    p.activePowerUps.push({
      type: "double-jump",
      startTick: 0,
      durationTicks: durationTicks("double-jump"),
      used: false,
      chargesRemaining: 1,
    });
    const v = validateInput({ moveX: 0, jump: true, climbY: 0, usePowerUp: false }, p, 1);
    expect(v.input.jump).toBe(true);
  });

  it("rejects it again once the charges are spent", () => {
    const p = airborne();
    p.activePowerUps.push({
      type: "double-jump",
      startTick: 0,
      durationTicks: durationTicks("double-jump"),
      used: false,
      chargesRemaining: 0,
    });
    const v = validateInput({ moveX: 0, jump: true, climbY: 0, usePowerUp: false }, p, 1);
    expect(v.input.jump).toBe(false);
  });

  it("does not let rapid-climb neutralize climb intent (the sim still has to find a ladder)", () => {
    // climbY used to be zeroed off-ladder in validateInput, which made every
    // honest grab look like a spoof. Rapid-climb is a speed multiplier, not a
    // permission to skip the grab. Pass the intent through; integratePlayer
    // no-ops it when no ladder is in reach.
    const p = airborne();
    p.activePowerUps.push({
      type: "rapid-climb",
      startTick: 0,
      durationTicks: durationTicks("rapid-climb"),
      used: false,
    });
    const v = validateInput({ moveX: 0, jump: false, climbY: 1, usePowerUp: false }, p, 0);
    expect(v.rejected).toBe(false);
    expect(v.input.climbY).toBe(1);
  });
});

describe("AC-11: power-ups keep the simulation deterministic", () => {
  it("replays a run deterministically with power-up pickups along the way", () => {
    const init = {
      seed: "pu-determinism",
      mode: "solo" as const,
      tower: TOWER,
      playerIds: ["p1"],
    };
    const log: Record<PlayerId, PlayerInput>[] = [];
    for (let i = 0; i < 600; i++) {
      log.push({
        p1: {
          moveX: i % 7 === 0 ? 1 : 0,
          jump: i % 23 === 0,
          climbY: i % 3 === 0 ? 1 : 0,
          usePowerUp: false,
        },
      });
    }
    const a = simulateFromInputs(init, log, SLOW);
    const b = simulateFromInputs(init, log, SLOW);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it("starts every climber with no effects running", () => {
    const p = spawnPlayer("p1", 0);
    expect(p.activePowerUps).toEqual([]);
  });
});

describe("time-slow cooldown: the thing that keeps a run finite", () => {
  it("leaves an orb uncollected rather than consuming it during the cooldown", () => {
    const m = climbingMatch();
    const p = m.players[0];
    placeOrb(m, "time-slow", p.x, p.y);
    stepMatch(m, { p1: NO_INPUT }, SLOW);
    expect(isPowerUpActive(p, "time-slow", m.tick)).toBe(true);

    // Another one sitting on the player while the first is still running.
    placeOrb(m, "time-slow", p.x, p.y);
    stepMatch(m, { p1: NO_INPUT }, SLOW);
    expect(m.powerUps[1].collected).toBe(false); // left in place, not wasted
    expect(cooldownRemaining(p, "time-slow", m.tick)).toBeGreaterThan(0);
  });

  it("becomes usable again once the cooldown elapses", () => {
    const m = climbingMatch();
    const p = m.players[0];
    placeOrb(m, "time-slow", p.x, p.y);
    stepMatch(m, { p1: NO_INPUT }, SLOW);
    const wait = durationTicks("time-slow") + cooldownTicks("time-slow");
    for (let i = 0; i < wait; i++) stepMatch(m, { p1: NO_INPUT }, SLOW);
    expect(canActivate(p, "time-slow", m.tick)).toBe(true);

    placeOrb(m, "time-slow", p.x, p.y);
    stepMatch(m, { p1: NO_INPUT }, SLOW);
    expect(isPowerUpActive(p, "time-slow", m.tick)).toBe(true);
  });

  it("leaves the lava faster than the climber even at perfect uptime", () => {
    // The endless tower's guarantee: the hazard settles above 1x the climb speed
    // so no run lasts forever. Time-slow is the only power-up that can cancel
    // enough of that to break it, and the cooldown is what bounds it.
    const d = POWER_UP_SPECS["time-slow"].durationSeconds;
    const c = POWER_UP_SPECS["time-slow"].cooldownSeconds;
    const maxUptime = d / (d + c);
    const effective =
      hazardMeanSpeedFrac(DEFAULT_HAZARD_CONFIG) *
      (1 - TIME_SLOW_FRAC * maxUptime);
    expect(effective).toBeGreaterThan(1);
  });

  it("no other power-up touches the lava clock", () => {
    for (const type of POWER_UP_TYPES) {
      if (type === "time-slow") continue;
      expect(POWER_UP_SPECS[type].cooldownSeconds).toBe(0);
      const trace = hazardTrace(false, type);
      const plain = hazardTrace(false);
      expect(trace[trace.length - 1]).toBeCloseTo(plain[plain.length - 1], 6);
    }
  });
});

describe("balance: power-ups raise the ceiling without removing the pressure", () => {
  it("a supplied climber reaches higher than an unaided one", () => {
    const unaided = fedBotRun(null).peak;
    const peaks = {
      "rapid-climb": fedBotRun("rapid-climb").peak,
      "sprint-burst": fedBotRun("sprint-burst").peak,
      "time-slow": fedBotRun("time-slow").peak,
    };
    for (const peak of Object.values(peaks)) {
      expect(peak).toBeGreaterThanOrEqual(unaided);
    }
    expect(Math.max(...Object.values(peaks))).toBeGreaterThan(unaided);
  });

  it("still ends the run even when fed time-slow as fast as the rules allow", () => {
    const run = fedBotRun("time-slow", 200_000);
    expect(run.finished).toBe(true);
    expect(run.peak).toBeGreaterThan(0);
  });

  it("leaves most floors without an orb, so climbing still carries the run", () => {
    const floors = 500;
    const withOrbs = scanFloors(TOWER, 0, floors).length;
    expect(withOrbs / floors).toBeLessThan(0.4);
  });
});

// ── helpers ────────────────────────────────────────────────────────────────

function climbingMatch(tower: TowerSpec = TOWER): MatchState {
  const m = createMatch({
    seed: "pu-test",
    mode: "solo",
    tower,
    playerIds: ["p1"],
  });
  m.phase = "climb";
  m.tick = 0;
  // Start from a clean world so an injected orb is the only one in reach.
  m.powerUps = [];
  m.powerUpFloorHi = 100_000;
  return m;
}

function move(dir: -1 | 0 | 1, jump = false): PlayerInput {
  return { moveX: dir, jump, climbY: 0, usePowerUp: false };
}

function placeOrb(m: MatchState, type: PowerUpType, x: number, feetY: number): void {
  m.powerUps.push({
    id: `test:${type}`,
    type,
    floorIndex: 0,
    x,
    y: feetY + POWER_UP_HOVER_M,
    collected: false,
    collectedTick: null,
  });
}

function airborne(): PlayerState {
  const p = spawnPlayer("p1", 0);
  p.onGround = false;
  return p;
}

function scanFloors(tower: TowerSpec, from: number, to: number) {
  const out = [];
  for (let i = from; i < to; i++) {
    const pu = powerUpForFloor(tower, i);
    if (pu) out.push(pu);
  }
  return out;
}

/**
 * Height gained climbing a ladder for `ticks`, with or without rapid-climb.
 *
 * Both runs take the same priming step, because grabbing a ladder costs a tick
 * in which the climber does not move: skipping it for only one of the two would
 * hand that run an extra tick of travel and skew the ratio.
 */
function climbLadderFor(ticks: number, boosted: boolean): number {
  const m = climbingMatch();
  const p = m.players[0];
  const l0 = ladderForFloor(TOWER, 0);
  p.x = l0.x;
  p.y = 0;
  p.onGround = true;
  if (boosted) placeOrb(m, "rapid-climb", p.x, p.y);
  stepMatch(
    m,
    { p1: { moveX: 0, jump: false, climbY: 1, usePowerUp: false } },
    SLOW
  );
  const y0 = p.y;
  for (let i = 0; i < ticks; i++) {
    stepMatch(m, { p1: { moveX: 0, jump: false, climbY: 1, usePowerUp: false } }, SLOW);
  }
  return p.y - y0;
}

/** Distance run in `ticks`, with or without sprint-burst. */
function runFor(ticks: number, boosted: boolean): number {
  const m = climbingMatch();
  const p = m.players[0];
  p.x = 5;
  if (boosted) {
    placeOrb(m, "sprint-burst", p.x, p.y);
    stepMatch(m, { p1: { moveX: 0, jump: false, climbY: 0, usePowerUp: false } }, SLOW);
  }
  const x0 = p.x;
  for (let i = 0; i < ticks; i++) stepMatch(m, { p1: move(1) }, SLOW);
  return p.x - x0;
}

/** Peak height of a single jump from the base, with or without super-jump. */
function jumpApex(boosted: boolean): number {
  const m = climbingMatch();
  const p = m.players[0];
  if (boosted) {
    placeOrb(m, "super-jump", p.x, p.y);
    stepMatch(m, { p1: NO_INPUT }, SLOW);
  }
  stepMatch(m, { p1: move(0, true) }, SLOW);
  let apex = p.y;
  for (let i = 0; i < 200 && !p.onGround; i++) {
    stepMatch(m, { p1: NO_INPUT }, SLOW);
    if (p.y > apex) apex = p.y;
  }
  return apex;
}

/**
 * Lava height each tick while the climber is parked out of reach, so only the
 * hazard clock is under test. Optionally activates one power-up on tick 1.
 */
function hazardTrace(slowed: boolean, alsoActivate?: PowerUpType): number[] {
  const m = createMatch({
    seed: "haz",
    mode: "solo",
    tower: TOWER,
    playerIds: ["p1"],
  });
  m.phase = "climb";
  m.tick = 0;
  const p = m.players[0];
  p.y = 5_000;
  p.peakY = 5_000;
  const type = slowed ? "time-slow" : alsoActivate;
  if (type) placeOrb(m, type, p.x, p.y);
  const out: number[] = [];
  for (let i = 0; i < 400; i++) {
    stepMatch(m, { p1: NO_INPUT }, DEFAULT_SIM_CONFIG);
    p.y = 5_000; // hold position; only the lava is under test
    out.push(m.hazardY);
  }
  return out;
}

/** The greedy ladder-seeking bot from the simulation suite. */
function botInput(p: PlayerState, tower: TowerSpec): PlayerInput {
  if (p.onLadder) return { moveX: 0, jump: false, climbY: 1, usePowerUp: false };
  const k = floorIndexAt(tower, p.y + 0.5);
  const target = ladderForFloor(tower, k);
  const dx = target.x - p.x;
  if (Math.abs(dx) <= tower.ladderGrabRadius * 0.5) {
    return { moveX: 0, jump: false, climbY: 1, usePowerUp: false };
  }
  const dir: -1 | 0 | 1 = dx > 0 ? 1 : -1;
  const probe = p.x + dir * 1.2;
  const ahead = platformsForFloor(tower, k).some(
    (pl) => probe >= pl.x0 && probe <= pl.x1 && Math.abs(pl.y - p.y) <= 0.05
  );
  return { moveX: dir, jump: p.onGround && !ahead, climbY: 0, usePowerUp: false };
}

/**
 * The greedy bot under the real hazard, given a fresh `type` orb to walk over
 * (and so auto-collect on the very next step) whenever it has no live effect
 * of that type running and no such orb already waiting for it. This is the
 * best case the rules permit — far beyond what the world's drop rate supplies
 * — so it is the upper bound on what power-ups can do, not a typical run.
 */
function fedBotRun(
  type: PowerUpType | null,
  maxTicks = 20_000
): { peak: number; finished: boolean } {
  const tower = buildTower("indie-games");
  const m = createMatch({
    seed: "balance",
    mode: "solo",
    tower,
    playerIds: ["bot"],
  });
  m.phase = "climb";
  m.tick = 0;
  // The world's own orbs would add noise to a comparison between feeds.
  m.powerUps = [];
  m.powerUpFloorHi = Number.MAX_SAFE_INTEGER;

  let ticks = 0;
  // Read through a closure: comparing `m.phase` inline narrows it to "climb" for
  // the rest of the function, and stepMatch's mutation is invisible to that.
  const climbing = () => m.phase === "climb";
  while (climbing() && ticks < maxTicks) {
    const p = m.players[0];
    if (type) {
      // Re-park a single orb of `type` right where the bot currently stands,
      // every tick it isn't already running the effect and isn't cooling
      // down, so it is walked into and auto-collected the moment the rules
      // allow. Dropping any stale copy first keeps this from stacking orbs
      // the bot has already walked past.
      const canFeedNow =
        !isPowerUpActive(p, type, m.tick) && canActivate(p, type, m.tick);
      m.powerUps = m.powerUps.filter((pu) => pu.type !== type);
      if (canFeedNow) placeOrb(m, type, p.x, p.y);
    }
    stepMatch(m, { bot: botInput(p, tower) }, DEFAULT_SIM_CONFIG);
    ticks++;
  }
  return { peak: m.players[0].peakY, finished: !climbing() };
}
