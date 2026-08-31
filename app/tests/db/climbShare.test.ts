/**
 * AC-3, AC-5, AC-6, AC-7 (DTO) — invoke recordClimb / getShareableClimbRun
 * with a Prisma stand-in. Proves allow-list mapping and null-token 404.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  return {
    ...actual,
    cache: <T extends (...args: never[]) => unknown>(fn: T) => fn,
  };
});

const findUnique = vi.fn();
const create = vi.fn();
const recordFindUnique = vi.fn();
const recordUpsert = vi.fn();
const recordCount = vi.fn();
const userFindUnique = vi.fn();

vi.mock("../../src/db/client", () => ({
  prisma: {
    climbRun: {
      findUnique,
      create,
    },
    climbRecord: {
      findUnique: recordFindUnique,
      upsert: recordUpsert,
      count: recordCount,
    },
    user: {
      findUnique: userFindUnique,
    },
  },
}));

import { getShareableClimbRun, recordClimb } from "../../src/db/climb";
import { parseRecordingId } from "../../src/share/parseRecordingId";

describe("getShareableClimbRun (AC-5, AC-6, AC-7)", () => {
  beforeEach(() => {
    findUnique.mockReset();
  });

  it("returns null for an unknown row (AC-5)", async () => {
    findUnique.mockResolvedValue(null);
    expect(await getShareableClimbRun("rec_missing")).toBeNull();
  });

  it("returns null when replay_token is null (AC-6)", async () => {
    findUnique.mockResolvedValue({
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
    expect(findUnique).not.toHaveBeenCalled();
  });

  it("maps an allow-list DTO without token/seed (AC-13 DTO half)", async () => {
    findUnique.mockResolvedValue({
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
    findUnique.mockResolvedValue({
      id: "rec_test_1",
      peak_y: 50,
      replay_token: "tok",
      userId: "user-1",
      user: { display_name: "maya@evil.com" },
    });
    const dto = await getShareableClimbRun("rec_test_1");
    expect(dto).not.toBeNull();
    expect(dto?.handle).not.toMatch(/@/);
    expect(dto?.handle).not.toBe("maya@evil.com");
  });
});

describe("recordClimb return (AC-3)", () => {
  beforeEach(() => {
    create.mockReset();
    recordFindUnique.mockReset();
    recordUpsert.mockReset();
    recordCount.mockReset();
    userFindUnique.mockReset();
  });

  it("includes existing keys plus additive runId", async () => {
    create.mockResolvedValue({ id: "rec_saved_1" });
    recordFindUnique.mockResolvedValue(null);
    recordUpsert.mockResolvedValue({});
    recordCount.mockResolvedValue(0);
    userFindUnique.mockResolvedValue({ display_name: "Maya" });

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
