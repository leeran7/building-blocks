/**
 * Random orbs resolve from the seeded RNG (spec-lava-apparency R3-1, V4-1).
 *
 * resolveRandom used to draw with Math.random() inside stepMatch, so a run
 * that collected a random orb did not re-simulate: verifyDailyReplay rejected
 * honest daily runs and simulateDuel settled on a fresh roll. The roll is now
 * keyed on (tower seed, orb floor, collector slot). These tests drive the
 * real stepMatch / simulateFromInputs / simulateDuel / verifyDailyReplay on
 * fixtures that really collect random orbs (each guarded with a count > 0).
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createMatch,
  simulateDuel,
  simulateFromInputs,
  stepMatch,
  DEFAULT_SIM_CONFIG,
  SimConfig,
} from "../../src/game/simulation";
import { DEFAULT_HAZARD_CONFIG } from "../../src/game/hazard";
import {
  CONCRETE_POWER_UP_TYPES,
  POWER_UP_HOVER_M,
  cooldownTicks,
  durationTicks,
  isPowerUpActive,
  resolveRandom,
} from "../../src/game/powerups";
import { applyRunSeed, buildTower } from "../../src/game/towers";
import { buildFreeTower } from "../../src/game/freeStack";
import { decodeRunReplay, encodeRunReplay } from "../../src/game/runReplay";
import { verifyDailyReplay } from "../../src/game/dailyVerify";
import { dailySeedFor } from "../../src/lib/dailySeedServer";
import { TEST_DAILY_SEED_SECRET } from "../lib/dailySeedTestSecret";
import {
  NO_INPUT,
  type MatchState,
  type PlayerId,
  type PlayerInput,
  type PowerUpType,
  type TowerSpec,
} from "../../src/game/types";
import { botInput } from "./greedyBot";

vi.stubEnv("DAILY_SEED_SECRET", TEST_DAILY_SEED_SECRET);

/** Upper bound on a bot run; every fixture below ends well before it. */
const MAX_BOT_TICKS = 20_000;
/** The "a" run on indie-games collects two random orbs (ticks ~734 and ~1237). */
const SOLO_SEED = "a";
const CATEGORY = "indie-games";
/** Daily tower whose greedy-bot run collects a random orb at tick ~304 of ~3196. */
const DAILY_DAY = "2026-10-21";
const DAILY_NOW = new Date(`${DAILY_DAY}T12:00:00Z`);
const DAILY_PLAYER = "you";
/** Ticks a random orb sits under a climber whose rolled type is cooling down. */
const BLOCKED_TICKS = 30;
/** Hazard all but frozen, so hand-built matches do not end mid-test. */
const SLOW: SimConfig = {
  ...DEFAULT_SIM_CONFIG,
  hazard: { ...DEFAULT_HAZARD_CONFIG, speedScale: 0.001 },
};

interface RandomPickup {
  orbId: string;
  floorIndex: number;
  tick: number;
  slot: number;
  effect: PowerUpType | null;
}

/** Step once and report every random orb collected on this tick, and by whom. */
function stepRecordingRandom(
  m: MatchState,
  inputs: Record<PlayerId, PlayerInput>,
  cfg: SimConfig = DEFAULT_SIM_CONFIG
): RandomPickup[] {
  const open = new Set(
    m.powerUps.filter((pu) => pu.type === "random" && !pu.collected).map((pu) => pu.id)
  );
  stepMatch(m, inputs, cfg);
  const out: RandomPickup[] = [];
  for (const pu of m.powerUps) {
    if (!open.has(pu.id) || !pu.collected) continue;
    const by = m.players.find((p) => p.lastPickupTick === pu.collectedTick);
    out.push({
      orbId: pu.id,
      floorIndex: pu.floorIndex,
      tick: m.tick,
      slot: by?.slot ?? -1,
      effect: by?.lastPickupType ?? null,
    });
  }
  return out;
}

/** Run the greedy bot for every player until the match ends; log inputs and random pickups. */
function botRun(
  init: Parameters<typeof createMatch>[0]
): { live: MatchState; log: Record<PlayerId, PlayerInput>[]; picks: RandomPickup[] } {
  const live = createMatch(init);
  while (live.phase === "countdown") stepMatch(live, {}, DEFAULT_SIM_CONFIG);
  const log: Record<PlayerId, PlayerInput>[] = [];
  const picks: RandomPickup[] = [];
  while (live.phase === "climb" && log.length < MAX_BOT_TICKS) {
    const inputs: Record<PlayerId, PlayerInput> = {};
    for (const p of live.players) inputs[p.id] = botInput(p, init.tower, live.tick);
    log.push(inputs);
    picks.push(...stepRecordingRandom(live, inputs));
  }
  return { live, log, picks };
}

