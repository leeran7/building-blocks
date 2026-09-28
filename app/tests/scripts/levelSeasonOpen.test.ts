/**
 * `pnpm levels:season:open` (scripts/levelSeasonOpen.ts): the row that
 * switches a level season on, and its refusals.
 */

import { describe, expect, it } from "vitest";

import { seasonOpenPlan } from "../../scripts/levelSeasonOpen";
import { LEVEL_SIM_VERSION } from "../../src/game/simVersion";

const AT = new Date("2026-09-28T00:00:00Z");

describe("seasonOpenPlan", () => {
  it("switches season 1 on with its manifest's name and the server's engine", () => {
    expect(seasonOpenPlan(1, AT)).toEqual({
      id: 1,
      name: "Season 1",
      startsAt: AT,
      minLevelSimVersion: LEVEL_SIM_VERSION,
      sql:
        "INSERT INTO level_seasons (id, name, starts_at, min_level_sim_version)\n" +
        `VALUES (1, 'Season 1', '2026-09-28T00:00:00.000Z', ${LEVEL_SIM_VERSION})\n` +
        "ON CONFLICT (id) DO NOTHING;",
    });
  });

  it("refuses a season with no manifest, a bad id or a bad time", () => {
    expect(seasonOpenPlan(2, AT)).toEqual({ problems: ["no season spec for season 2"] });
    expect(seasonOpenPlan(Number.NaN, AT)).toHaveProperty("problems");
    expect(seasonOpenPlan(0, AT)).toHaveProperty("problems");
    expect(seasonOpenPlan(1, new Date("nope"))).toEqual({ problems: ["bad --at time"] });
  });
});
