import { describe, expect, it } from "vitest";
import {
  decodeRunReplay,
  encodeRunReplay,
  packInput,
  packInputLog,
  unpackInput,
  unpackInputLog,
} from "../../src/game/runReplay";
import { NO_INPUT, PlayerInput } from "../../src/game/types";

describe("runReplay packing", () => {
  const cases: PlayerInput[] = [
    NO_INPUT,
    { moveX: -1, jump: false, climbY: 0, usePowerUp: false },
    { moveX: 1, jump: true, climbY: 1, usePowerUp: false },
    { moveX: 0, jump: false, climbY: -1, usePowerUp: false },
  ];

  it("round-trips every sample input through one byte", () => {
    for (const input of cases) {
      expect(unpackInput(packInput(input))).toEqual(input);
    }
  });

  it("round-trips an input log", () => {
    const log = Array.from({ length: 120 }, (_, i) =>
      i % 3 === 0 ? { moveX: 1 as const, jump: i % 9 === 0, climbY: 0 as const, usePowerUp: false } : NO_INPUT
    );
    expect(unpackInputLog(packInputLog(log))).toEqual(log);
  });
});

describe("runReplay encode/decode", () => {
  it("round-trips a short run through a share token", async () => {
    const inputs = Array.from({ length: 300 }, (_, i) =>
      i % 5 === 0
        ? { moveX: 1 as const, jump: false, climbY: 1 as const, usePowerUp: false }
        : NO_INPUT
    );
    const token = await encodeRunReplay({ seed: "share-seed-42", peakY: 128.4, inputs });
    expect(token).toBeTruthy();
    const decoded = await decodeRunReplay(token!);
    expect(decoded).toEqual({
      version: 1,
      seed: "share-seed-42",
      peakY: 128.4,
      inputs,
    });
  });

  it("rejects empty logs and malformed tokens", async () => {
    expect(await encodeRunReplay({ seed: "x", peakY: 1, inputs: [] })).toBeNull();
    expect(await decodeRunReplay("not-a-token")).toBeNull();
    expect(await decodeRunReplay("")).toBeNull();
  });
});
