/**
 * Climb board allow-list: mobile is the default, desktop is opt-in, anything
 * else is rejected (null) so a write path can 400 instead of coercing.
 */

import { describe, it, expect } from "vitest";
import {
  DEFAULT_CLIMB_BOARD,
  parseClimbBoard,
  climbBoardPath,
  climbBoardFromPointer,
} from "../../src/game/climbBoard";

describe("parseClimbBoard", () => {
  it("accepts the two boards", () => {
    expect(parseClimbBoard("mobile")).toBe("mobile");
    expect(parseClimbBoard("desktop")).toBe("desktop");
  });

  it("returns null for unknown, wrong-case, and non-string values", () => {
    expect(parseClimbBoard("Desktop")).toBeNull();
    expect(parseClimbBoard("MOBILE")).toBeNull();
    expect(parseClimbBoard("tablet")).toBeNull();
    expect(parseClimbBoard("")).toBeNull();
    expect(parseClimbBoard(" mobile")).toBeNull();
    expect(parseClimbBoard(0)).toBeNull();
    expect(parseClimbBoard(["desktop"])).toBeNull();
    expect(parseClimbBoard({ board: "desktop" })).toBeNull();
  });
});

describe("climbBoardPath", () => {
  it("keeps the default board on a clean URL", () => {
    expect(DEFAULT_CLIMB_BOARD).toBe("mobile");
    expect(climbBoardPath("mobile")).toBe("/climb");
  });

  it("puts desktop on an explicit query so it cannot collide with mobile", () => {
    expect(climbBoardPath("desktop")).toBe("/climb?board=desktop");
  });
});

describe("climbBoardFromPointer", () => {
  it("maps coarse pointer (touch fill-stage) to mobile", () => {
    expect(climbBoardFromPointer(true)).toBe("mobile");
  });

  it("maps fine pointer (keyboard 9:16) to desktop", () => {
    expect(climbBoardFromPointer(false)).toBe("desktop");
  });
});
