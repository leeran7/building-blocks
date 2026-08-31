/**
 * Free-climb records are per board. A desktop peak must not take mobile rank 1
 * (or vice versa). These drive recordClimb / topFreeClimbers against the
 * in-memory Prisma stand-in — not by grepping the where clause.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { store, resetStore, fakePrisma } from "./fakePrisma";
import {
  recordClimb,
  topFreeClimbers,
  getUserFreeClimbRecords,
  getGlobalClimbStats,
  freeClimbBoardOccupied,
  probeFreeClimbBoardOccupied,
} from "../../src/db/climb";
import type { ClimbBoard } from "../../src/game/climbBoard";
import type { ClimbResultInput } from "../../src/db/climb";
import { FREE_STACK_SLUG } from "../../src/game/freeStack";

vi.mock("../../src/db/client", async () => {
  const { fakePrisma } = await import("./fakePrisma");
  return { prisma: fakePrisma };
});

describe("recordClimb / topFreeClimbers — board isolation", () => {
  beforeEach(() => {
    resetStore();
  });

  it("does not let a desktop peak rank on the mobile board", async () => {
    await save("alice", "mobile", 100);
    await save("bob", "desktop", 999);

    const mobile = await topFreeClimbers(50, "mobile");
    expect(mobile.map((c) => c.userId)).toEqual(["alice"]);
    expect(mobile[0]?.rank).toBe(1);
    expect(mobile[0]?.peakY).toBe(100);

    const desktop = await topFreeClimbers(50, "desktop");
    expect(desktop.map((c) => c.userId)).toEqual(["bob"]);
    expect(desktop[0]?.peakY).toBe(999);
  });

  it("defaults topFreeClimbers to the mobile board", async () => {
    await save("alice", "mobile", 10);
    await save("bob", "desktop", 500);

    const listed = await topFreeClimbers(50);
    expect(listed.map((c) => c.userId)).toEqual(["alice"]);
  });

  it("ranks the same user independently on each board", async () => {
    await save("sam", "mobile", 50);
    await save("sam", "desktop", 200);

    const mobile = await topFreeClimbers(10, "mobile");
    const desktop = await topFreeClimbers(10, "desktop");
    expect(mobile[0]?.peakY).toBe(50);
    expect(desktop[0]?.peakY).toBe(200);
    expect(store.climbRecords).toHaveLength(2);
  });

  it("raising a mobile peak does not raise the desktop record", async () => {
    await save("sam", "mobile", 100);
    await save("sam", "desktop", 40);
    await save("sam", "mobile", 180);

    const desktop = await topFreeClimbers(10, "desktop");
    const mobile = await topFreeClimbers(10, "mobile");
    expect(desktop[0]?.peakY).toBe(40);
    expect(mobile[0]?.peakY).toBe(180);
  });

  it("computes rank only against the same board", async () => {
    const low = await save("low", "mobile", 10);
    await save("high", "desktop", 10_000);

    expect(low.rank).toBe(1);
    expect(low.totalClimbers).toBe(1);
    expect(low.board).toBe("mobile");
  });

  it("returns both boards for a user, mobile first", async () => {
    await save("sam", "desktop", 40);
    await save("sam", "mobile", 12);

    const standing = await getUserFreeClimbRecords("sam");
    expect(standing?.boards.map((b) => b.board)).toEqual(["mobile", "desktop"]);
    expect(standing?.boards[0]?.peakY).toBe(12);
    expect(standing?.boards[1]?.peakY).toBe(40);
  });
});

describe("historical cutover (AC-15, AC-16)", () => {
  beforeEach(() => {
    resetStore();
  });

  it("lists a pre-split row on Desktop not Mobile; later Mobile persist is P, Desktop stays H", async () => {
    const historicalH = 40;
    const laterMobileP = 8;
    store.users.riley = { id: "riley", display_name: "Riley" };
    store.climbRecords.push({
      id: "pre-split",
      userId: "riley",
      category_slug: FREE_STACK_SLUG,
      board: "desktop",
      peak_y: historicalH,
      wins: 1,
      updated_at: new Date("2026-08-25T00:00:00Z"),
    });

    const mobileBefore = await topFreeClimbers(50, "mobile");
    const desktopBefore = await topFreeClimbers(50, "desktop");
    expect(mobileBefore.map((c) => c.userId)).toEqual([]);
    expect(desktopBefore.map((c) => c.userId)).toEqual(["riley"]);
    expect(desktopBefore[0]?.peakY).toBe(historicalH);

    const saved = await save("riley", "mobile", laterMobileP);
    expect(saved.peakY).toBe(laterMobileP);
    expect(saved.board).toBe("mobile");

    const mobileAfter = await topFreeClimbers(50, "mobile");
    const desktopAfter = await topFreeClimbers(50, "desktop");
    expect(mobileAfter[0]?.peakY).toBe(laterMobileP);
    expect(desktopAfter[0]?.peakY).toBe(historicalH);
    expect(store.climbRecords).toHaveLength(2);
  });
});

describe("getGlobalClimbStats (AC-20, AC-21)", () => {
  beforeEach(() => {
    resetStore();
  });

  it("counts distinct climbers across boards and takes Top climb from Mobile only", async () => {
    await save("maya", "mobile", 10);
    await save("drew", "desktop", 999);

    const stats = await getGlobalClimbStats();
    expect(stats.climberCount).toBe(2);
    expect(stats.topPeak).toBe(10);
  });

  it("returns null topPeak when Mobile is empty even if Desktop has a max", async () => {
    await save("drew", "desktop", 999);

    const stats = await getGlobalClimbStats();
    expect(stats.climberCount).toBe(1);
    expect(stats.topPeak).toBeNull();
  });

  it("counts a user on both boards once", async () => {
    await save("riley", "desktop", 40);
    await save("riley", "mobile", 12);

    const stats = await getGlobalClimbStats();
    expect(stats.climberCount).toBe(1);
    expect(stats.topPeak).toBe(12);
  });
});

describe("freeClimbBoardOccupied", () => {
  beforeEach(() => {
    resetStore();
  });

  it("is true only when that board has a row", async () => {
    await save("drew", "desktop", 40);
    expect(await freeClimbBoardOccupied("desktop")).toBe(true);
    expect(await freeClimbBoardOccupied("mobile")).toBe(false);
  });

  it("probe returns null when the occupancy read throws", async () => {
    const original = fakePrisma.climbRecord.findFirst;
    fakePrisma.climbRecord.findFirst = async () => {
      throw new Error("db down");
    };
    try {
      expect(await probeFreeClimbBoardOccupied("desktop")).toBeNull();
    } finally {
      fakePrisma.climbRecord.findFirst = original;
    }
  });
});

async function save(
  userId: string,
  board: ClimbBoard,
  peakY: number
): Promise<Awaited<ReturnType<typeof recordClimb>>> {
  const input: ClimbResultInput = {
    userId,
    peakY,
    finished: false,
    finishedTick: 100,
    seed: "s",
    board,
  };
  return recordClimb(input);
}
