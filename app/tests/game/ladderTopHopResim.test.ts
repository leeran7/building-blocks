/**
 * Server re-simulation of runs that use the ladder top hop.
 *
 * The Daily (verifyDailyReplay) and duels (simulateDuel) decide scores by
 * re-running the client's input log through stepMatch. The top hop adds
 * player state (PlayerState.ladderTopHop) that changes air speed on later
 * ticks, so a replay only matches if that state is rebuilt from inputs alone.
 * Neither the golden greedy bot nor the scripted Daily fixture ever jumps off
 * a ladder, so before this file no re-sim fixture fired a single hop.
 *
 * Every run here is recorded the way the client records it (input logged,
 * then stepped) with a bot that climbs like the greedy bot but jumps off each
 * ladder a beat before its top with a direction held. Each run asserts the
 * hop fired (count > 0) and landed on the floor above before trusting the
 * re-simulation.
 */

import { describe, expect, it, vi } from "vitest";
import { buildFreeTower } from "../../src/game/freeStack";
import {
  LADDER_TOP_HOP_AIR_SPEED_FRAC,
  LADDER_TOP_HOP_WINDOW_M,
  applyRunSeed,
  buildTower,
  floorHeight,
  laddersForFloor,
} from "../../src/game/towers";
import { DEFAULT_SIM_CONFIG, createMatch, simulateDuel, stepMatch, type SimConfig } from "../../src/game/simulation";
import { DEFAULT_HAZARD_CONFIG } from "../../src/game/hazard";
import { decodeRunReplay, encodeRunReplay } from "../../src/game/runReplay";
import { resimulateSoloRun, verifyDailyReplay } from "../../src/game/dailyVerify";
import { dailySeedFor } from "../../src/lib/dailySeedServer";
import { TEST_DAILY_SEED_SECRET } from "../lib/dailySeedTestSecret";
import type { MatchState, PlayerInput, PlayerState, TowerSpec } from "../../src/game/types";
import { botInput } from "./greedyBot";

vi.stubEnv("DAILY_SEED_SECRET", TEST_DAILY_SEED_SECRET);

const DAY = "2026-09-26";
const MIDDAY = new Date("2026-09-26T12:00:00Z");

/** Jump-off point under the top rung: inside the hop window, off the 0.3 m climb lattice's edges. */
const HOP_FROM_M = { min: 0.3, max: LADDER_TOP_HOP_WINDOW_M - 0.1 } as const;

interface HopStats {
  /** Rising edges of PlayerState.ladderTopHop. */
  hops: number;
  /** Hops that ended standing on the floor the ladder led to. */
  landedAbove: number;
  /** Airborne hop ticks with a direction held (the capped air speed ran). */
  cappedAirTicks: number;
}

/**
 * Greedy bot, except on a ladder whose top is within HOP_FROM_M it jumps off
 * with a direction (alternating per hop), and holds that direction until the
 * hop settles.
 */
function makeHopBot(): (p: PlayerState, tower: TowerSpec, tick: number) => PlayerInput {
  let dir: -1 | 1 = 1;
  return (p, tower, tick) => {
    if (p.ladderTopHop) return { moveX: dir, jump: false, climbY: 1, usePowerUp: false };
    if (p.onLadder && p.ladderIx !== null && p.ladderSlot !== null) {
      const l = laddersForFloor(tower, p.ladderIx)[p.ladderSlot];
      const below = l ? l.y1 - p.y : Infinity;
      if (below > HOP_FROM_M.min && below <= HOP_FROM_M.max) {
        dir = dir === 1 ? -1 : 1;
        return { moveX: dir, jump: true, climbY: 1, usePowerUp: false };
      }
    }
    return botInput(p, tower, tick);
  };
}

/** Per-player hop bookkeeping around one stepMatch call. */
function tracker() {
  const stats: HopStats = { hops: 0, landedAbove: 0, cappedAirTicks: 0 };
  let wasHop = false;
  let targetY = 0;
  let ladderX = 0;
  return {
    stats,
    before(p: PlayerState, tower: TowerSpec) {
      if (p.onLadder && p.ladderIx !== null) {
        targetY = floorHeight(tower, p.ladderIx + 1);
        ladderX = p.x;
      }
    },
    after(p: PlayerState, tower: TowerSpec) {
      if (p.ladderTopHop && !wasHop) stats.hops++;
      // The jump tick itself leaves the ladder without moving x; the cap
      // applies from the first airborne tick.
      if (p.ladderTopHop && wasHop && p.vx !== 0) {
        expect(Math.abs(p.vx)).toBe(tower.moveSpeed * LADDER_TOP_HOP_AIR_SPEED_FRAC);
        stats.cappedAirTicks++;
      }
      if (wasHop && !p.ladderTopHop && p.onGround && p.y === targetY) {
        // Landed inside the band kept solid either side of an arriving ladder.
        const d = Math.abs(p.x - ladderX);
        expect(Math.min(d, tower.widthM - d)).toBeLessThanOrEqual(tower.ladderGrabRadius + 2);
        stats.landedAbove++;
      }
      wasHop = p.ladderTopHop;
    },
  };
}

