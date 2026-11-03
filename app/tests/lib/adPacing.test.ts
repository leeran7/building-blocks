import { describe, expect, it } from "vitest";

import { INTERSTITIAL_EVERY_RUNS, INTERSTITIAL_GRACE_MS, createInterstitialPacer } from "../../src/lib/adPacing";

const START = 1_000_000;
const AFTER_GRACE = START + INTERSTITIAL_GRACE_MS;

/** Presses Play again `n` times and returns each answer. */
function presses(pacer: ReturnType<typeof createInterstitialPacer>, n: number, now: number, adFree = false): boolean[] {
  return Array.from({ length: n }, () => pacer.playAgain(now, adFree));
}

describe("interstitial pacing", () => {
  it("asks for an ad on every third Play again once the grace period is over", () => {
    const pacer = createInterstitialPacer(START);
    const answers = presses(pacer, INTERSTITIAL_EVERY_RUNS, AFTER_GRACE);
    expect(answers).toEqual([false, false, true]);
  });

  it("starts counting again after an ad plays", () => {
    const pacer = createInterstitialPacer(START);
    presses(pacer, INTERSTITIAL_EVERY_RUNS, AFTER_GRACE);
    pacer.adShown();
    expect(presses(pacer, INTERSTITIAL_EVERY_RUNS, AFTER_GRACE)).toEqual([false, false, true]);
  });

  it("keeps asking when the requested ad never played (no fill)", () => {
    const pacer = createInterstitialPacer(START);
    presses(pacer, INTERSTITIAL_EVERY_RUNS, AFTER_GRACE);
    expect(pacer.playAgain(AFTER_GRACE, false)).toBe(true);
  });

  it("shows nothing in the first three minutes, however many runs", () => {
    const pacer = createInterstitialPacer(START);
    expect(presses(pacer, 10, AFTER_GRACE - 1)).not.toContain(true);
    // The runs during the grace period still count toward the first ad.
    expect(pacer.playAgain(AFTER_GRACE, false)).toBe(true);
  });

  it("never shows an ad to a player who has bought gems", () => {
    const pacer = createInterstitialPacer(START);
    expect(presses(pacer, 10, AFTER_GRACE, true)).not.toContain(true);
  });
});
