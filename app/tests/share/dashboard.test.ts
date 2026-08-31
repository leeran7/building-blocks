/**
 * AC-29, AC-30 — dashboard share URL / actions.
 */

import { describe, expect, it } from "vitest";
import {
  buildDashboardShareActions,
  buildDashboardShareUrl,
} from "../../src/share/dashboard";
import { PROD_ORIGIN } from "./fixtures";

describe("buildDashboardShareUrl (AC-29)", () => {
  it("uses /r/{id} with production origin, not /play?r={token}", () => {
    const url = buildDashboardShareUrl(PROD_ORIGIN, {
      id: "rec_test_1",
      replayToken: "huge-replay-token-value",
    });
    expect(url).toBe("https://www.doomstack.lol/r/rec_test_1");
    expect(url).not.toContain("/play?r=");
    expect(url).not.toContain("huge-replay-token-value");
  });
});

describe("buildDashboardShareActions (AC-30)", () => {
  it("returns no platform or canonical copy actions when replayToken is null", () => {
    const actions = buildDashboardShareActions(
      { id: "rec_test_1", peakY: 100, replayToken: null },
      PROD_ORIGIN
    );
    expect(actions).toEqual([]);
    expect(actions.some((a) => a.id === "X" || a.id === "TIKTOK" || a.id === "YOUTUBE")).toBe(
      false
    );
    expect(actions.some((a) => a.id === "COPY_LINK")).toBe(false);
    expect(buildDashboardShareUrl(PROD_ORIGIN, { id: "rec_test_1", replayToken: null })).toBeNull();
  });

  it("returns platform actions when replayToken is set", () => {
    const actions = buildDashboardShareActions(
      { id: "rec_test_1", peakY: 100, replayToken: "tok" },
      PROD_ORIGIN
    );
    expect(actions.map((a) => a.id)).toEqual(["X", "TIKTOK", "YOUTUBE", "COPY_LINK"]);
    const copy = actions.find((a) => a.id === "COPY_LINK");
    if (!copy || copy.id !== "COPY_LINK") throw new Error("expected copy");
    expect(copy.text).toBe("https://www.doomstack.lol/r/rec_test_1");
    expect(copy.text).not.toContain("/play?r=");
  });
});
