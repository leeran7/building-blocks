/**
 * Navbar destinations. The Free climb control must land on the game (/play),
 * not the landing-page teaser (#free).
 */

import { describe, it, expect } from "vitest";
import { FREE_CLIMB_HREF } from "../../src/components/navLinks";

describe("navbar Free climb", () => {
  it("points at the playable game", () => {
    expect(FREE_CLIMB_HREF).toBe("/play");
    expect(FREE_CLIMB_HREF).not.toContain("#");
  });
});
