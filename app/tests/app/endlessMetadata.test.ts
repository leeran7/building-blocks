import { describe, expect, it, vi } from "vitest";

// The pages read the DB at request time; metadata is static, so stub the reads.
vi.mock("../../src/db/climb", () => ({ topFreeClimbers: vi.fn() }));

describe("Endless page metadata", () => {
  it("names the solo board Endless in the /climb tab title", async () => {
    const { metadata } = await import("../../app/climb/page");
    expect(metadata.title).toBe("Endless Leaderboard — Doomstack");
    expect(String(metadata.description)).not.toMatch(/free climb/i);
  });

  it("names the solo mode Endless in the /play tab title", async () => {
    const { metadata } = await import("../../app/play/page");
    expect(metadata.title).toBe("Play Endless — Doomstack");
    expect(String(metadata.description)).not.toMatch(/free climb/i);
  });
});
