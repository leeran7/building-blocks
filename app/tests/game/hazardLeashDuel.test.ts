/**
 * The leash in duels (spec-lava-apparency Revision 2, R2-1 / SEC-LAVA-1).
 *
 * stepMatch keys the leash on the LOWEST climbing player's lead. On a duel
 * client the peer's y comes from an unvalidated ghost snapshot, so:
 *   - a spoofed ghost far above the lava must not change the honest client's
 *     hazard at all (under a max it ran the lava at the 3× cap);
 *   - a leader cannot drag the lava onto the trailer: the trailer's gap is
 *     exactly what it would be alone, inside the leash band;
 *   - the trailer's client reads its own exact height, so its local hazard
 *     equals the server's joint re-sim (simulateDuel) even while the leader
 *     bursts ahead on a jetpack and the ghost lags (reviewer W2).
 *
 * Every run drives the real stepMatch / simulateDuel. Ghosts are slaved the
 * way useRace.applyGhosts does it: position and status written before each
 * stepMatch, with the local slot the only one integrated.
 */

import { describe, expect, it } from "vitest";
import {
  createMatch,
  simulateDuel,
  stepMatch,
  DEFAULT_SIM_CONFIG,
} from "../../src/game/simulation";
import { buildFreeTower } from "../../src/game/freeStack";
import { buildTower } from "../../src/game/towers";
import { isPowerUpActive } from "../../src/game/powerups";
import { HAZARD_LEASH_M } from "../../src/game/hazard";
import {
  NO_INPUT,
  TICK_DT,
  TICK_HZ,
  type MatchState,
  type PlayerInput,
  type PlayerStatus,
} from "../../src/game/types";
import { botInput } from "./greedyBot";

const SLUG = "indie-games";
/** Same band the solo leash test holds a burst-pace climber in. */
const BAND_LO = 35;
const BAND_HI = 115;
const SETTLE_S = 30;

/** Run a fixture once per file; every test reads the same frozen result. */
function once<T>(make: () => T): () => T {
  let value: { v: T } | null = null;
  return () => {
    if (value === null) value = { v: make() };
    return value.v;
  };
}

/** Honest greedy bot on slot 0 of a duel client; slot 1 is a ghost. */
function honestClient(
  seed: string,
  ghostY: (m: MatchState) => number,
  maxTicks = 20_000
): { hazard: number[]; peakY: number; finishedTick: number | null; leashTicks: number } {
  const tower = buildTower(SLUG, { runSeed: seed });
  const m = createMatch({ seed, mode: "multiplayer", tower, playerIds: ["honest", "peer"] });
  while (m.phase === "countdown") stepMatch(m, {}, DEFAULT_SIM_CONFIG);
  const [me, ghost] = m.players;
  const hazard: number[] = [];
  let leashTicks = 0;
  while (m.phase === "climb" && hazard.length < maxTicks) {
    ghost.y = ghostY(m);
    ghost.status = "climbing";
    const banked0 = m.hazardSlowSeconds;
    stepMatch(m, { 0: botInput(me, tower, m.tick) }, DEFAULT_SIM_CONFIG, { localSlot: 0 });
    if (m.hazardSlowSeconds < banked0 - 1e-12) leashTicks += 1;
    hazard.push(m.hazardY);
    if (me.status !== "climbing") break;
  }
  return { hazard, peakY: me.peakY, finishedTick: me.finishedTick, leashTicks };
}

describe("a spoofed ghost cannot speed up the honest client's lava", () => {
  const SEED = "spoof-ghost";
  // Baseline: the peer reports the honest player's own height, so the lead
  // the leash reads is the honest player's under a min and a max alike.
  const baseline = once(() => honestClient(SEED, (m) => m.players[0].y));

  it("a ghost at hazardY + 500 leaves the hazard bit-identical, tick for tick", () => {
    const base = baseline();
    const spoofed = honestClient(SEED, (m) => m.hazardY + 500);
    // The honest run is long enough for its own leash to engage, so the
    // comparison covers the leash, not just the 1× curve.
    expect(base.leashTicks).toBeGreaterThan(0);
    expect(base.hazard.length).toBeGreaterThan(30 * TICK_HZ);
    expect(spoofed.hazard).toEqual(base.hazard);
    expect(spoofed.finishedTick).toBe(base.finishedTick);
    expect(spoofed.peakY).toBe(base.peakY);
  });

  it("a NaN ghost height cannot mask the honest player's own lead", () => {
    const base = baseline();
    const nan = honestClient(SEED, () => Number.NaN);
    expect(base.leashTicks).toBeGreaterThan(0);
    expect(nan.hazard).toEqual(base.hazard);
  });
});

