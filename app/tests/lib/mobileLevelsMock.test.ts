/**
 * The device-local level store the mobile level screens run on until the
 * server routes land (mobile/src/lib/levels/mockClient). It is play-test
 * scaffolding, but the screens read lives, stars and XP from it, so the doc's
 * rules it follows (§4 stars, §5a XP, §5b lives) are pinned here.
 */

import { describe, expect, it, vi } from "vitest";
import {
  createMockLevelsClient,
  LIFE_REFILL_MS,
  MAX_LIVES,
  parseMockState,
  refillLives,
  xpForPlayerLevel,
  type MockState,
} from "../../mobile/src/lib/levels/mockClient";
import { feetShort, formatClock, isHardLevel, starsForTime } from "../../mobile/src/lib/levels/model";
import { TICK_HZ } from "../../src/game/types";

function harness(start = 1_000_000) {
  let now = start;
  let stored: string | null = null;
  const client = createMockLevelsClient({
    now: () => now,
    load: () => stored,
    save: (raw) => {
      stored = raw;
    },
  });
  return {
    client,
    advance: (ms: number) => {
      now += ms;
    },
    stored: () => stored,
  };
}

/** Ticks for a finish time in ms. */
const ticks = (ms: number) => Math.round((ms / 1000) * TICK_HZ);

async function clear(client: ReturnType<typeof harness>["client"], level: number, ms: number) {
  const start = await client.startLevel(level);
  if (!start.ok) throw new Error(`level ${level} refused: ${start.code}`);
  return client.submitResult(start.ticket.id, {
    level,
    finished: true,
    finishedTick: ticks(ms),
    raceTicks: ticks(ms),
    peakFt: start.ticket.goalFt,
    replayToken: null,
  });
}

async function lose(client: ReturnType<typeof harness>["client"], level: number) {
  const start = await client.startLevel(level);
  if (!start.ok) throw new Error(`level ${level} refused: ${start.code}`);
  return client.submitResult(start.ticket.id, { level, finished: false, finishedTick: null, raceTicks: 300, peakFt: 10, replayToken: "r" });
}

