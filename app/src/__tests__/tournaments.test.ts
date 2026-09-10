import { describe, it, expect } from "vitest";
import {
  isValidBracketSize,
  totalRounds,
  TOURNAMENT_BRACKET_SIZES,
} from "../config/tournaments";

describe("isValidBracketSize", () => {
  it("accepts exactly the configured bracket sizes", () => {
    for (const size of TOURNAMENT_BRACKET_SIZES) {
      expect(isValidBracketSize(size)).toBe(true);
    }
  });

  it("rejects anything off the list", () => {
    expect(isValidBracketSize(0)).toBe(false);
    expect(isValidBracketSize(3)).toBe(false);
    expect(isValidBracketSize(5)).toBe(false);
    expect(isValidBracketSize(6)).toBe(false);
    expect(isValidBracketSize(10)).toBe(false);
    expect(isValidBracketSize(64)).toBe(false);
    expect(isValidBracketSize(-4)).toBe(false);
  });
});

describe("totalRounds", () => {
  it("returns log2 of the bracket size", () => {
    expect(totalRounds(4)).toBe(2);
    expect(totalRounds(8)).toBe(3);
    expect(totalRounds(16)).toBe(4);
    expect(totalRounds(32)).toBe(5);
  });
});