function toCountdownEnd(state: MatchState, cfg: SimConfig = DEFAULT_SIM_CONFIG): void {
  while (state.phase === "countdown") stepMatch(state, {}, cfg);
}

describe("Daily re-sim: a run that uses the top hop", () => {
  it("verifyDailyReplay and resimulateSoloRun rebuild the live run exactly", async () => {
    const seed = dailySeedFor(DAY);
    const tower = applyRunSeed(buildFreeTower(), seed);
    // Built as useClimb builds a daily run (player "you").
    const live = createMatch({ seed, mode: "solo", tower, playerIds: ["you"] });
    toCountdownEnd(live);
    const bot = makeHopBot();
    const track = tracker();
    const inputs: PlayerInput[] = [];
    while (live.phase === "climb" && inputs.length < 1800) {
      const p = live.players[0];
      const input = bot(p, tower, live.tick);
      inputs.push({ ...input });
      track.before(p, tower);
      stepMatch(live, { you: input });
      track.after(live.players[0], tower);
    }
    const livePlayer = live.players[0];

    // The fixture must actually hop, land on the floor above, and steer capped.
    expect(track.stats.hops).toBeGreaterThanOrEqual(3);
    expect(track.stats.landedAbove).toBeGreaterThan(0);
    expect(track.stats.cappedAirTicks).toBeGreaterThan(0);
    expect(livePlayer.peakY).toBeGreaterThan(floorHeight(tower, 3));

    const re = resimulateSoloRun(seed, inputs);
    expect(re.player).toEqual(livePlayer);
    expect(re.state.tick).toBe(live.tick);

    const token = await encodeRunReplay({ seed, peakY: livePlayer.peakY, inputs });
    const decoded = await decodeRunReplay(token!);
    expect(decoded).not.toBeNull();
    const verdict = verifyDailyReplay(decoded!, livePlayer.peakY, MIDDAY);
    expect(verdict.ok).toBe(true);
    if (verdict.ok) expect(verdict.peakY).toBe(livePlayer.peakY);
  });
});

describe("duel re-sim: one climber hops off ladder tops, the other climbs", () => {
  it("simulateDuel reproduces the live peaks, winner and no cheat flag", () => {
    const seed = "duel-top-hop-seed";
    const slug = "indie-games";
    const cfg: SimConfig = { ...DEFAULT_SIM_CONFIG, hazard: { ...DEFAULT_HAZARD_CONFIG, speedScale: 0.0001 } };
    const tower = buildTower(slug, { runSeed: seed });
    const live = createMatch({ seed, mode: "multiplayer", tower, playerIds: ["p1", "p2"] });
    toCountdownEnd(live, cfg);
    const hopBot = makeHopBot();
    const track = tracker();
    const log1: PlayerInput[] = [];
    const log2: PlayerInput[] = [];
    for (let t = 0; t < 1200 && live.phase === "climb"; t++) {
      const [a, b] = live.players;
      const i1 = hopBot(a!, tower, live.tick);
      const i2 = botInput(b!, tower, live.tick);
      log1.push({ ...i1 });
      log2.push({ ...i2 });
      track.before(a!, tower);
      stepMatch(live, { p1: i1, p2: i2 }, cfg);
      track.after(live.players[0]!, tower);
    }
    expect(track.stats.hops).toBeGreaterThanOrEqual(3);
    expect(track.stats.landedAbove).toBeGreaterThan(0);
    expect(track.stats.cappedAirTicks).toBeGreaterThan(0);

    const result = simulateDuel(seed, slug, "p1", "p2", log1, log2, cfg);
    expect(result.player1Peak).toBe(live.players[0]!.peakY);
    expect(result.player2Peak).toBe(live.players[1]!.peakY);
    expect(result.winnerId).toBe(live.winnerId);
    expect(result.player1CheatFlagged).toBe(false);
    expect(result.player1CheatFlagged).toBe(live.players[0]!.cheatFlagged);
  });
});