interface PairResult {
  trailerCaughtAtS: number | null;
  trailerMinGap: number;
  trailerMaxGap: number;
  trailerGaps: number[];
  leaderFinalGap: number;
  bandTicks: number;
}

/**
 * Two constant-pace climbers, both ghost-slaved (localSlot names nobody), with
 * the sim's own lethal check. `leaderPace` null runs the trailer alone.
 */
function runPair(trailerPace: number, leaderPace: number | null, seconds = 300): PairResult {
  const tower = buildFreeTower();
  const ids = leaderPace === null ? ["trailer"] : ["trailer", "leader"];
  const m = createMatch({ seed: "leash-pair", mode: "multiplayer", tower, playerIds: ids });
  m.phase = "climb";
  m.tick = 0;
  const [trailer, leader] = m.players;
  const trailerGaps: number[] = [];
  let min = Infinity;
  let max = -Infinity;
  let bandTicks = 0;
  let caughtAt: number | null = null;
  for (let i = 0; i < Math.round(seconds * TICK_HZ) && trailer.status === "climbing"; i++) {
    trailer.y += trailerPace * tower.maxClimbSpeed * TICK_DT;
    trailer.peakY = Math.max(trailer.peakY, trailer.y);
    if (leader && leaderPace !== null) {
      leader.y += leaderPace * tower.maxClimbSpeed * TICK_DT;
      leader.peakY = Math.max(leader.peakY, leader.y);
    }
    stepMatch(m, {}, DEFAULT_SIM_CONFIG, { localSlot: 99 });
    const gap = trailer.y - m.hazardY;
    trailerGaps.push(gap);
    if (gap <= 0) {
      trailer.status = "eliminated";
      caughtAt = m.raceSeconds;
      break;
    }
    if (m.raceSeconds < SETTLE_S) continue;
    min = Math.min(min, gap);
    max = Math.max(max, gap);
    bandTicks += 1;
  }
  return {
    trailerCaughtAtS: caughtAt,
    trailerMinGap: min,
    trailerMaxGap: max,
    trailerGaps,
    leaderFinalGap: leader ? leader.y - m.hazardY : 0,
    bandTicks,
  };
}

describe("leader + trailer: the lava hunts the trailer, not the leader", () => {
  it("a 0.85× trailer under a 1.0× leader stays inside the leash band", () => {
    const pair = runPair(0.85, 1.0);
    expect(pair.trailerCaughtAtS).toBeNull();
    expect(pair.bandTicks).toBeGreaterThan(0);
    expect(pair.trailerMinGap).toBeGreaterThanOrEqual(BAND_LO);
    expect(pair.trailerMaxGap).toBeLessThanOrEqual(BAND_HI);
    // The leader simply outruns the view; the lava does not follow them.
    expect(pair.leaderFinalGap).toBeGreaterThan(BAND_HI * 3);
  });

  it("the trailer's gap is exactly what it would be alone", () => {
    const pair = runPair(0.85, 1.0);
    const alone = runPair(0.85, null);
    expect(pair.trailerGaps.length).toBeGreaterThan(0);
    expect(pair.trailerGaps).toEqual(alone.trailerGaps);
  });

  it("a realistic 0.58× trailer is caught when it would be alone, not early (reviewer W1)", () => {
    const pair = runPair(0.58, 0.62, 600);
    const alone = runPair(0.58, null, 600);
    expect(alone.trailerCaughtAtS).not.toBeNull();
    expect(pair.trailerCaughtAtS).toBe(alone.trailerCaughtAtS);
  });
});

interface JointTick {
  hazardY: number;
  leaderY: number;
  leaderStatus: PlayerStatus;
  trailerStatus: PlayerStatus;
  leaderJetpack: boolean;
  lavaPowerUp: boolean;
}

/**
 * The live duel both players are in, integrated jointly from inputs exactly
 * as the server does. The leader is the greedy bot; the trailer is the same
 * bot pausing 1.2 s of every 4 s. Records every tick for the client replay.
 */
