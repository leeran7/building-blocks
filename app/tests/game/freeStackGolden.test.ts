/**
 * Golden pin for the game every existing mode plays today.
 *
 * The level system (loop design: xp-and-levels) threads a per-level
 * difficulty, power-up set and goal through towers.ts, obstacles.ts,
 * powerups.ts and stepMatch. Every one of those changes must leave the free
 * stack, Daily Climb and duels bit-identical: stored replays, the Daily
 * verifier and duel settlement all re-simulate on this engine, and
 * DAILY_SIM_VERSION is not bumped for level-only features.
 *
 * So this file fingerprints the real outputs, not the source:
 *   - tower geometry past the floor-50 ramp cap (heights, platforms,
 *     ladders, crates, orbs) on the free tower and a category tower;
 *   - a greedy-bot solo run through stepMatch, tick by tick, on a run that
 *     collects random orbs (the RNG path a re-sim must reproduce);
 *   - a Daily Climb run through verifyDailyReplay;
 *   - a duel through simulateDuel.
 *
 * If one of these hashes changes, the free stack / Daily / duels changed.
 * That is only acceptable together with a DAILY_SIM_VERSION bump and a note
 * in the PR saying why; update the pinned value in the same change.
 */

import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";

import {
  createMatch,
  simulateDuel,
  stepMatch,
  DEFAULT_SIM_CONFIG,
} from "../../src/game/simulation";
import { applyRunSeed, buildTower, floorHeight, laddersForFloor, platformsForFloor } from "../../src/game/towers";
import { obstaclesForFloor } from "../../src/game/obstacles";
import { powerUpForFloor } from "../../src/game/powerups";
import { buildFreeTower } from "../../src/game/freeStack";
import { decodeRunReplay, encodeRunReplay } from "../../src/game/runReplay";
import { verifyDailyReplay } from "../../src/game/dailyVerify";
import { dailySeedFor } from "../../src/lib/dailySeedServer";
import { TEST_DAILY_SEED_SECRET } from "../lib/dailySeedTestSecret";
import type { MatchState, PlayerId, PlayerInput, TowerSpec } from "../../src/game/types";
import { botInput } from "./greedyBot";

vi.stubEnv("DAILY_SEED_SECRET", TEST_DAILY_SEED_SECRET);

// ── Pinned values (DAILY_SIM_VERSION 5: the lava stumble shortened 6 s → 4 s
// in a 14 s cycle, which moves every run, Daily and duel; geometry unchanged
// since 4: the free stack's hanging ladders and short tops, ENDLESS_LADDERS) ──
const PIN_FREE_GEOMETRY = "3d83d67129408b3d233a4b6856ee5075decf8df638386b23f36a292c45830ada";
const PIN_CATEGORY_GEOMETRY = "7247ce3db432cf7d57e48b86b3a786dfb9912ddc93326980f35a98cbf214679d";
const PIN_SOLO_OUTCOME = { peakY: 607.89594026198, finishedTick: 3246, ticks: 3246 };
const PIN_SOLO_TRACE = "4f19eebbb735c7100bedbbbb7570061ff90555bc6206e3c8cbfd82a1ed4b9bca";
const PIN_DAILY = {
  ok: true,
  peakY: 543.6080763773122,
  ticks: 3295,
  inputHash: "a94126d121ae26d021085be3c58979840e7c86fedd39784197ca1e1421d42adf",
};
const PIN_DAILY_TRACE = "e048e38f1acd50374c7fd7be74501928ef0f9c5e16143ef3f166005f0ec474e9";
const PIN_DUEL_TRACE = "b3e1e37f850d990ecc95ccc8560b1fa4a21f7aa52ed28c456e282cf79c2baa98";
const PIN_DUEL_RESULT = {
  winnerId: "p1",
  player1Peak: 451.1868711715919,
  player2Peak: 426.8568452123174,
  player1CheatFlagged: false,
  player2CheatFlagged: false,
  tiebreakRule: null,
  finishedTick: 2506,
  totalTicks: 2506,
};

/** Past DIFFICULTY_FLOORS (50), so the held late-game values are pinned too. */
const FLOORS = 120;
const MAX_BOT_TICKS = 20_000;
/** randomOrb.test.ts: this run collects random orbs (ticks ~734 and ~1237). */
const CATEGORY = "indie-games";
const SOLO_SEED = "a";
/** randomOrb.test.ts: this Daily tower's bot run collects a random orb. */
const DAILY_DAY = "2026-10-21";
const DAILY_NOW = new Date(`${DAILY_DAY}T12:00:00Z`);