function soloInit(): Parameters<typeof createMatch>[0] {
  return {
    seed: SOLO_SEED,
    mode: "solo",
    tower: buildTower(CATEGORY, { runSeed: SOLO_SEED }),
    playerIds: ["bot"],
  };
}

/** A climbing match with no generated orbs, so an injected orb is the only one in reach. */
function bareMatch(tower: TowerSpec, playerIds: PlayerId[]): MatchState {
  const m = createMatch({
    seed: "random-orb",
    mode: playerIds.length > 1 ? "multiplayer" : "solo",
    tower,
    playerIds,
  });
  m.phase = "climb";
  m.tick = 0;
  m.powerUps = [];
  m.powerUpFloorHi = 100_000;
  return m;
}

function placeOrb(m: MatchState, type: PowerUpType, floorIndex: number, x: number, feetY: number): void {
  m.powerUps.push({
    id: `pu:${floorIndex}`,
    type,
    floorIndex,
    x,
    y: feetY + POWER_UP_HOVER_M,
    collected: false,
    collectedTick: null,
  });
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("resolveRandom is a pure function of (tower seed, orb floor, slot)", () => {
  it("returns the same concrete type for the same key, every call", () => {
    const seed = buildTower(CATEGORY, { runSeed: SOLO_SEED }).seed;
    let checked = 0;
    for (let floor = 0; floor < 40; floor++) {
      for (const slot of [0, 1]) {
        const first = resolveRandom(seed, floor, slot);
        expect(resolveRandom(seed, floor, slot)).toBe(first);
        expect(CONCRETE_POWER_UP_TYPES).toContain(first);
        checked += 1;
      }
    }
    expect(checked).toBeGreaterThan(0);
  });

  it("different slots on one orb, and different orbs for one slot, can roll different effects", () => {
    const seed = buildTower(CATEGORY, { runSeed: SOLO_SEED }).seed;
    const floors = Array.from({ length: 40 }, (_, i) => i);
    const slotSplit = floors.filter((f) => resolveRandom(seed, f, 0) !== resolveRandom(seed, f, 1));
    const slot0Types = new Set(floors.map((f) => resolveRandom(seed, f, 0)));
    expect(slotSplit.length).toBeGreaterThan(0);
    expect(slot0Types.size).toBeGreaterThan(1);
    // Different seeds also move the roll (the key is not just floor + slot).
    const otherSeed = buildTower(CATEGORY, { runSeed: "b" }).seed;
    expect(floors.some((f) => resolveRandom(seed, f, 0) !== resolveRandom(otherSeed, f, 0))).toBe(true);
  });

  it("covers every concrete type, roughly uniformly, over many keys", () => {
    const counts = new Map<PowerUpType, number>();
    let total = 0;
    for (let s = 0; s < 10; s++) {
      const seed = buildTower(CATEGORY, { runSeed: `dist-${s}` }).seed;
      for (let floor = 0; floor < 350; floor++) {
        for (const slot of [0, 1]) {
          const t = resolveRandom(seed, floor, slot);
          counts.set(t, (counts.get(t) ?? 0) + 1);
          total += 1;
        }
      }
    }
    expect(total).toBe(7000);
    expect([...counts.keys()].sort()).toEqual([...CONCRETE_POWER_UP_TYPES].sort());
    const expected = total / CONCRETE_POWER_UP_TYPES.length;
    for (const t of CONCRETE_POWER_UP_TYPES) {
      const n = counts.get(t) ?? 0;
      expect(n).toBeGreaterThan(expected * 0.8);
      expect(n).toBeLessThan(expected * 1.2);
    }
  });
});

describe("stepMatch resolves random orbs from the key", () => {
  it("grants the collecting slot its own roll", () => {
    const tower = buildTower(CATEGORY, { runSeed: SOLO_SEED });
    const floor = Array.from({ length: 40 }, (_, i) => i).find(
      (f) => resolveRandom(tower.seed, f, 0) !== resolveRandom(tower.seed, f, 1)
    );
    expect(floor).toBeDefined();
    const f = floor as number;

    const effects: (PowerUpType | null)[] = [];
    for (const slot of [0, 1]) {
      const m = bareMatch(tower, ["p1", "p2"]);
      const p = m.players[slot];
      placeOrb(m, "random", f, p.x, p.y);
      const picks = stepRecordingRandom(m, { p1: NO_INPUT, p2: NO_INPUT }, SLOW);
      expect(picks).toHaveLength(1);
      expect(picks[0].slot).toBe(slot);
      expect(picks[0].effect).toBe(resolveRandom(tower.seed, f, slot));
      expect(isPowerUpActive(p, picks[0].effect as PowerUpType, m.tick)).toBe(true);
      effects.push(picks[0].effect);
    }
    expect(effects[0]).not.toBe(effects[1]);
  });

  it("a touch blocked by canActivate does not change the eventual roll", () => {
    const tower = buildTower(CATEGORY, { runSeed: SOLO_SEED });
    // An orb whose slot-0 roll is a type with a cooldown, so it can be blocked.
    const floor = Array.from({ length: 200 }, (_, i) => i).find(
      (f) => cooldownTicks(resolveRandom(tower.seed, f, 0)) > 0
    );
    expect(floor).toBeDefined();
    const f = floor as number;
    const rolled = resolveRandom(tower.seed, f, 0);

    const m = bareMatch(tower, ["p1"]);
    const p = m.players[0];
    // Put the rolled type on cooldown with a concrete orb (the fixture floor is irrelevant).
    placeOrb(m, rolled, f + 1000, p.x, p.y);
    stepMatch(m, { p1: NO_INPUT }, SLOW);
    expect(isPowerUpActive(p, rolled, m.tick)).toBe(true);

    placeOrb(m, "random", f, p.x, p.y);
    const orb = m.powerUps[m.powerUps.length - 1];
    let blocked = 0;
    for (let i = 0; i < BLOCKED_TICKS; i++) {
      stepMatch(m, { p1: NO_INPUT }, SLOW);
      expect(orb.collected).toBe(false);
      blocked += 1;
    }
    expect(blocked).toBe(BLOCKED_TICKS);

    const limit = durationTicks(rolled) + cooldownTicks(rolled) + 2;
    for (let i = 0; i < limit && !orb.collected; i++) stepMatch(m, { p1: NO_INPUT }, SLOW);
    expect(orb.collected).toBe(true);
    expect(p.lastPickupTick).toBe(orb.collectedTick);
    expect(p.lastPickupType).toBe(rolled);
  });
});

describe("AC-11: runs that collect random orbs re-simulate bit for bit", () => {
  it("solo: the live run never reads Math.random or the clock, and re-sims identically", () => {
    const random = vi.spyOn(Math, "random");
    const now = vi.spyOn(Date, "now");
    const init = soloInit();
    const { live, log, picks } = botRun(init);
    expect(random).not.toHaveBeenCalled();
    expect(now).not.toHaveBeenCalled();
    vi.restoreAllMocks();

    // Fixture guard: the run really collected random orbs.
    expect(picks.length).toBeGreaterThan(0);
    for (const pick of picks) {
      expect(pick.effect).toBe(resolveRandom(init.tower.seed, pick.floorIndex, pick.slot));
    }

    const a = simulateFromInputs(init, log, DEFAULT_SIM_CONFIG);
    expect(JSON.stringify(a)).toBe(JSON.stringify(live));
    const b = simulateFromInputs(init, log, DEFAULT_SIM_CONFIG);
    expect(JSON.stringify(b)).toBe(JSON.stringify(a));
  });

  it("duel: simulateDuel settles the same outcome the joint live sim reached", () => {
    const tower = buildTower(CATEGORY, { runSeed: SOLO_SEED });
    const init = { seed: SOLO_SEED, mode: "multiplayer" as const, tower, playerIds: ["p1", "p2"] };
    const { live, log, picks } = botRun(init);
    expect(picks.length).toBeGreaterThan(0);
    for (const pick of picks) {
      expect(pick.effect).toBe(resolveRandom(tower.seed, pick.floorIndex, pick.slot));
    }

    const log1 = log.map((t) => t.p1);
    const log2 = log.map((t) => t.p2);
    const settle = () => simulateDuel(SOLO_SEED, CATEGORY, "p1", "p2", log1, log2);
    const first = settle();
    expect(first).toMatchObject({
      winnerId: live.winnerId,
      player1Peak: live.players[0].peakY,
      player2Peak: live.players[1].peakY,
      tiebreakRule: live.tiebreakRule,
    });
    expect(settle()).toEqual(first);
  });

  it("daily: an honest run that collected a random orb verifies", async () => {
    const seed = dailySeedFor(DAILY_DAY);
    const init = {
      seed,
      mode: "solo" as const,
      tower: applyRunSeed(buildFreeTower(), seed),
      playerIds: [DAILY_PLAYER],
    };
    const { live, log, picks } = botRun(init);
    expect(picks.length).toBeGreaterThan(0);
    const inputs = log.map((t) => t[DAILY_PLAYER]);
    const peakY = live.players[0].peakY;

    const token = await encodeRunReplay({ seed, peakY, inputs });
    expect(token).toBeTruthy();
    const replay = await decodeRunReplay(token as string);
    expect(replay).not.toBeNull();
    if (replay === null) return;

    // The server re-sim must not draw its own roll: a roll the client cannot
    // reproduce is what made honest runs fail and let a cheater fish by retry.
    const random = vi.spyOn(Math, "random");
    const verdict = verifyDailyReplay(replay, peakY, DAILY_NOW);
    expect(random).not.toHaveBeenCalled();
    expect(verdict).toMatchObject({ ok: true, peakY });
  });
});
