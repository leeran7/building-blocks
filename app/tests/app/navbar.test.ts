/**
 * Navbar destinations. The Free climb control must land on the game (/play),
 * not the landing-page teaser (#free). The 1v1 control (surfaced in both the
 * desktop navbar and the AccountMenu mobile block) must land on the duel home.
 */

import { describe, it, expect } from "vitest";
import { FREE_CLIMB_HREF, DUEL_HREF } from "../../src/components/navLinks";

describe("navbar Free climb", () => {
  it("points at the playable game", () => {
    expect(FREE_CLIMB_HREF).toBe("/play");
    expect(FREE_CLIMB_HREF).not.toContain("#");
  });
});

describe("navbar 1v1", () => {
  it("points at the duel home, not a landing teaser", () => {
    expect(DUEL_HREF).toBe("/duel");
    expect(DUEL_HREF).not.toContain("#");
  });
});
