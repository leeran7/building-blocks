/**
 * Paid-queue collusion guard — unit tests for the pure/mockable pieces.
 *
 * hashIp and filterSameIpCandidates have real runtime behavior worth pinning
 * (unlike the JoinPaidCode->HTTP mapping, which TypeScript's Record<...> type
 * already makes exhaustive at compile time). Redis is mocked; this does not
 * exercise the real TTL or network behavior.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const mget = vi.fn();
const set = vi.fn();
vi.mock("../lib/redis", () => ({
  getRedis: () => ({ mget, set }),
}));

import { hashIp, filterSameIpCandidates, rememberRoomCreatorIp } from "../lib/paidDuelCollusion";

describe("hashIp", () => {
  it("is deterministic for the same IP", () => {
    expect(hashIp("203.0.113.7")).toBe(hashIp("203.0.113.7"));
  });

  it("differs for different IPs", () => {
    expect(hashIp("203.0.113.7")).not.toBe(hashIp("203.0.113.8"));
  });

  it("never returns the raw IP", () => {
    const ip = "203.0.113.7";
    expect(hashIp(ip)).not.toContain(ip);
  });
});

describe("filterSameIpCandidates", () => {
  beforeEach(() => {
    mget.mockReset();
    set.mockReset();
  });

  it("drops candidates whose stored hash matches the joiner's", async () => {
    const joinerHash = hashIp("203.0.113.7");
    const candidates = [{ id: "a" }, { id: "b" }, { id: "c" }];
    mget.mockResolvedValue([joinerHash, "some-other-hash", null]);

    const result = await filterSameIpCandidates(candidates, joinerHash);

    expect(result.map((c) => c.id)).toEqual(["b", "c"]);
  });

  it("keeps every candidate when none share the joiner's IP", async () => {
    const candidates = [{ id: "a" }, { id: "b" }];
    mget.mockResolvedValue(["hash-x", "hash-y"]);

    const result = await filterSameIpCandidates(candidates, hashIp("203.0.113.7"));

    expect(result).toHaveLength(2);
  });

  it("fails open (returns candidates unchanged) when Redis errors", async () => {
    const candidates = [{ id: "a" }, { id: "b" }];
    mget.mockRejectedValue(new Error("redis down"));

    const result = await filterSameIpCandidates(candidates, hashIp("203.0.113.7"));

    expect(result).toEqual(candidates);
  });

  it("short-circuits on an empty candidate list without calling Redis", async () => {
    const result = await filterSameIpCandidates([], hashIp("203.0.113.7"));
    expect(result).toEqual([]);
    expect(mget).not.toHaveBeenCalled();
  });
});

describe("rememberRoomCreatorIp", () => {
  it("swallows Redis errors — the guard must fail open, never break room creation", async () => {
    set.mockRejectedValue(new Error("redis down"));
    await expect(rememberRoomCreatorIp("duel1", hashIp("203.0.113.7"))).resolves.toBeUndefined();
  });
});