function playJointDuel(seed: string) {
  const tower = buildTower(SLUG, { runSeed: seed });
  const m = createMatch({ seed, mode: "multiplayer", tower, playerIds: ["lead", "trail"] });
  while (m.phase === "countdown") stepMatch(m, {}, DEFAULT_SIM_CONFIG);
  const leadLog: PlayerInput[] = [];
  const trailLog: PlayerInput[] = [];
  const ticks: JointTick[] = [];
  const pauses = (tick: number) => tick % (4 * TICK_HZ) < 1.2 * TICK_HZ;
  const [leader, trailer] = m.players;
  while (m.phase === "climb" && ticks.length < 20_000) {
    const li = leader.status === "climbing" ? botInput(leader, tower, m.tick) : NO_INPUT;
    const ti =
      trailer.status === "climbing" && !pauses(m.tick) ? botInput(trailer, tower, m.tick) : NO_INPUT;
    leadLog.push(li);
    trailLog.push(ti);
    stepMatch(m, { lead: li, trail: ti }, DEFAULT_SIM_CONFIG);
    ticks.push({
      hazardY: m.hazardY,
      leaderY: leader.y,
      leaderStatus: leader.status,
      trailerStatus: trailer.status,
      leaderJetpack: isPowerUpActive(leader, "jetpack", m.tick),
      lavaPowerUp: m.players.some(
        (p) => isPowerUpActive(p, "slow-lava", m.tick) || isPowerUpActive(p, "harden-lava", m.tick)
      ),
    });
  }
  return { leadLog, trailLog, ticks, trailer };
}

/**
 * The trailer's own client: integrates only slot 1 from its input log, with
 * the leader slaved to the joint run's position `lagTicks` behind.
 */
function trailerClient(seed: string, trailLog: PlayerInput[], joint: JointTick[], lagTicks: number) {
  const tower = buildTower(SLUG, { runSeed: seed });
  const c = createMatch({ seed, mode: "multiplayer", tower, playerIds: ["lead", "trail"] });
  while (c.phase === "countdown") stepMatch(c, {}, DEFAULT_SIM_CONFIG);
  const [ghost, me] = c.players;
  const hazard: number[] = [];
  for (let i = 0; i < trailLog.length && c.phase === "climb"; i++) {
    const snap = joint[i - 1 - lagTicks];
    if (snap) {
      ghost.y = snap.leaderY;
      ghost.peakY = Math.max(ghost.peakY, snap.leaderY);
      ghost.status = snap.leaderStatus;
    }
    stepMatch(c, { 1: trailLog[i] }, DEFAULT_SIM_CONFIG, { localSlot: 1 });
    hazard.push(c.hazardY);
    if (me.status !== "climbing") break;
  }
  return { hazard, finishedTick: me.finishedTick, peakY: me.peakY };
}

describe("trailer's client and the server re-sim agree during the leader's burst", () => {
  // A seed where the greedy leader picks up a jetpack while the trailer is
  // still climbing, and nobody holds slow-lava or harden-lava (those peer
  // flags are a separate, pre-existing desync: SEC-LAVA-8).
  const SEED = "duel-burst-11";
  const duel = once(() => {
    const joint = playJointDuel(SEED);
    const res = simulateDuel(
      SEED, SLUG, "lead", "trail", joint.leadLog, joint.trailLog, DEFAULT_SIM_CONFIG
    );
    return { ...joint, res };
  });

  it("simulateDuel reproduces the live joint duel", () => {
    const { ticks, trailer, res } = duel();
    expect(trailer.finishedTick).not.toBeNull();
    expect(res.winnerId).toBe("lead");
    expect(res.player2Peak).toBe(trailer.peakY);
    expect(res.totalTicks).toBe(ticks.length);
  });

  for (const lagTicks of [0, 6, 10]) {
    it(`the local hazard equals the server's every tick with a ${lagTicks}-tick ghost lag`, () => {
      const { trailLog, ticks, res } = duel();

      // Fixture guards: the leader bursts on a jetpack while ahead of the
      // leash (so a leader-keyed leash would read the lagged ghost), and no
      // lava power-up is in play while the trailer climbs.
      const live = ticks.filter((t) => t.trailerStatus === "climbing");
      expect(live.some((t) => t.leaderJetpack && t.leaderY - t.hazardY > HAZARD_LEASH_M)).toBe(true);
      expect(live.some((t) => t.lavaPowerUp)).toBe(false);

      const client = trailerClient(SEED, trailLog, ticks, lagTicks);
      let compared = 0;
      for (let i = 0; i < client.hazard.length; i++) {
        expect(client.hazard[i], `tick ${i}`).toBe(ticks[i].hazardY);
        compared += 1;
      }
      expect(compared).toBeGreaterThan(30 * TICK_HZ);
      // Same death, same score as the authoritative result.
      expect(client.finishedTick).not.toBeNull();
      expect(client.peakY).toBe(res.player2Peak);
      expect(client.hazard.length).toBe(live.length + 1);
    });
  }
});
