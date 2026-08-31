/**
 * AC-3, AC-5, AC-6, AC-7 (DTO) — invoke recordClimb / getShareableClimbRun
 * with a Prisma stand-in. Proves allow-list mapping and null-token 404.
 *
 * `react.cache` is not a function in vitest's node `react` build; identity-mock
 * it so this file can import climb.ts. Existing climbRecord.test.ts still loads
 * the unmocked module and will fail until production guards cache.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMocks = vi.hoisted(() => ({
  findUnique: vi.fn(),
  create: vi.fn(),
  recordFindUnique: vi.fn(),
  recordUpsert: vi.fn(),
  recordCount: vi.fn(),
  userFindUnique: vi.fn(),
}));

vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  return {
    ...actual,
    cache: <T extends (...args: never[]) => unknown>(fn: T) => fn,
  };
});

vi.mock("../../src/db/client", () => ({
  prisma: {
    climbRun: {
      findUnique: prismaMocks.findUnique,
      create: prismaMocks.create,
    },
    climbRecord: {
      findUnique: prismaMocks.recordFindUnique,
      upsert: prismaMocks.recordUpsert,
      count: prismaMocks.recordCount,
    },
    user: {
      findUnique: prismaMocks.userFindUnique,
    },
  },
}));

import { getShareableClimbRun, recordClimb } from "../../src/db/climb";
import { parseRecordingId } from "../../src/share/parseRecordingId";

describe("getShareableClimbRun (AC-5, AC-6, AC-7)", () => {
  beforeEach(() => {
    prismaMocks.findUnique.mockReset();
  });

  it("returns null for an unknown row (AC-5)", async () => {
    prismaMocks.findUnique.mockResolvedValue(null);
    expect(await getShareableClimbRun("rec_missing")).toBeNull();
  });

  it("returns null when replay_token is null (AC-6)", async () => {
    prismaMocks.findUnique.mockResolvedValue({
      id: "rec_notoken",
      peak_y: 100,
      replay_token: null,
      userId: "user-1",
      user: { display_name: "Maya" },
      seed: "must-not-leak",
    });
    expect(await getShareableClimbRun("rec_notoken")).toBeNull();
  });

  it("does not hit the DB for a parser-rejected id (AC-7)", async () => {
    expect(parseRecordingId("..")).toBeNull();
    expect(await getShareableClimbRun("..")).toBeNull();
    expect(prismaMocks.findUnique).not.toHaveBeenCalled();
  });

  it("maps an allow-list DTO without token/seed (AC-13 DTO half)", async () => {
    prismaMocks.findUnique.mockResolvedValue({
      id: "rec_test_1",
      peak_y: 100,
      replay_token: "SECRET_REPLAY_TOKEN",
      userId: "user-1",
      user: { display_name: "Maya" },
      seed: "secret-seed",
    });
    const dto = await getShareableClimbRun("rec_test_1");
    expect(dto).toEqual({
      id: "rec_test_1",
      peakY: 100,
      handle: "Maya",
    });
    const json = JSON.stringify(dto);
    expect(json).not.toContain("SECRET_REPLAY_TOKEN");
    expect(json).not.toContain("secret-seed");
    expect(json).not.toContain("replay_token");
    expect(dto && "seed" in dto).toBe(false);
  });

  it("never leaves an @ in handle", async () => {
    prismaMocks.findUnique.mockResolvedValue({
      id: "rec_test_1",
      peak_y: 50,
      replay_token: "tok",
      userId: "user-1",
      user: { display_name: "maya@evil.com" },
    });
    const dto = await getShareableClimbRun("rec_test_1");
    expect(dto).not.toBeNull();
    expect(dto?.handle === null || (dto?.handle != null && !/@/.test(dto.handle))).toBe(
      true
    );
    expect(dto?.handle).not.toBe("maya@evil.com");
  });
});

describe("recordClimb return (AC-3)", () => {
  beforeEach(() => {
    prismaMocks.create.mockReset();
    prismaMocks.recordFindUnique.mockReset();
    prismaMocks.recordUpsert.mockReset();
    prismaMocks.recordCount.mockReset();
    prismaMocks.userFindUnique.mockReset();
  });

  it("includes existing keys plus additive runId", async () => {
    prismaMocks.create.mockResolvedValue({ id: "rec_saved_1" });
    prismaMocks.recordFindUnique.mockResolvedValue(null);
    prismaMocks.recordUpsert.mockResolvedValue({});
    prismaMocks.recordCount.mockResolvedValue(0);
    prismaMocks.userFindUnique.mockResolvedValue({ display_name: "Maya" });

    const result = await recordClimb({
      userId: "user-1",
      peakY: 120,
      finished: true,
      finishedTick: 500,
      seed: "saved-run",
      replayToken: "tok",
    });

    expect(result.peakY).toBe(120);
    expect(typeof result.improved).toBe("boolean");
    expect(typeof result.rank).toBe("number");
    expect(typeof result.totalClimbers).toBe("number");
    expect(typeof result.handle).toBe("string");
    expect(result.runId).toBe("rec_saved_1");
  });
});
