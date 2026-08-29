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
import { DEFAULT_HAZARD_CONFIG } from "../../src/game/hazard";
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
} from "../../src/game/powerups";
import { validateInput } from "../../src/game/antiCheat";
import {
  buildTower,
  floorHeight,
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

  it("gives different towers different drops", () => {
    const other = buildTower("developer-tools");
    const a = scanFloors(TOWER, 0, 200).map((p) => `${p.floorIndex}:${p.type}`);
    const b = scanFloors(other, 0, 200).map((p) => `${p.floorIndex}:${p.type}`);
    expect(a).not.toEqual(b);
  });

  it("never spawns on the opening floors", () => {
    expect(powerUpForFloor(TOWER, 0)).toBeNull();
    expect(powerUpForFloor(TOWER, 1)).toBeNull();
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
      expect(pu.y - floorHeight(TOWER, pu.floorIndex)).toBeCloseTo(POWER_UP_HOVER_M, 6);
      // A climber standing on that floor is inside the pickup box.
      expect(overlapsPickup(pu, pu.x, floorHeight(TOWER, pu.floorIndex))).toBe(true);
    }
  });

  it("raises the drop chance with altitude, then holds it", () => {
    // Asserted on the curve rather than on a sample: the ramp only spans 50
    // floors, which is far too small a sample to compare rates without noise.
    expect(spawnChanceForFloor(0)).toBe(0);
    expect(spawnChanceForFloor(1)).toBe(0);
    for (let i = 2; i < 300; i++) {
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

describe("collection: one slot, replaced by the next orb", () => {
  it("banks an orb the climber walks into", () => {
    const m = climbingMatch();
    const p = m.players[0];
    placeOrb(m, "rapid-climb", p.x + 1, p.y);
    stepMatch(m, { p1: move(1) }, SLOW);
    expect(p.heldPowerUp).toBe("rapid-climb");
    expect(m.powerUps[0].collected).toBe(true);
    expect(p.lastPickupType).toBe("rapid-climb");
  });

  it("replaces the banked orb rather than dropping the new one", () => {
    const m = climbingMatch();
    const p = m.players[0];
    p.heldPowerUp = "time-slow";
    placeOrb(m, "super-jump", p.x, p.y);
    stepMatch(m, { p1: NO_INPUT }, SLOW);
    expect(p.heldPowerUp).toBe("super-jump");
  });

  it("collects an orb only once", () => {
    const m = climbingMatch();
    const p = m.players[0];
    placeOrb(m, "sprint-burst", p.x, p.y);
    stepMatch(m, { p1: NO_INPUT }, SLOW);
    p.heldPowerUp = null;
    stepMatch(m, { p1: NO_INPUT }, SLOW);
    expect(p.heldPowerUp).toBeNull();
  });

  it("ignores an orb the climber is not touching", () => {
    const m = climbingMatch();
    const p = m.players[0];
    placeOrb(m, "rapid-climb", p.x + 40, p.y);
    stepMatch(m, { p1: NO_INPUT }, SLOW);
    expect(p.heldPowerUp).toBeNull();
  });
});

describe("activation: edge-triggered, and only what you hold", () => {
  it("activates on the rising edge and empties the slot", () => {
    const m = climbingMatch();
    const p = m.players[0];
    p.heldPowerUp = "rapid-climb";
    stepMatch(m, { p1: usePower() }, SLOW);
    expect(p.heldPowerUp).toBeNull();
    expect(isPowerUpActive(p, "rapid-climb", m.tick)).toBe(true);
  });

  it("does not re-fire while the use button stays held", () => {
    const m = climbingMatch();
    const p = m.players[0];
    p.heldPowerUp = "rapid-climb";
    stepMatch(m, { p1: usePower() }, SLOW);
    p.heldPowerUp = "sprint-burst";
    stepMatch(m, { p1: usePower() }, SLOW); // still held down
    expect(p.heldPowerUp).toBe("sprint-burst");
    // Releasing and pressing again spends it.
    stepMatch(m, { p1: NO_INPUT }, SLOW);
    stepMatch(m, { p1: usePower() }, SLOW);
    expect(p.heldPowerUp).toBeNull();
  });

  it("does nothing when the slot is empty", () => {
    const m = climbingMatch();
    const p = m.players[0];
    stepMatch(m, { p1: usePower() }, SLOW);
    expect(p.activePowerUps).toHaveLength(0);
  });

  it("expires each effect after its advertised duration", () => {
    for (const type of POWER_UP_TYPES) {
      const m = climbingMatch();
      const p = m.players[0];
      p.heldPowerUp = type;
      stepMatch(m, { p1: usePower() }, SLOW);
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
    // Short enough that the boosted climber has not yet topped out on floor 1,
    // which would clamp its height and understate the multiplier.
    const plain = climbLadderFor(40, false);
    const boosted = climbLadderFor(40, true);
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

  it("double-jump grants exactly one extra airborne jump", () => {
    const m = climbingMatch();
    const p = m.players[0];
    p.heldPowerUp = "double-jump";
    stepMatch(m, { p1: usePower() }, SLOW);

    stepMatch(m, { p1: move(0, true) }, SLOW); // ground launch
    expect(p.onGround).toBe(false);
    // Fall a little so the second jump is clearly a fresh impulse.
    for (let i = 0; i < 20; i++) stepMatch(m, { p1: NO_INPUT }, SLOW);
    const vyBefore = p.vy;
    stepMatch(m, { p1: move(0, true) }, SLOW); // fresh press, mid-air
    expect(p.vy).toBeGreaterThan(vyBefore);

    // The charge is spent — a third jump does nothing.
    stepMatch(m, { p1: NO_INPUT }, SLOW);
    const vyAfter = p.vy;
    stepMatch(m, { p1: move(0, true) }, SLOW);
    expect(p.vy).toBeLessThan(vyAfter);
  });

  it("does not let a held jump key burn the double-jump charge", () => {
    const m = climbingMatch();
    const p = m.players[0];
    p.heldPowerUp = "double-jump";
    stepMatch(m, { p1: usePower() }, SLOW);
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
    });
    const v = validateInput({ moveX: 0, jump: true, climbY: 0, usePowerUp: false }, p, 1);
    expect(v.input.jump).toBe(true);
  });

  it("rejects it again once the charge is spent", () => {
    const p = airborne();
    p.activePowerUps.push({
      type: "double-jump",
      startTick: 0,
      durationTicks: durationTicks("double-jump"),
      used: true,
    });
    const v = validateInput({ moveX: 0, jump: true, climbY: 0, usePowerUp: false }, p, 1);
    expect(v.input.jump).toBe(false);
  });

  it("still rejects a climb input with no ladder under the player", () => {
    const p = airborne();
    p.heldPowerUp = "rapid-climb";
    const v = validateInput({ moveX: 0, jump: false, climbY: 1, usePowerUp: false }, p, 0);
    expect(v.rejected).toBe(true);
    expect(v.input.climbY).toBe(0);
  });
});

describe("AC-11: power-ups keep the simulation deterministic", () => {
  it("replays a run whose input log presses the power-up button", () => {
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
          usePowerUp: i % 31 === 0,
        },
      });
    }
    const a = simulateFromInputs(init, log, SLOW);
    const b = simulateFromInputs(init, log, SLOW);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it("starts every climber with an empty slot and no effects", () => {
    const p = spawnPlayer("p1", 0);
    expect(p.heldPowerUp).toBeNull();
    expect(p.activePowerUps).toEqual([]);
  });
});

describe("time-slow cooldown: the thing that keeps a run finite", () => {
  it("banks rather than burns a press made during the cooldown", () => {
    const m = climbingMatch();
    const p = m.players[0];
    p.heldPowerUp = "time-slow";
    stepMatch(m, { p1: usePower() }, SLOW);
    expect(isPowerUpActive(p, "time-slow", m.tick)).toBe(true);

    // Another one picked up while the first is still running.
    p.heldPowerUp = "time-slow";
    stepMatch(m, { p1: NO_INPUT }, SLOW);
    stepMatch(m, { p1: usePower() }, SLOW);
    expect(p.heldPowerUp).toBe("time-slow"); // kept, not consumed
    expect(cooldownRemaining(p, "time-slow", m.tick)).toBeGreaterThan(0);
  });

  it("becomes usable again once the cooldown elapses", () => {
    const m = climbingMatch();
    const p = m.players[0];
    p.heldPowerUp = "time-slow";
    stepMatch(m, { p1: usePower() }, SLOW);
    const wait = durationTicks("time-slow") + cooldownTicks("time-slow");
    for (let i = 0; i < wait; i++) stepMatch(m, { p1: NO_INPUT }, SLOW);
    expect(canActivate(p, "time-slow", m.tick)).toBe(true);

    p.heldPowerUp = "time-slow";
    stepMatch(m, { p1: usePower() }, SLOW);
    expect(isPowerUpActive(p, "time-slow", m.tick)).toBe(true);
  });

  it("leaves the lava faster than the climber even at perfect uptime", () => {
    // The endless tower's guarantee: the hazard settles above 1x the climb speed
    // so no run lasts forever. Time-slow is the only power-up that can cancel
    // enough of that to break it, and the cooldown is what bounds it.
    const d = POWER_UP_SPECS["time-slow"].durationSeconds;
    const c = POWER_UP_SPECS["time-slow"].cooldownSeconds;
    const maxUptime = d / (d + c);
    const effective = DEFAULT_HAZARD_CONFIG.endSpeedFrac * (1 - TIME_SLOW_FRAC * maxUptime);
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
    for (const type of ["rapid-climb", "sprint-burst", "time-slow"] as const) {
      expect(fedBotRun(type).peak).toBeGreaterThan(unaided);
    }
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

function usePower(): PlayerInput {
  return { moveX: 0, jump: false, climbY: 0, usePowerUp: true };
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
  if (boosted) p.heldPowerUp = "rapid-climb";
  stepMatch(
    m,
    { p1: { moveX: 0, jump: false, climbY: 1, usePowerUp: boosted } },
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
    p.heldPowerUp = "sprint-burst";
    stepMatch(m, { p1: { moveX: 0, jump: false, climbY: 0, usePowerUp: true } }, SLOW);
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
    p.heldPowerUp = "super-jump";
    stepMatch(m, { p1: usePower() }, SLOW);
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
  if (type) p.heldPowerUp = type;
  const out: number[] = [];
  for (let i = 0; i < 400; i++) {
    stepMatch(m, { p1: i === 0 && type ? usePower() : NO_INPUT }, DEFAULT_SIM_CONFIG);
    p.y = 5_000; // hold position; only the lava is under test
    out.push(m.hazardY);
  }
  return out;
}

/** The greedy ladder-seeking bot from the simulation suite. */
function botInput(p: PlayerState, tower: TowerSpec): PlayerInput {
  if (p.onLadder) return { moveX: 0, jump: false, climbY: 1, usePowerUp: false };
  const k = Math.floor((p.y + 0.5) / tower.floorGap);
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
 * The greedy bot under the real hazard, handed a fresh `type` whenever its slot
 * is empty and pressing use on every rising edge. This is the best case the
 * rules permit — far beyond what the world's drop rate supplies — so it is the
 * upper bound on what power-ups can do, not a typical run.
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
  let pressed = false;
  // Read through a closure: comparing `m.phase` inline narrows it to "climb" for
  // the rest of the function, and stepMatch's mutation is invisible to that.
  const climbing = () => m.phase === "climb";
  while (climbing() && ticks < maxTicks) {
    const p = m.players[0];
    if (type && !p.heldPowerUp) p.heldPowerUp = type;
    // Alternate so the edge-trigger sees a fresh press each time.
    const press: boolean = type !== null && p.heldPowerUp !== null && !pressed;
    pressed = press;
    stepMatch(m, { bot: { ...botInput(p, tower), usePowerUp: press } }, DEFAULT_SIM_CONFIG);
    ticks++;
  }
  return { peak: m.players[0].peakY, finished: !climbing() };
}
