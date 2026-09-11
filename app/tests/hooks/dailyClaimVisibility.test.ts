/**
 * dailyClaimVisibility tests.
 *
 * The claim button must vanish the moment the daily grant's been claimed today,
 * and neither the button nor the "claimed today" note may flash during the
 * initial /api/wallet load (server eligibility still unknown = null).
 */

import { describe, it, expect } from "vitest";
import { dailyClaimVisibility } from "../../src/hooks/useClaimDailyChips";

describe("dailyClaimVisibility", () => {
  it("shows the claim button only when the grant is confirmed available", () => {
    expect(dailyClaimVisibility(true, "idle")).toEqual({
      showClaim: true,
      claimedToday: false,
    });
  });

  it("hides the button and marks claimed when the server says it's been claimed", () => {
    expect(dailyClaimVisibility(false, "idle")).toEqual({
      showClaim: false,
      claimedToday: true,
    });
  });

  it("hides the button immediately after claiming this session, before refetch", () => {
    expect(dailyClaimVisibility(true, "claimed")).toEqual({
      showClaim: false,
      claimedToday: true,
    });
  });

  it("hides the button when a claim raced and came back already-claimed", () => {
    expect(dailyClaimVisibility(true, "already-claimed")).toEqual({
      showClaim: false,
      claimedToday: true,
    });
  });

  it("shows neither button nor note while eligibility is still loading (null)", () => {
    expect(dailyClaimVisibility(null, "idle")).toEqual({
      showClaim: false,
      claimedToday: false,
    });
  });

  it("keeps the button up while a claim is in flight", () => {
    expect(dailyClaimVisibility(true, "claiming")).toEqual({
      showClaim: true,
      claimedToday: false,
    });
  });
});