function sha(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function geometry(tower: TowerSpec) {
  const floors = [];
  for (let i = 0; i < FLOORS; i++) {
    floors.push({
      y: floorHeight(tower, i),
      platforms: platformsForFloor(tower, i),
      ladders: laddersForFloor(tower, i),
      obstacles: obstaclesForFloor(tower, i),
      orb: powerUpForFloor(tower, i),
    });
  }
  return floors;
}

interface BotRun {
  live: MatchState;
  log: Record<PlayerId, PlayerInput>[];
  trace: number[][];
  randomPicks: number;
}

/** Greedy bot for every player until the match ends; records a per-tick trace. */
function botRun(init: Parameters<typeof createMatch>[0]): BotRun {
  const live = createMatch(init);
  while (live.phase === "countdown") stepMatch(live, {}, DEFAULT_SIM_CONFIG);
  const log: Record<PlayerId, PlayerInput>[] = [];
  const trace: number[][] = [];
  let randomPicks = 0;
  while (live.phase === "climb" && log.length < MAX_BOT_TICKS) {
    const inputs: Record<PlayerId, PlayerInput> = {};
    for (const p of live.players) inputs[p.id] = botInput(p, init.tower, live.tick);
    log.push(inputs);
    const openRandom = new Set(
      live.powerUps.filter((pu) => pu.type === "random" && !pu.collected).map((pu) => pu.id)
    );
    stepMatch(live, inputs, DEFAULT_SIM_CONFIG);
    randomPicks += live.powerUps.filter((pu) => openRandom.has(pu.id) && pu.collected).length;
    trace.push([live.hazardY, ...live.players.flatMap((p) => [p.x, p.y, p.vy])]);
  }
  return { live, log, trace, randomPicks };
}

describe("golden: free-stack geometry", () => {
  it("the free tower and a category tower generate exactly as today", () => {
    const free = geometry(applyRunSeed(buildFreeTower(), "golden-free"));
    const category = geometry(buildTower(CATEGORY, { runSeed: SOLO_SEED }));

    // Fixture guards: the pinned range really contains every generated kind.
    for (const floors of [free, category]) {
      expect(floors.filter((f) => f.obstacles.length > 0).length).toBeGreaterThan(0);
      expect(floors.filter((f) => f.orb !== null).length).toBeGreaterThan(0);
      expect(floors.filter((f) => f.platforms.length > 1).length).toBeGreaterThan(0);
      expect(floors.filter((f) => f.ladders.length > 1).length).toBeGreaterThan(0);
    }
    expect(free.filter((f) => f.orb?.type === "random").length).toBeGreaterThan(0);
    // The free stack ramps in hanging ladders and short tops; categories never do.
    const hanging = (fs: typeof free) =>
      fs.filter((f) => f.ladders.some((l) => l.y0 > f.y + 1e-9)).length;
    const shortTop = (fs: typeof free) =>
      fs.filter((f, i) => i + 1 < fs.length && f.ladders.some((l) => l.y1 < fs[i + 1].y - 1e-9)).length;
    expect(hanging(free)).toBeGreaterThan(0);
    expect(shortTop(free)).toBeGreaterThan(0);
    expect(hanging(category) + shortTop(category)).toBe(0);

    expect(sha(free)).toBe(PIN_FREE_GEOMETRY);
    expect(sha(category)).toBe(PIN_CATEGORY_GEOMETRY);
  });
});

describe("golden: stepMatch", () => {
  it("a solo bot run that collects random orbs steps exactly as today", () => {
    const run = botRun({
      seed: SOLO_SEED,
      mode: "solo",
      tower: buildTower(CATEGORY, { runSeed: SOLO_SEED }),
      playerIds: ["bot"],
    });
    expect(run.randomPicks).toBeGreaterThan(0);
    expect(run.trace.length).toBeGreaterThan(30 * 30);
    const p = run.live.players[0];
    expect({ peakY: p.peakY, finishedTick: p.finishedTick, ticks: run.trace.length }).toEqual(
      PIN_SOLO_OUTCOME
    );
    expect(sha(run.trace)).toBe(PIN_SOLO_TRACE);
  });

  it("a Daily Climb run verifies to the same peak as today", async () => {
    const seed = dailySeedFor(DAILY_DAY);
    const run = botRun({
      seed,
      mode: "solo",
      tower: applyRunSeed(buildFreeTower(), seed),
      playerIds: ["you"],
    });
    expect(run.randomPicks).toBeGreaterThan(0);
    const peakY = run.live.players[0].peakY;
    const token = await encodeRunReplay({ seed, peakY, inputs: run.log.map((t) => t.you) });
    const replay = await decodeRunReplay(token as string);
    expect(replay).not.toBeNull();
    const verdict = verifyDailyReplay(replay!, peakY, DAILY_NOW);
    expect(verdict).toMatchObject(PIN_DAILY);
    expect(sha(run.trace)).toBe(PIN_DAILY_TRACE);
  });

  it("a duel settles exactly as today", () => {
    const seed = "golden-duel";
    const run = botRun({
      seed,
      mode: "multiplayer",
      tower: buildTower(CATEGORY, { runSeed: seed }),
      playerIds: ["p1", "p2"],
    });
    const result = simulateDuel(
      seed,
      CATEGORY,
      "p1",
      "p2",
      run.log.map((t) => t.p1),
      run.log.map((t) => t.p2)
    );
    expect(result.totalTicks).toBeGreaterThan(30 * 30);
    expect(result).toEqual(PIN_DUEL_RESULT);
    expect(sha(run.trace)).toBe(PIN_DUEL_TRACE);
  });
});