describe("mock level store", () => {
  it("opens on level 1 with full lives and a 300-level season", async () => {
    const { client } = harness();
    const season = await client.getSeason();
    expect(season.levels).toHaveLength(300);
    expect(season.frontier).toBe(1);
    expect(season.player.lives).toBe(MAX_LIVES);
    expect(season.player.nextLifeAt).toBeNull();
    expect(season.levels[0].seed).toBe("s1:level:1:0");
  });

  it("makes every level's goal higher than the one before it", async () => {
    const { levels } = await harness().client.getSeason();
    let checked = 0;
    for (let i = 1; i < levels.length; i++) {
      expect(levels[i].goalFt).toBeGreaterThanOrEqual(levels[i - 1].goalFt);
      checked++;
    }
    expect(checked).toBe(299);
  });

  it("refuses a level beyond the frontier", async () => {
    const { client } = harness();
    expect(await client.startLevel(2)).toEqual({ ok: false, code: "LOCKED" });
    await clear(client, 1, 5_000);
    expect((await client.startLevel(2)).ok).toBe(true);
  });

  it("keeps tutorial levels free and spends a life from level 11, refunding it on a clear", async () => {
    const { client } = harness();
    for (let n = 1; n <= 10; n++) await clear(client, n, 1_000);
    expect((await client.getSeason()).player.lives).toBe(MAX_LIVES);

    const start = await client.startLevel(11);
    expect(start.ok && start.ticket.player.lives).toBe(MAX_LIVES - 1);
    if (!start.ok) return;
    const result = await client.submitResult(start.ticket.id, {
      level: 11,
      finished: true,
      finishedTick: ticks(1_000),
      raceTicks: ticks(1_000),
      peakFt: start.ticket.goalFt,
      replayToken: null,
    });
    expect(result.player.lives).toBe(MAX_LIVES);
  });

  it("refuses to start once lives run out, then refills one per 30 minutes keeping partial time", async () => {
    const h = harness();
    for (let n = 1; n <= 10; n++) await clear(h.client, n, 1_000);
    for (let i = 0; i < MAX_LIVES; i++) await lose(h.client, 11);

    const refused = await h.client.startLevel(11);
    expect(refused.ok).toBe(false);
    if (refused.ok) return;
    expect(refused.code).toBe("OUT_OF_LIVES");
    expect(refused.player?.lives).toBe(0);

    h.advance(LIFE_REFILL_MS + 60_000);
    const season = await h.client.getSeason();
    expect(season.player.lives).toBe(1);
    // The spare minute carries over: the next life is 29 minutes away.
    expect(season.player.nextLifeAt! - (1_000_000 + LIFE_REFILL_MS + 60_000)).toBe(LIFE_REFILL_MS - 60_000);
  });

  it("awards stars by finish time and XP for the first clear and each new star only", async () => {
    const { client } = harness();
    const { levels } = await client.getSeason();
    const pars = levels[0].pars;

    const first = await clear(client, 1, pars.twoStarMs - 100);
    expect(first.stars).toBe(2);
    expect(first.xpGained).toBe(50 + 5 * 1 + 25 * 2);

    const same = await clear(client, 1, pars.twoStarMs - 100);
    expect(same.previousStars).toBe(2);
    expect(same.xpGained).toBe(0);

    const better = await clear(client, 1, pars.threeStarMs - 100);
    expect(better.stars).toBe(3);
    expect(better.xpGained).toBe(25);
    expect((await client.getSeason()).levels[0].bestMs).toBe(better.timeMs);
  });

  it("doubles first-clear XP on Hard levels", async () => {
    const { client } = harness();
    for (let n = 1; n <= 4; n++) await clear(client, n, 1_000);
    const hard = await clear(client, 5, 1_000);
    expect(hard.xpGained).toBe((50 + 5 * 5) * 2 + 25 * 3);
  });

  it("adds the episode bonus on the first clear of an episode's last level only", async () => {
    const { client } = harness();
    for (let n = 1; n <= 14; n++) await clear(client, n, 1_000);
    const last = await clear(client, 15, 1_000);
    expect(last.xpGained).toBe((50 + 5 * 15) * 2 + 25 * 3 + 250);
    expect((await clear(client, 15, 1_000)).xpGained).toBe(0);
  });

  it("keeps each account's progress apart on one device", async () => {
    const store = new Map<string, string>();
    const stub = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
    };
    vi.stubGlobal("localStorage", stub);
    try {
      await clear(createMockLevelsClient({ accountId: "a" }), 1, 1_000);
      expect((await createMockLevelsClient({ accountId: "a" }).getSeason()).frontier).toBe(2);
      expect((await createMockLevelsClient({ accountId: "b" }).getSeason()).frontier).toBe(1);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("rejects a ticket that was already used", async () => {
    const { client } = harness();
    const start = await client.startLevel(1);
    if (!start.ok) throw new Error("refused");
    const run = { level: 1, finished: false, finishedTick: null, raceTicks: 90, peakFt: 1, replayToken: null };
    await client.submitResult(start.ticket.id, run);
    await expect(client.submitResult(start.ticket.id, run)).rejects.toThrow();
  });

  it("survives a reload from storage", async () => {
    const h = harness();
    await clear(h.client, 1, 1_000);
    const reloaded = createMockLevelsClient({ now: () => 1_000_000, load: h.stored, save: () => {} });
    expect((await reloaded.getSeason()).frontier).toBe(2);
  });
});

describe("parseMockState", () => {
  const valid: MockState = {
    progress: { "1": { stars: 3, bestMs: 9000 } },
    lives: 4,
    livesUpdatedAt: 5,
    xp: 120,
    openTicket: null,
    streak: 2,
    fails: { season: 1, level: 2, count: 1 },
  };

  it("accepts a well-formed state", () => {
    expect(parseMockState(JSON.stringify(valid))).toEqual(valid);
  });

  it.each([
    ["not json", "{"],
    ["a non-numeric level key", JSON.stringify({ ...valid, progress: { abc: { stars: 1, bestMs: 1 } } })],
    ["a star count out of range", JSON.stringify({ ...valid, progress: { "1": { stars: 4, bestMs: 1 } } })],
    ["missing lives", JSON.stringify({ ...valid, lives: "5" })],
  ])("rejects %s", (_, raw) => {
    expect(parseMockState(raw)).toBeNull();
  });
});

describe("refillLives", () => {
  const base: MockState = { progress: {}, lives: 2, livesUpdatedAt: 0, xp: 0, openTicket: null, streak: 0 };

  it("adds nothing before a full step and caps at the max", () => {
    expect(refillLives(base, LIFE_REFILL_MS - 1).lives).toBe(2);
    expect(refillLives(base, LIFE_REFILL_MS * 2).lives).toBe(4);
    expect(refillLives(base, LIFE_REFILL_MS * 10).lives).toBe(MAX_LIVES);
  });
});

describe("level model helpers", () => {
  const pars = { twoStarMs: 20_000, threeStarMs: 15_000 };

  it("gives 3, 2 or 1 stars against the pars", () => {
    expect(starsForTime(15_000, pars)).toBe(3);
    expect(starsForTime(15_001, pars)).toBe(2);
    expect(starsForTime(20_000, pars)).toBe(2);
    expect(starsForTime(20_001, pars)).toBe(1);
  });

  it("marks every 5th level Hard", () => {
    expect([1, 4, 5, 6, 10, 300].map(isHardLevel)).toEqual([false, false, true, false, true, true]);
  });

  it("formats clocks and the distance short of the summit", () => {
    expect(formatClock(28_000)).toBe("0:28");
    expect(formatClock(64_200)).toBe("1:05");
    expect(feetShort({ goalFt: 267, peakFt: 233.4 })).toBe(34);
    expect(feetShort({ goalFt: 100, peakFt: 140 })).toBe(0);
  });

  it("prices player levels by the doc's curve", () => {
    expect(xpForPlayerLevel(1)).toBe(60);
    expect(xpForPlayerLevel(2)).toBe(153);
    expect(xpForPlayerLevel(10)).toBeGreaterThan(xpForPlayerLevel(9));
  });
});

describe("win streaks on the device store", () => {
  it("count first clears at the frontier and start L4 with a rapid climb after 3", async () => {
    const { client } = harness();
    for (let level = 1; level <= 3; level++) await clear(client, level, 20_000);
    const season = await client.getSeason();
    expect(season).toMatchObject({ streak: 3, nextStartPowerUp: { type: "rapid-climb", source: "streak" } });
    const start = await client.startLevel(4);
    expect(start).toMatchObject({ ok: true, ticket: { startPowerUp: { type: "rapid-climb", source: "streak" } } });
  });

  it("ignore replays and reset on a frontier loss", async () => {
    const { client } = harness();
    for (let level = 1; level <= 3; level++) await clear(client, level, 20_000);
    expect(await lose(client, 1)).toMatchObject({ atFrontier: false, streak: 3 });
    expect(await lose(client, 4)).toMatchObject({ atFrontier: true, streak: 0 });
    expect((await client.startLevel(4)).ok && (await client.getSeason()).nextStartPowerUp).toBeNull();
  });
});
